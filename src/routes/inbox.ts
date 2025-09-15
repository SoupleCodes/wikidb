import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'
import { verifyToken } from '../util/auth';

const inbox = new Hono<{ Bindings: Bindings }>();

inbox
  .use(trimTrailingSlash())
  .get('/', async (c) => {
    try {
        // Auth
        const decoded = await verifyToken(c)
        if (!decoded) {
          return c.json({ message: 'Unauthorized' }, 401)
        }

        const { results: inbox } = await c.env.DB.prepare(`
            SELECT * FROM inbox WHERE recipient = ?
        `).bind(decoded.user).all()
        const { results: inbox_count } = await c.env.DB.prepare(`
            SELECT COUNT(*) as inbox_count FROM inbox WHERE recipient = ?
        `).bind(decoded.user).all()
        const { results: unread_count } = await c.env.DB.prepare(`
            SELECT COUNT(*) as inbox_count FROM inbox WHERE recipient = ? AND read_status = 1
        `).bind(decoded.user).all()

        return c.json({
            inbox,
            inbox_count,
            unread_count
        })
    } catch (error) {
        console.error(error)
        return c.json({ message: 'We had a problem gathering your inbox' }, 500)
    }
  })

export default inbox