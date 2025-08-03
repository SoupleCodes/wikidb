import { Hono } from 'hono';
import { parseIfArray, parseIfJSON } from '../util/parse';

const blog = new Hono<{ Bindings: Bindings }>();

blog
  .post('/', async (c) => {
    try {
        const author = 'Souple'
        const data: blogReqBody = await c.req.json()

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
                (title, author, content, parent, part, description, creation_date, last_modified, tags, comments_enabled, style, includeglobal, music)
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
            (origin_type, origin_id, commenter, comment_date, content)
          VALUES
            (?, ?, ?, ?)
        `).bind(
          'blog',
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

  .patch('/:id', async (c) => {
    const id = c.req.param('id')
    const data: blogReqBody = await c.req.json()
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

    const blog: blogReqBody = results[0] as unknown as Article

    if(!title) title = blog.title
    if(!content) content = blog.content

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

export default blog