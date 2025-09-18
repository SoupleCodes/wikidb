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
            ORDER BY a.id DESC
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

  .get('/blogs/:page', async (c) => {
    const { page } = c.req.param()
    const offset = (parseInt(page) - 1) * 25

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT
              b.*,
              COUNT(c.origin_id) AS comment_count
            FROM blogs AS b
            LEFT JOIN comments AS c ON b.id = c.origin_id AND c.origin_type = 'blog'
            GROUP BY
              b.id
            ORDER BY b.id DESC
            LIMIT 25 OFFSET ?
        `).bind(offset).all()
        const { results: [{ total }] } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM blogs
        `).all()
        
        const totalPages = Math.ceil(Number(total) / 25);
        return c.json({
            blogs: results,
            totalPages,
            totalBlogs: total
        })
    } catch (error) {
        return c.json({ message: 'There was something wrong with getting all the blogs' }, 404)
    }
  })

  .get('/polls/:page', async (c) => {
    const { page } = c.req.param()
    const offset = (parseInt(page) - 1) * 25

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT
              p.*,
              COUNT(c.origin_id) AS comment_count
            FROM polls AS p
            LEFT JOIN comments AS c ON p.poll_id = c.origin_id AND c.origin_type = 'poll'
            GROUP BY
              p.poll_id
            ORDER BY p.poll_id DESC
            LIMIT 25 OFFSET ?
        `).bind(offset).all()
        console.log(results)

        for (const poll of results) {
          const { results: options } = await c.env.DB.prepare(`
            SELECT
               poll_options.option, COUNT(poll_votes.option_id) as votes
            FROM
              poll_options
            LEFT JOIN
              poll_votes
            ON
              poll_options.option_id = poll_votes.option_id
            WHERE
              poll_options.poll_id = ?
            GROUP BY
              poll_options.option_id, poll_options.option
          `).bind(poll.poll_id as any).all()

          poll.options = options
        }
        console.log(results)

        const { results: [{ total }] } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM polls
        `).all()
        
        const totalPages = Math.ceil(Number(total) / 25);
        return c.json({
            polls: results,
            totalPages,
            totalPolls: total
        })
    } catch (error) {
        return c.json({ message: 'There was something wrong with getting all the polls' }, 404)
    }
  })

  .get('/themes/:page', async (c) => {
    const { page } = c.req.param()
    const offset = (parseInt(page) - 1) * 25

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT
              t.*,
              COUNT(c.origin_id) AS comment_count
            FROM themes AS t
            LEFT JOIN comments AS c ON t.id = c.origin_id AND c.origin_type = 'theme'
            WHERE status != 'pending'
            GROUP BY
              t.id
            ORDER BY t.id DESC
            LIMIT 25 OFFSET ?
        `).bind(offset).all()
        const { results: [{ total }] } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM themes
        `).all()
        
        const totalPages = Math.ceil(Number(total) / 25);
        return c.json({
            themes: results,
            totalPages,
            totalThemes: total
        })
    } catch (error) {
        return c.json({ message: 'There was something wrong with getting all the themes' }, 404)
    }
  })

export default all