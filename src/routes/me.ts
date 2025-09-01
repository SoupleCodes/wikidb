import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'
import active from '../util/activity';
import { verifyToken } from '../util/auth';

const me = new Hono<{ Bindings: Bindings }>();

me
  .use(trimTrailingSlash())
  .patch('/', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const username = decoded.user
    const data: User = await c.req.json()

    let { about_me, display_name, pfp_url, banner_url, signature, location, social_links, fav_articles, music, style } = data

    try {
      const updates: string[] = [];
      const bindings: (string | number | null)[] = [];

      function f(column: string, json?: boolean) {
        if (data[column] && (data[column] !== undefined) && (data[column] !== null)) {
            updates.push(column + " = ?");
            if(json) {
              bindings.push(JSON.stringify(data[column]));
            } else {
              bindings.push(data[column]);
            }
            
            return true
        }
        return false
      }

      f("about_me"), f("display_name"), f("signature"),
      f("location"), f("style")

      if (pfp_url && !(/^https?:\/\/.+/.test(pfp_url))) {
        return c.json({ message: 'Invalid pfp_url format'}, 404)
      } f("pfp_url")

      if (banner_url && !(/^https?:\/\/.+/.test(banner_url))) {
        return c.json({ message: 'Invalid banner_url format'}, 404)
      } f("banner_url")

      if (social_links && !Array.isArray(social_links)) {
        return c.json({ message: 'social_links must be an array'}, 404)
      } f("social_links", true)

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

        f("music", true)
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
          f("fav_articles", true)
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
          username
      ).run()

      if(!success) {
          throw new Error('Something went wrong with updating your profile')
      }
      await active(c, decoded.user)

      return c.json({ message: 'Profile updated successfully' }, 200)
    } catch (error) {
      console.error(error)
      return c.json({ message: 'Something went wrong with updating your profile'}, 404)
    }
  })

export default me