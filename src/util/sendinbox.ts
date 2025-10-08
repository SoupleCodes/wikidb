import { Context } from "hono";
import { verifyToken } from '../util/auth';

export default async function sendInbox(c: Context, mail_type: string, content: string, origin_type: string, origin_id: number | string, sender: string, recipient: string, comment_id?: number) {
    console.log('Sending inbox....')

    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      throw new Error('Unauthorized')
    }

    // A few checks
    if (!mail_type || !content || !origin_type || !origin_id || !sender || !recipient) {
        throw new Error('Missing mailtype, content, sender, recipient, origin_type or origin_id')
    }
    if (mail_type === 'comment' && !comment_id) {
        throw new Error('Mailtype of comment needs to having corresponding comment_id')
    }
    /*
    if (sender === recipient) {
        throw new Error('You can\'t send a message to yourself')
    }
    */

    try {
        await c.env.DB.prepare(`
            INSERT INTO inbox
                (sender, recipient, mail_type, content, created_at, read_status, origin_type, origin_id, comment_id)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            sender,
            recipient,
            mail_type,
            content,
            new Date().toISOString(),
            0,
            origin_type,
            origin_id,
            comment_id || ''
        ).run()
    } catch (error) {
        console.log('Failure to send inbox. ' + error)
        throw new Error('Failure to send into inbox. ' + error)
    }
}