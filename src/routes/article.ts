import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'
import { addUserData } from '../util/data';
import { verifyToken } from '../util/auth';
import active from '../util/activity';

const article = new Hono<{ Bindings: Bindings }>();

article
  .use(trimTrailingSlash())
  .post('/', async (c) => {
    try {
      // Auth
      const decoded = await verifyToken(c)
      if (!decoded) {
        return c.json({ message: 'Unauthorized' }, 401)
      }
      
      const author = decoded.user
      const data: Article = await c.req.json();
      const { title, content } = data
      if (!title || !content) {
        throw new Error('Title or content is missing...');
      }

      const { success } = await c.env.DB.prepare(`
          INSERT INTO articles
            (title, author, subject, content, created_at, last_modified)
          VALUES
            (?, ?, ?, ?, ?, ?)
      `).bind(
          title,
          author,
          '',
          content,
          new Date().toISOString(),
          new Date().toISOString()
      ).run()
      if(!success) {
        throw new Error('Something went wrong with creating your article')
      }

      const { results } = await c.env.DB.prepare("SELECT last_insert_rowid() AS id").all();
      const newID = results[0].id;
      await active(c, decoded.user)
      return c.json({ message: 'Article created successfully', id: newID }, 201)
    } catch (error) {
      return c.json({ error: error });
    }
  })

  .post('/:id/comment', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const id = c.req.param('id')
    const data = await c.req.json();
    const { comment } = data
    if(!(comment && typeof comment === 'string')) {
      return c.json({ message: 'Invalid post data. Post must be a string' }, 400)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT 1 FROM articles WHERE id = ?
    `).bind(id).all()
    if(results.length === 0) {
      return c.json({ message: 'Article does not exist' }, 404)
    }

    try {
      const { success } = await c.env.DB.prepare(`
        INSERT INTO comments
          (origin_type, origin_id, commenter, created_at, content)
        VALUES
          (?, ?, ?, ?, ?)
      `).bind(
        'article',
        id,
        decoded.user,
        new Date().toISOString(),
        comment
      ).run()

      if(!success) {
        throw new Error('Something went wrong with creating your comment')
      }
      await active(c, decoded.user)

      return c.json({ message: 'Comment created successfully' }, 201)
    } catch (error) {
      return c.json({ message: 'Something went wrong with creating your comment' }, 500)
    }
  })

  .get('/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const { results } = await c.env.DB.prepare(`
          SELECT * FROM articles WHERE id = ?
      `).bind(id).all();

      // Add one view
      c.env.DB.prepare(`
          UPDATE articles SET view_count = view_count + 1 WHERE id = ?
      `).bind(id).run()
      return c.json(results[0]);
    } catch (error) {
      return c.json({ message: 'Article does not exist' }, 404);
    }
  })

  .get('/featured', async (c) => {
    try {
      const { results } = await c.env.DB.prepare(`
          SELECT * FROM articles WHERE featured = 1
      `).all()
      return c.json(results);
    } catch (error) {
      return c.json({ message: 'No featured article found!' }, 404)
    }
  })

  .get('/popular', async (c) => {
    try {
      const { results } = await c.env.DB.prepare(`
          SELECT * FROM articles ORDER BY view_count DESC LIMIT 10
      `).all()
      return c.json(results);
    } catch (error) {
      return c.json({ message: 'No articles found!' }, 404)
    }
  })

  .get('/:id/comments', async (c) => {
    const id = c.req.param('id');
    try {
      const { results }: { results: Comment[] } = await c.env.DB.prepare(`
          SELECT * FROM comments WHERE origin_type = ? AND origin_id = ?
          ORDER BY created_at ASC
      `).bind('article', id).all();

      let comments = await addUserData(results, c.env.DB)
      return c.json(comments);
    } catch (error) {
      return c.json({ message: 'Article does not exist' }, 404);
    }
  })

  .get('/:id/comments/:commentID', async (c) => {
    const id = c.req.param('id');
    const commentID = c.req.param('commentID');

    try {
      const { results } = await c.env.DB.prepare(`
          SELECT * FROM comments WHERE origin_type = ? AND origin_id = ? AND id = ?
          ORDER BY created_at ASC
      `).bind('article', id, commentID).all();
      return c.json(results);
    } catch (error) {
      return c.json({ message: 'C does not exist' }, 404);
    }
  })

  .get('/:id/history', async (c) => {
    const id = c.req.param('id');
    try {
      const { results } = await c.env.DB.prepare(`
          SELECT * FROM edit_history WHERE article_id = ?
      `).bind(id).all();
      return c.json(results);
    } catch (error) {
      return c.json({ message: 'Article does not exist' }, 404);
    }
  })

  .get('/:id/history/:version', async (c) => {
    const id = c.req.param('id');
    const version = c.req.param('version');
    try {
      const { results } = await c.env.DB.prepare(`
          SELECT * FROM edit_history WHERE article_id = ? AND id = ?
      `).bind(id, version).all();
      return c.json(results);
    } catch (error) {
      return c.json({ message: 'Article does not exist' }, 404);
    }
  })

  .get('/random', async (c) => {
    try {
      const { results } = await c.env.DB.prepare(`
          SELECT * FROM articles ORDER BY RANDOM() LIMIT 1
      `).all()

      return c.json(results[0]);
    } catch (error) {
      return c.json({ message: 'No article found!' }, 404);
    }
  })

  .patch('/:id', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const id = c.req.param('id')
    const data: Article = await c.req.json();
    let { title, content, subject } = data

    if(!title && !content && !subject) {
      return c.json({ message: 'No data to update'}, 400)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM articles WHERE id = ?
    `).bind(id).all()

    if(results.length === 0) {
      return c.json({ message: 'Article does not exist' }, 404)
    }

    const article: Article = results[0] as unknown as Article

    if(!title) title = article.title
    if(!content) content = article.content
    if(!subject) subject = article.subject
    if(article.author !== decoded.user) {
      return c.json({ message: 'You are not the author of this blog' }, 403)
    }

    // Record article history
    const historySuccess = await c.env.DB.prepare(`
        INSERT INTO edit_history
          (article_id, editor, edit_date, edit_content, old_content)
        VALUES
          (?, ?, ?, ?, ?)
    `).bind(
      id,
      decoded.user,
      new Date().toISOString(),
      content,
      article.content
    ).run()
    if(!historySuccess) {
      throw new Error('Something went wrong with appending your article history')
    }

    try {
      const { success } = await c.env.DB.prepare(`
        UPDATE articles SET
          title = ?,
          subject = ?,
          content = ?,
          last_modified = ?
        WHERE id = ?
      `).bind(
        title,
        subject,
        content,
        new Date().toISOString(),
        id
      ).run()

      if(!success) {
        throw new Error('Something went wrong with updating your article')
      }
      await active(c, decoded.user)

      return c.json({ message: 'Article updated successfully' }, 200)
    } catch (error) {
      return c.json({ message: 'Something went wrong with updating your article' }, 500)
    }
  })

  .delete('/:id', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }
    
    const id = c.req.param('id')
    try {
      const { success: result } = await c.env.DB.prepare(`
        SELECT author FROM articles WHERE id = ?
      `).bind(id).all()

      if(result) {
        return c.json({ message: 'Article does not exist' }, 404)
      }

      const article: Article = result[0] as unknown as Article
      if(article.author !== decoded.user) {
        return c.json({ message: 'You are not the author of this article' }, 403)
      }

      const { success } = await c.env.DB.prepare(`
        DELETE FROM articles WHERE id = ?
      `).bind(id).run()

      if(!success) {
        throw new Error('Something went wrong with deleting your article')
      }
      await active(c, decoded.user)

      return c.json({ message: 'Article deleted successfully' }, 200)
    } catch (error) {
      return c.json({ message: 'Article does not exist' }, 404);
    }
  })

export default article;