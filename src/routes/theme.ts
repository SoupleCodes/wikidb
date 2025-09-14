import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'
import { verifyToken } from '../util/auth';
import { parseIfArray } from '../util/parse';
import active from '../util/activity';

const theme = new Hono<{ Bindings: Bindings }>()

theme
    .use(trimTrailingSlash())
    .post('/', async (c) => {
        try {
            // Auth
            const decoded = await verifyToken(c)
            if (!decoded) {
              return c.json({ message: 'Unauthorized' }, 401)
            }
            const author = decoded.user
            
            const data: Theme = await c.req.json()
            const { title, content, ...rest } = data
            console.log(data)

            if(!title || !(rest.layout_html || rest.layout_javascript || rest.layout_style)) {
                throw new Error('Title or layout (html or javascript or style) is missing')
            }

            rest.tags = parseIfArray(rest.tags as unknown as string)
            if (rest.tags.length > 0) {
                const checkAllString = rest.tags.every(tag => typeof tag === 'string')
                if (!checkAllString) {
                    throw new Error('All tags must be strings')
                }
            }

            const now = new Date().toISOString()
            await c.env.DB.prepare(`
                INSERT INTO THEMES
                    (title, author, thumbnail, tags, layout_html, layout_style, layout_javascript, content, created_at, last_modified)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                title,
                author,
                rest.thumbnail ?? null,
                JSON.stringify(rest.tags || []),
                rest.layout_html ?? null,
                rest.layout_style ?? null,
                rest.layout_javascript ?? null,
                content || '',
                now,
                now
            ).run()

            const { results } = await c.env.DB.prepare("SELECT last_insert_rowid() AS id").all();
            const newID = results[0].id;
            await active(c, decoded.user)
            return c.json({ message: 'Theme created successfully', id: newID }, 201)
        } catch (error) {
            console.error(error)
            return c.json({ message: 'Something went wrong submitting your theme' }, 500)
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
          SELECT 1 FROM themes WHERE id = ?
        `).bind(id).all()
        if(results.length === 0) {
          return c.json({ message: 'Theme does not exist' }, 404)
        }
    
        try {
            const { success } = await c.env.DB.prepare(`
              INSERT INTO comments
                (origin_type, origin_id, commenter, created_at, content)
              VALUES
                (?, ?, ?, ?, ?)
            `).bind(
              'theme',
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

export default theme

/*
curl -X POST \
  http://localhost:8787/theme \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer >>TOKEN_HERE<<" \
  -d '{
"title": "Blank theme",
"content": "turns ur page blank",
"thumbnail": null,
"tags": "[\"blank\"]",
"layout_html": "",
"layout_style": "display:none;"
}'
*/