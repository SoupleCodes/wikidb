import { Context } from 'hono';
import { verify } from 'hono/jwt';

interface JwtPayload {
  user: string;
  id: number;
  role: string;
  exp: number;
}

export async function verifyToken(c: Context): Promise<JwtPayload | null> {
    const header = c.req.header('Authorization')
    const jwt = c.env.JWT_SECRET
    const authHeader = header
    if (!authHeader) {
      return null
    }

    const [bearer, token] = authHeader.split(' ')
    if (bearer !== 'Bearer' || !token) {
      return null;
    }

    try {
      const decoded = await verify(token, jwt)
      /*
      const { result } = await c.env.DB.prepare(`
          SELECT revoked_at FROM users
          WHERE LOWER(username) = ?
      `).bind(decoded.username).first()
      console.log(decoded.exp, result)
      if (result !== null && decoded.exp >= result) {
        return null;
      }
      */
      return decoded as unknown as JwtPayload
    } catch (error) {
      return null
    }
}