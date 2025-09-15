import { Context } from "hono";
import { verifyToken } from '../util/auth';

export default async function sendinbox(c: Context, mail_type: string, content: string, origin_type: string, origin_id: number | string, sender: string, comment_id?: number) {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    // A few checks
    if (!mail_type || !content || !origin_type || origin_id || sender) {
        return c.json({ message: 'Missing mailtype, content, sender, origin_type or origin_id' }, 400)
    }
    if (mail_type === 'comment' && !comment_id) {
        return c.json({ message: 'Mailtype of comment needs to having corresponding comment_id' }, 400)
    }
    if (decoded.user === sender) {
        return c.json({ message: 'You can\'t send a message to yourself' }, 400)
    }

    try {
        await c.env.DB.prepare(`
            INSERT INTO inbox
                (sender, recipient, mail_type, content, created_at, read_status, origin_type, origin_id, comment_id)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            sender,
            decoded.user,
            mail_type,
            content,
            new Date().toISOString(),
            0,
            origin_type,
            origin_id,
            comment_id || ''
        ).run()
    } catch (error) {
        return c.json({ message: 'Failure to send message' }, 500)
    }
}