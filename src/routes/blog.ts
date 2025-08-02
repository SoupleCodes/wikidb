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
        rest.tags = parseIfArray(rest.tags as string)
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
                (title, author, content, parent, part, description, creation_date, last_modified, tags, comments_enabled, thumbnail_url, style, includeglobal, music)
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
            rest.tags,
            rest.comments_enabled || 1,
            rest.thumbnail_url,
            rest.style,
            rest.includeglobal,
            rest.music
        ).run()
        if(!success) {
            throw new Error('Failed to submit blog')
        }
        const { results } = await c.env.DB.prepare("SELECT last_insert_rowid() AS id").all();
        const newID = results[0].id;
        return c.json({ message: 'Blog created successfully', id: newID }, 201)
    } catch (error) {
        return c.json({ message: 'Failed to submit blog', error: error });
    }
})

export default blog