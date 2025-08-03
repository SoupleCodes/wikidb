import { Hono } from 'hono'
import { decode, sign, verify } from 'hono/jwt'
import bcrypt = require("bcryptjs")
import { parseIfJSON, parseIfArray } from '../util/parse';

const root = new Hono<{ Bindings: Bindings }>();

root
  .post('/register', async (c) => {
    const data = await c.req.json()
    const { username, password } = data

    // Checks
    if (!username || !password) {
      return c.json({ message: 'Username or password is missing' }, 400)
    }
    if ((/\s/).test(password)) {
      return c.json({ message: 'Password cannot contain spaces' }, 400)
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
    console.log('Creating user....')
    const now = new Date().toISOString()
    const { success } = await c.env.DB.prepare(`
        INSERT INTO users (username, lowercase_username, password_hash, password_changed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).bind(username, lowercaseUsername, passwordHash, now, now, now).run()
    if(!success) {
        return c.json({ message: 'Failed to create user' }, 400)
    }

    return c.json({ message: 'Sucessfully registered user'}, 201)
  })

  .post('/login', async (c) => {
    const data = await c.req.json()
    const { username, password } = data

    // Checks
    if (!username || !password) {
      return c.json({ message: 'Username or password is missing' }, 400)
    }
    const lowercaseUsername = username.toLowerCase()
    const userExists = await c.env.DB.prepare(`
        SELECT password_hash FROM users WHERE lowercase_username = ?
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
    const payload = {
        user: username,
        role: 'user',
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
    }
    const token = await sign(payload, c.env.JWT_SECRET);

    // Update last login
    await c.env.DB.prepare(`
        UPDATE users SET 
                      last_login = ?,
                      created_at = ?,
                      updated_at = ? 
        WHERE lowercase_username = ?
    `).bind(now, now, now, lowercaseUsername).run()

    // Gather user info
    const userInfo: User | undefined = await c.env.DB.prepare(`
        SELECT
            id,
            username,
            lowercase_username,
            created_at,
            updated_at,
            last_login,
            about_me,
            display_name,
            view_count,
            pfp_url,
            signature,
            location,
            social_links,
            fav_articles,
            music,
            style
        FROM users WHERE lowercase_username = ?
    `).bind(lowercaseUsername).first()

    /*
    const { results: followers } = await c.env.DB.prepare(` -- Commented out: No longer needed to be uncommented
        SELECT follower FROM follows WHERE follower = ? LIMIT 25
    `).bind(username).all()
    const { results: following } = await c.env.DB.prepare(` -- Commented out: No longer needed to be uncommented
        SELECT following FROM follows WHERE follower = ? LIMIT 25
    `).bind(username).all()
    */

    if (userInfo) {
      userInfo.social_links = parseIfJSON(userInfo.social_links);
      userInfo.fav_articles = parseIfJSON(userInfo.fav_articles);
      userInfo.music = parseIfArray(userInfo.music as unknown as string);
    }

    // Return response with token and user data
    return c.json({
      message: 'Successfully logged in',
      token,
      user: {
        ...userInfo,
        /*
        followers: followers.map(f => f.follower),
        following: following.map(f => f.following)  
        */     
      }
    })
  })
  
  .get('/ping', async (c) => { 
    return c.json({ message: 'Pong!' })
  })
  
  .get('/', async (c) => {
    try {
        const { results: articles } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM articles
        `).all()
        const { results: blogs } = await c.env.DB.prepare(`
          SELECT COUNT(*) as total FROM blogs
        `).all()
        const { results: users } = await c.env.DB.prepare(`
          SELECT COUNT(*) as total FROM users
        `).all()

        const articlesCount = articles[0].total
        const blogsCount = blogs[0].total
        const usersCount = users[0].total

        return c.json({ 
          stats: {
            articles: articlesCount,
            blogs: blogsCount,
            users: usersCount
          }
        })
    } catch (error) {
        return c.json({ message: 'Failed to collect statistics' }, 404)
    }
  })

export default root