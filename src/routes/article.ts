import { Hono } from 'hono';

const article = new Hono<{ Bindings: Bindings }>();

article
  .post('/', async (c) => {
    try {
      const author = 'Souple'
      const data: Article = await c.req.json();
      const { title, content } = data
      if (!title || !content) {
        throw new Error('Title or content is missing...');
      }

      const { success } = await c.env.DB.prepare(`
          INSERT INTO articles
            (title, author, subject, content, creation_date, last_modified)
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
      return c.json({ message: 'Article created successfully', id: newID }, 201)
    } catch (error) {
      return c.json({ error: error });
    }
  })

  .post('/:id/comment', async (c) => {
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
          (origin_type, origin_id, commenter, comment_date, content)
        VALUES
          (?, ?, ?, ?)
      `).bind(
        'article',
        id,
        'Souple',
        new Date().toISOString(),
        comment
      ).run()

      if(!success) {
        throw new Error('Something went wrong with creating your comment')
      }

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
      return c.json(results);
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
      const { results } = await c.env.DB.prepare(`
          SELECT * FROM comments WHERE origin_type = ? AND origin_id = ?
          ORDER BY creation_date ASC
      `).bind('article', id).all();
      return c.json(results);
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
          ORDER BY creation_date ASC
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

      return c.json(results);
    } catch (error) {
      return c.json({ message: 'No article found!' }, 404);
    }
  })

  .patch('/:id', async (c) => {
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

    // Record article history
    const historySuccess = await c.env.DB.prepare(`
        INSERT INTO edit_history
          (article_id, editor, edit_date, edit_content, old_content)
        VALUES
          (?, ?, ?, ?, ?)
    `).bind(
      id,
      'Souple',
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

      return c.json({ message: 'Article updated successfully' }, 200)
    } catch (error) {
      return c.json({ message: 'Something went wrong with updating your article' }, 500)
    }
  })

  .delete('/:id', async (c) => {
    const id = c.req.param('id')
    try {
      const { success } = await c.env.DB.prepare(`
        DELETE FROM articles WHERE id = ?
      `).bind(id).run()

      if(!success) {
        throw new Error('Something went wrong with deleting your article')
      }

      return c.json({ message: 'Article deleted successfully' }, 200)
    } catch (error) {
      return c.json({ message: 'Article does not exist' }, 404);
    }
  })

export default article;