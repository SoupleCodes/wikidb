import { Hono } from 'hono';
import { parseIfArray, parseIfJSON } from '../util/parse';

const user = new Hono<{ Bindings: Bindings }>();

user
  .get('/:username', async (c) => {
    const { username } = c.req.param()
    const lowercasedUsername = username.toLowerCase()

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT 
                id,
                username,
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
        `).bind(lowercasedUsername).all()
        results[0].social_links = parseIfArray(results[0].social_links as unknown as string)
        results[0].fav_articles = parseIfArray(results[0].fav_articles as unknown as string)
        results[0].music = parseIfArray(results[0].fav_music as unknown as string)

        // Add one view
        c.env.DB.prepare(`
            UPDATE users SET view_count = view_count + 1
                         WHERE lowercase_username = ?
        `).bind(lowercasedUsername).run()

        return c.json(results)
    } catch (error) {
        return c.json({ message: 'Something went wrong with getting this user' }, 404)
    }
  })

  .get('/:username/articles/:page', async (c) => {
    const { username, page } = c.req.param()
    const lowercasedUsername = username.toLowerCase()

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT * FROM ARTICLES
            WHERE author = ?
            ORDER BY creation_date DESC
            LIMIT 25 OFFSET ?
        `).bind(lowercasedUsername, (parseInt(page) - 1) * 25).all()
        const { results: [{ total }] } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM articles
            WHERE LOWER(author) = ?
        `).bind(lowercasedUsername).all()
        const totalPages = Math.ceil(Number(total) / 25);
        return c.json({
            articles: results,
            totalPages,
            totalArticles: total
        })
    } catch (error) {
        return c.json({ message: 'There was something wrong with getting this user\'s articles' }, 404)
    }
  })

  .get('/:username/blogs/:page', async (c) => {
    const { username, page } = c.req.param()
    const lowercasedUsername = username.toLowerCase()

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT * FROM blogs 
            WHERE LOWER(author) = ? 
            ORDER BY creation_date DESC 
            LIMIT 25 OFFSET ?
        `).bind(lowercasedUsername, (parseInt(page) - 1) * 25).all()

        for (const blog of results) {
            blog.tags = parseIfArray(blog.tags as unknown as string)
            blog.music = parseIfJSON(blog.music as unknown as string)
        }

        const { results: [{ total }] } = await c.env.DB.prepare(`
            SELECT COUNT(*) as total FROM blogs 
            WHERE LOWER(author) = ?
        `).bind(lowercasedUsername).all()
        const totalPages = Math.ceil(Number(total) / 25);
        return c.json({
            blogs: results,
            totalPages,
            totalBlogs: total
        })
    } catch (error) {
        return c.json({ message: 'There was something wrong with getting this user\'s blogs' }, 404)
    }
  })

  .patch('/:username', async (c) => {
    const { username } = c.req.param()
    const lowercaseUsername = username.toLowerCase()
    const data: User = await c.req.json()

    let { about_me, display_name, pfp_url, signature, location, social_links, fav_articles, music, style } = data

    try {
      const updates: string[] = [];
      const bindings: (string | number | null)[] = [];

      function f(column: string) {
        if (data[column] && (data[column] !== undefined) && (data[column] !== null)) {
            updates.push(column + " = ?");
            bindings.push(data[column]);
            return true
        }
        return false
      }

      f(about_me), f(display_name), f(signature),
      f(location), f(style)

      if (!(pfp_url && /^https?:\/\/.+/.test(pfp_url))) {
        return c.json({ message: 'Invalid pfp_url format'}, 404)
      } f(pfp_url)

      if (!Array.isArray(social_links)) {
        return c.json({ message: 'social_links must be an array'}, 404)
      } f(social_links)

      if (music && music !== undefined) {
        if (!Array.isArray(music)) {
            return c.json({ message: 'music must be an array'}, 404)
        }
        const musicArray = music as unknown as Music[]
        for (const musicObject of musicArray) {
            if (typeof musicObject !== 'object' ||
                typeof musicObject.artist_name !== 'string' || 
                typeof musicObject.song_name !== 'string' || 
                typeof musicObject.song_url !== 'string' || 
                typeof musicObject.published !== 'number' || 
                (musicObject.cover_art !== undefined && typeof musicObject.cover_art !== 'string') || 
                (musicObject.album !== undefined && typeof musicObject.album !== 'string')) {
                
                throw new Error("Music object must have artist_name, song_name, song_url, published, and cover_art with valid types.");
            }
        }
        f(music as unknown as string)

        if (!Array.isArray(fav_articles)) {
            return c.json({ message: 'fav_articles must be an array'}, 404)
        } 
        if (fav_articles.length > 0) {
            const checkAllNums = fav_articles.every(id => typeof id === 'number')
            if (!checkAllNums) {
                throw new Error('All values in fav_articles must be numbers')
            }
            f(fav_articles)
        }
        
        if(updates.length === 0) {
            return c.json({ message: 'No data to update'}, 400)
        } else {
            const { success } = await c.env.DB.prepare(`
                UPDATE users SET
                    ${updates.join(', ')}
                WHERE lowercase_username = ?
            `).bind(
                ...bindings,
                lowercaseUsername
            ).run()

            if(!success) {
                throw new Error('Something went wrong with updating your profile')
            }

            return c.json({ message: 'Profile updated successfully' }, 200)
        }
      }

    } catch (error) {
      return c.json({ message: 'Something went wrong with updating your profile'}, 404)
    }
  })

export default user