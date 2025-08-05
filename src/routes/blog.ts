import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'
import { parseIfArray, parseIfJSON } from '../util/parse';
import { addUserData } from '../util/data';
import { verifyToken } from '../util/auth';

const blog = new Hono<{ Bindings: Bindings }>();

blog
  .use(trimTrailingSlash())
  .post('/', async (c) => {
    try {
        // Auth
        const decoded = await verifyToken(c)
        if (!decoded) {
          return c.json({ message: 'Unauthorized' }, 401)
        }

        const author = decoded.user
        const data: Blog = await c.req.json()

        const { title, content, ...rest } = data
        if (!title || !content) {
            throw new Error('Title or content is missing...');
        }

        // Tags
        rest.tags = parseIfArray(rest.tags as unknown as string)
        if (rest.tags.length > 0) {
            const checkAllString = rest.tags.every(tag => typeof tag === 'string')
            if (!checkAllString) {
                throw new Error('All tags must be strings')
            }
        }

        if (rest.music) {
            rest.music = parseIfJSON(rest.music as string)
            const musicObject = rest.music as unknown as Music
            if (typeof musicObject.artist_name !== 'string' || 
                typeof musicObject.song_name !== 'string' || 
                typeof musicObject.song_url !== 'string' || 
                typeof musicObject.published !== 'number' || 
                (musicObject.cover_art !== undefined && typeof musicObject.cover_art !== 'string') || 
                (musicObject.album !== undefined && typeof musicObject.album !== 'string')) {
                
                throw new Error("Music object must have artist_name, song_name, song_url, published, and cover_art with valid types.");
            }
        }

        const { success } = await c.env.DB.prepare(`
            INSERT INTO blogs
                (title, author, content, parent, part, description, created_at, last_modified, tags, comments_enabled, style, includeglobal, music)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            title,
            author,
            content,
            rest.parent,
            rest.part,
            rest.description,
            new Date().toISOString(),
            new Date().toISOString(),
            JSON.stringify(rest.tags),
            rest.comments_enabled || 1,
            rest.style,
            rest.includeglobal,
            JSON.stringify(rest.music)
        ).run()
        if(!success) {
            throw new Error('Failed to submit blog')
        }
        const { results } = await c.env.DB.prepare("SELECT last_insert_rowid() AS id").all();
        const newID = results[0].id;
        return c.json({ message: 'Blog created successfully', id: newID }, 201)
    } catch (error) {
        console.error(error);
        return c.json({ message: 'Failed to submit blog', error: error });
    }
  })

  .post('/:id/comment', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }
    
    const id = c.req.param('id')
    const data = await c.req.json()
    const { comment } = data
    if(!(comment && typeof comment === 'string')) {
      return c.json({ message: 'Invalid post data. Post must be a string' }, 400)
    }
  
    const { results } = await c.env.DB.prepare(`
      SELECT 1 FROM blogs WHERE id = ?
    `).bind(id).all()
    if(results.length === 0) {
      return c.json({ message: 'Blog does not exist' }, 404)
    }

    try {
        const { success } = await c.env.DB.prepare(`
          INSERT INTO comments
            (origin_type, origin_id, commenter, created_at, content)
          VALUES
            (?, ?, ?, ?, ?)
        `).bind(
          'blog',
          id,
          decoded.user,
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
          SELECT * FROM blogs WHERE id = ?
      `).bind(id).all();
      results[0].tags = parseIfArray(results[0].tags as unknown as string)
      results[0].music = parseIfJSON(results[0].music as unknown as string)
      
      // Add one view
      c.env.DB.prepare(`
          UPDATE blogs SET view_count = view_count + 1 WHERE id = ?
      `).bind(id).run()
      return c.json(results);
    } catch (error) {
      return c.json({ message: 'Blog does not exist' }, 404);
    }
  })
  
  .get('/:id/comments', async (c) => {
    const id = c.req.param('id');
    try {
      const { results }: { results: Comment[] } = await c.env.DB.prepare(`
          SELECT * FROM comments WHERE origin_type = ? AND origin_id = ?
          ORDER BY created_at ASC
      `).bind('blog', id).all();

      let comments = await addUserData(results, c.env.DB)
      return c.json(comments);
    } catch (error) {
      return c.json({ message: 'Blog does not exist' }, 404);
    }
  })

  .patch('/:id', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const id = c.req.param('id')
    const data: Blog = await c.req.json()
    let { title, content } = data

    if(!title && !content) {
      return c.json({ message: 'No data to update'}, 400)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT * FROM blogs WHERE id = ?
    `).bind(id).all()

    if(results.length === 0) {
      return c.json({ message: 'Blog does not exist' }, 404)
    }

    const blog: Blog = results[0] as unknown as Article

    if(!title) title = blog.title
    if(!content) content = blog.content
    if(blog.author !== decoded.user) {
      return c.json({ message: 'You are not the author of this blog' }, 403)
    }

    try {
      const { success } = await c.env.DB.prepare(`
        UPDATE blogs SET
          title = ?,
          content = ?,
          last_modified = ?
        WHERE id = ?
      `).bind(
        title,
        content,
        new Date().toISOString(),
        id
      ).run()

      if(!success) {
        throw new Error('Something went wrong with updating your blog')
      }      
    } catch (error) {
      return c.json({ message: 'Something went wrong with updating your blog' }, 500)
    }
  })

  .delete('/:id', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized or token expired' }, 401)
    }
    
    const id = c.req.param('id')
    try {
      const { success: result } = await c.env.DB.prepare(`
        SELECT author FROM blogs WHERE id = ?
      `).bind(id).all()

      if(!result) {
        return c.json({ message: 'Blog does not exist' }, 404)
      }

      const blog: Blog = result[0] as unknown as Blog
      if(blog.author !== decoded.user) {
        return c.json({ message: 'You are not the author of this blog' }, 403)
      }

      const { success } = await c.env.DB.prepare(`
        DELETE FROM blogs WHERE id = ?
      `).bind(id).run()

      if(!success) {
        throw new Error('Something went wrong with deleting your blog')
      }

      return c.json({ message: 'Blog deleted successfully' }, 200)
    } catch (error) {
      return c.json({ message: 'Blog does not exist' }, 404);
    }
  })

export default blog