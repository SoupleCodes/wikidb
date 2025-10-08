import { Hono } from 'hono'
import { decode, sign, verify } from 'hono/jwt'
import bcrypt = require("bcryptjs")
import { trimTrailingSlash } from 'hono/trailing-slash'
import { parseIfJSON, parseIfArray } from '../util/parse';
import { verifyToken } from '../util/auth';

const root = new Hono<{ Bindings: Bindings }>();

root
  .use(trimTrailingSlash())
  .post('/register', async (c) => {
    const data = await c.req.json()
    const { username, password } = data

    // Checks
    if (!username || !password) {
      return c.json({ message: 'Username or password is missing' }, 400)
    }
    if (username.length < 3) {
      return c.json({ message: 'Username is too short' }, 400)
    }
    const pattern = /^[a-zA-Z0-9_]+$/;
    if (!pattern.test(username)) {
      return c.json({ message: 'Username contains invalid characters. Only letters, numbers, and underscores are allowed.' }, 400)
    }
    const lowercaseUsername = username.toLowerCase()
    const { results: existingUser } = await c.env.DB.prepare(`
        SELECT * FROM users WHERE lowercase_username = ?
    `).bind(lowercaseUsername).all()
    if (existingUser.length > 0) {
        return c.json({ message: 'Username already exists. Sorry pal...' }, 400)
    }
    console.log('Username ' + username + ' is available')

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    // Create user
    const now = new Date().toISOString()
    const { success } = await c.env.DB.prepare(`
        INSERT INTO users (username, lowercase_username, display_name, password_hash, password_changed_at, created_at, last_activity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(username, lowercaseUsername, username, passwordHash, now, now, now).run()
    if(!success) {
        return c.json({ message: 'Failed to create user' }, 400)
    }

    return c.json({ message: 'Sucessfully registered user'}, 201)
  })

  .post('/login', async (c) => {
    const data = await c.req.json()
    const { username, password } = data

    try {
      // Checks
      if (!username || !password) {
        return c.json({ message: 'Username or password is missing' }, 400)
      }
      const lowercaseUsername = username.toLowerCase()
      const userExists = await c.env.DB.prepare(`
          SELECT password_hash, id, role FROM users WHERE lowercase_username = ?
      `).bind(lowercaseUsername).first()
      if(!userExists) {
          return c.json({ message: 'User not found' }, 404)
      }

      // Check if correct password
      const passwordMatch = await bcrypt.compare(password, userExists.password_hash as string)
      if(!passwordMatch) {
          return c.json({ message: 'Incorrect password' }, 401)
      }

      // Time to create token!
      const now = new Date().toISOString()
      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24
      const payload = {
          user: lowercaseUsername,
          id: userExists.id,
          role: userExists.role,
          exp: exp
      }
      const token = await sign(payload, c.env.JWT_SECRET);

      // Update last login
      await c.env.DB.prepare(`
          UPDATE users SET 
                        last_login = ?,
                        last_activity = ?,
                        revoked_at = NULL
          WHERE lowercase_username = ?
      `).bind(now, now, lowercaseUsername).run()

      // Gather user info
      const userInfo: User | undefined = await c.env.DB.prepare(`
          SELECT
              id,
              username,
              lowercase_username,
              created_at,
              last_activity,
              last_login,
              role,
              about_me,
              display_name,
              view_count,
              pfp_url,
              banner_url,
              signature,
              location,
              social_links,
              fav_articles,
              music,
              style,
              theme,
              global_blog_css
          FROM users WHERE lowercase_username = ?
      `).bind(lowercaseUsername).first()

      if (userInfo) {
        userInfo.social_links = parseIfJSON(userInfo.social_links as unknown as string);
        userInfo.fav_articles = parseIfJSON(userInfo.fav_articles as unknown as string);
        userInfo.music = parseIfArray(userInfo.music as unknown as string);
      }

      // Return response with token and user data
      return c.json({
        message: 'Successfully logged in',
        token,
        user: {
          ...userInfo,  
        }
      })
    } catch (error) {
      console.log('Error logging in:' + error)
    }
  })

  .patch('/logout', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    await c.env.DB.prepare(`
      UPDATE users SET 
                    revoked_at = ?
      WHERE lowercase_username = ?
  `).bind(Math.floor(Date.now() / 1000) + 60 * 60 * 24, decoded.user).run()

  })
  
  .get('/ping', async (c) => { 
    return c.json({ message: 'Pong!' })
  })
  
  .get('/', async (c) => {
    try {
        const { results: articles } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM articles
        `).all()
        const { results: themes } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM themes  
        `).all()
        const { results: blogs } = await c.env.DB.prepare(`
          SELECT COUNT(*) as total FROM blogs
        `).all()
        const { results: users } = await c.env.DB.prepare(`
          SELECT COUNT(*) as total FROM users
        `).all()
        const { results: polls } = await c.env.DB.prepare(`
          SELECT COUNT(*) as total FROM polls
        `).all()
        
        const { results: new_users } = await c.env.DB.prepare(`
          SELECT 
                id,
                username,
                created_at,
                last_activity,
                last_login,
                about_me,
                display_name,
                view_count,
                pfp_url,
                banner_url,
                signature,
                location,
                social_links,
                fav_articles,
                music,
                style
          FROM USERS ORDER BY created_at DESC LIMIT 6
        `).all()

        const articlesCount = articles[0].total
        const themesCount = themes[0].total
        const blogsCount = blogs[0].total
        const usersCount = users[0].total
        const pollsCount = polls[0].total

        for (const u of new_users) {
           u.social_links = parseIfArray(u.social_links as unknown as string)
           u.fav_articles = parseIfArray(u.fav_articles as unknown as string)
           u.music = parseIfArray(u.music as unknown as string)
        }

        return c.json({ 
          stats: {
            articles: articlesCount,
            themes: themesCount,
            blogs: blogsCount,
            users: usersCount,
            polls: pollsCount,
          },
          new_users
        })
    } catch (error) {
        console.error(error)
        return c.json({ message: 'Failed to collect statistics' }, 404)
    }
  })

export default root