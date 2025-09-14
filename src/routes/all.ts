import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'

const all = new Hono<{ Bindings: Bindings }>();

all
  .use(trimTrailingSlash())
  .get('/articles/:page', async (c) => {
    const { page } = c.req.param()
    const offset = (parseInt(page) - 1) * 25

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT
              a.*,
              COUNT(c.origin_id) AS comment_count
            FROM articles AS a
            LEFT JOIN comments AS c ON a.id = c.origin_id AND c.origin_type = 'article'
            GROUP BY
              a.id
            ORDER BY a.created_at DESC
            LIMIT 25 OFFSET ?
        `).bind(offset).all()
        const { results: [{ total }] } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM articles
        `).all()
        
        const totalPages = Math.ceil(Number(total) / 25);
        return c.json({
            articles: results,
            totalPages,
            totalArticles: total
        })
    } catch (error) {
        return c.json({ message: 'There was something wrong with getting all the articles' }, 404)
    }
  })

export default all