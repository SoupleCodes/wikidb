import { Context } from "hono";

export default async function active(c: Context, username: string) {
    await c.env.DB.prepare(`
        UPDATE users
        SET last_activity = ?
        WHERE LOWER(username) = ?
    `).bind(new Date().toISOString(), username.toLowerCase()).run()
}