import { Hono } from 'hono';
import { addUserData } from '../util/data';
import { trimTrailingSlash } from 'hono/trailing-slash'
import { parseIfArray, parseIfJSON } from '../util/parse';
import { verifyToken } from '../util/auth';

const user = new Hono<{ Bindings: Bindings }>();

user
  .use(trimTrailingSlash())
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
            ORDER BY created_at DESC
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
            ORDER BY created_at DESC 
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

  .get('/:username/comments', async (c) => {
    const user = c.req.param('username');
    try {
      const { results }: { results: Comment[] } = await c.env.DB.prepare(`
          SELECT * FROM comments WHERE origin_type = ? AND origin_id = ?
          ORDER BY created_at ASC
      `).bind('user_profile', user).all();

      let comments = await addUserData(results, c.env.DB)
      return c.json(comments);
    } catch (error) {
      console.error(error)
      return c.json({ message: 'User does not exist' }, 404);
    }
  })

  .get('/:username/followers', async (c) => {
    const { username } = c.req.param()
    const lowercaseUsername = username.toLowerCase()

    try {
      const { results } = await c.env.DB.prepare(`
        SELECT follower FROM follows WHERE following = ?
      `).bind(lowercaseUsername).all()

      const followers = await addUserData(results, c.env.DB)
      return c.json(followers)
    } catch (error) {
      return c.json({ message: 'Something went wrong with getting user\'s followers' }, 404)
    }
  })

  .post('/:username/comment', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    /*
    curl -X POST \
  http://localhost:8787/user/pizzatak/comment \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer >>TOKEN HERE<<" \
  -d '{
"comment": "pizza for lyfe"
}'
    */

    const { username } = c.req.param()
    const lowercaseUsername = username.toLowerCase()
    const { comment } = await c.req.json();
    if(!(comment && typeof comment === 'string')) {
      return c.json({ message: 'Comment must be a string' }, 400)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT 1 FROM users WHERE lowercase_username = ?
    `).bind(lowercaseUsername).first()
    if(results) {
      return c.json({ message: 'User does not exist' }, 404)
    }

    try {
      const { success } = await c.env.DB.prepare(`
        INSERT INTO comments
          (origin_type, origin_id, commenter, created_at, content)
        VALUES
          (?, ?, ?, ?, ?)
      `).bind(
        'user_profile',
        username,
        decoded.user,
        new Date().toISOString(),
        comment
      ).run()

      if(!success) {
        throw new Error('Something went wrong with creating your comment')
      }

      return c.json({ message: 'Comment created successfully' }, 201)
    } catch (error) {
      console.error(error)
      return c.json({ message: 'Something went wrong with creating your comment' }, 404)
    }
  })

  .post('/:username/follow', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const { username } = c.req.param()
    const lowercaseUsername = username.toLowerCase()

    // Check if user exists
    const { results } = await c.env.DB.prepare(`
      SELECT id FROM users WHERE lowercase_username = ?
    `).bind(lowercaseUsername).all()
    if(results.length === 0) {
      return c.json({ message: 'User does not exist' }, 404)
    }

    try {
      const { success } = await c.env.DB.prepare(`
        INSERT INTO follows
          (follower, following)
        VALUES
          (?, ?)
      `).bind(
        decoded.user,
        lowercaseUsername
      ).run()

      if(!success) {
        throw new Error('Something went wrong with following this user')
      }

      return c.json({ message: 'User followed successfully' }, 201)
    } catch (error) {
      return c.json({ message: 'Something went wrong with following this user' }, 404)
    }

  })

  .delete('/:username/follow', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const { username } = c.req.param()
    const lowercaseUsername = username.toLowerCase()

    // Check if user exists
    const { results } = await c.env.DB.prepare(`
      SELECT id FROM users WHERE lowercase_username = ?
    `).bind(lowercaseUsername).all()
    if(results.length === 0) {
      return c.json({ message: 'User does not exist' }, 404)
    }

    try {
      const { success } = await c.env.DB.prepare(`
        DELETE FROM follows
        WHERE follower = ? AND following = ?
      `).bind(
        decoded.user,
        lowercaseUsername
      ).run()

      if(!success) {
        throw new Error('Something went wrong with unfollowing this user')
      }

      return c.json({ message: 'User unfollowed successfully' }, 201)
    } catch (error) {
      return c.json({ message: 'Something went wrong with unfollowing this user' }, 404)
    }


  })

  .patch('/:username', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const { username } = c.req.param()
    const lowercaseUsername = username.toLowerCase()
    const data: User = await c.req.json()
    if (decoded.user.toLowerCase() !== lowercaseUsername) {
      return c.json({ message: 'You can\'t edit someone else\'s profile silly!' }, 403)
    }

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

      f("about_me"), f("display_name"), f("signature"),
      f("location"), f("style")

      if (pfp_url && !(/^https?:\/\/.+/.test(pfp_url))) {
        return c.json({ message: 'Invalid pfp_url format'}, 404)
      } f("pfp_url")

      if (social_links && !Array.isArray(social_links)) {
        return c.json({ message: 'social_links must be an array'}, 404)
      } f("social_links")

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
        f("music")
      }

      if (fav_articles) {
        if(!Array.isArray(fav_articles)) {
          return c.json({ message: 'fav_articles must be an array'}, 404)
        }
        if (fav_articles.length > 0) {
          const checkAllNums = fav_articles.every(id => typeof id === 'number')
          if (!checkAllNums) {
              throw new Error('All values in fav_articles must be numbers')
          }
          f("fav_articles")
        }
      } 
        
      if(updates.length === 0) {
          return c.json({ message: 'No data to update'}, 400)
      }
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
    } catch (error) {
      return c.json({ message: 'Something went wrong with updating your profile'}, 404)
    }
  })

export default user