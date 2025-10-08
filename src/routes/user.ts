import { Hono } from 'hono';
import { addUserData } from '../util/data';
import { trimTrailingSlash } from 'hono/trailing-slash'
import { parseIfArray, parseIfJSON } from '../util/parse';
import { verifyToken } from '../util/auth';
import active from '../util/activity';
import sendInbox from '../util/sendinbox';

const user = new Hono<{ Bindings: Bindings }>();

user
  .use(trimTrailingSlash())
  .get('/:username', async (c) => {
    const { username } = c.req.param()
    const lowercasedUsername = username.toLowerCase()
    const bindings: (string | number | null)[] = [];

    let prepareStatement = `
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
                style,
                theme,
                global_blog_css
            FROM users WHERE lowercase_username = ?
    `

    // Auth
    const decoded = await verifyToken(c)
    if (decoded) {
      prepareStatement = `
            SELECT 
              u.id, u.username, u.created_at,
              u.last_activity, u.last_login,
              u.about_me, u.display_name, u.view_count,
              u.pfp_url, u.banner_url, u.signature,
              u.location, u.social_links, u.fav_articles, u.music,
              u.style, u.theme,
            CASE
              WHEN EXISTS (SELECT 1 FROM follows WHERE follower = ? AND following = u.lowercase_username)
            THEN 1
              ELSE 0
            END AS followed
            FROM users as u WHERE lowercase_username = ?
      `
      bindings.push(decoded.user, lowercasedUsername)
    } else {
      bindings.push(lowercasedUsername)
    }


    try {
        const { results } = await c.env.DB.prepare(prepareStatement).bind(...bindings).all()

        results[0].social_links = parseIfArray(results[0].social_links as unknown as string)
        results[0].fav_articles = parseIfArray(results[0].fav_articles as unknown as string)
        results[0].music = parseIfArray(results[0].music as unknown as string)

        let themeNum = results[0].theme
        if (themeNum) {
          const { results: theme } = await c.env.DB.prepare(`
            SELECT * FROM themes WHERE id = ?
          `).bind(themeNum).all()

          theme[0].tags = parseIfArray(results[0].tags as unknown as string)
          results[0].theme = theme[0]
        }

        // Add one view
        await c.env.DB.prepare(`
            UPDATE users SET view_count = view_count + 1
                         WHERE lowercase_username = ?
        `).bind(lowercasedUsername).run()

        return c.json(results[0])
    } catch (error) {
        console.error(error)
        return c.json({ message: 'Something went wrong with getting this user' }, 404)
    }
  })

  .get('/:username/recent/articles', async (c) => {
    const { username } = c.req.param()
    const lowercasedUsername = username.toLowerCase()

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT DISTINCT a.title, a.id, a.author
            FROM articles AS a
            JOIN edit_history AS h
              ON a.id = h.article_id
            WHERE 
              LOWER(author) = ?
            ORDER BY h.edit_date DESC
        `).bind(lowercasedUsername).all()

        return c.json(results)
    } catch (err) {
      console.log(err)
      return c.json({ message: 'Server troubles!' }, err)
    }
  })

  .get('/:username/recent/comments', async (c) => {
    const { username } = c.req.param();
    const lowercasedUsername = username.toLowerCase();
    try {
      const { results }: { results: Comment[] } = await c.env.DB.prepare(`
          SELECT 
            c.commenter as author, 
            c.content as comment,
            c.id as comment_id,
            b.title as blog_title,
            b.id as blog_id
          FROM comments as c
          LEFT JOIN blogs as b ON c.origin_id = b.id
          WHERE 
          	c.origin_type = 'blog'
            AND LOWER(b.author) = ?
          ORDER BY c.created_at DESC
          LIMIT 8 OFFSET 0
      `).bind(lowercasedUsername).all();

      return c.json(results);
    } catch (error) {
      console.error(error)
      return c.json({ message: 'User does not exist' }, 404);
    }
  })

  .get('/:username/articles/:page', async (c) => {
    const { username, page } = c.req.param()
    const lowercasedUsername = username.toLowerCase()

    try {
        const { results } = await c.env.DB.prepare(`
            SELECT
              a.*,
              COUNT(c.origin_id) AS comment_count
            FROM articles AS a
            LEFT JOIN comments AS c ON a.id = c.origin_id AND c.origin_type = 'article'
            WHERE
              LOWER(a.author) = ?
            GROUP BY
              a.id
            ORDER BY a.created_at DESC
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
            SELECT
            b.*,
            COUNT(c.origin_id) AS comment_count
            FROM blogs AS b
            LEFT JOIN comments AS c ON b.id = c.origin_id AND c.origin_type = 'blog'
            WHERE
            LOWER(b.author) = ?
            GROUP BY
              b.id
            ORDER BY b.created_at DESC
            LIMIT 25 OFFSET ?

        `).bind(lowercasedUsername, (parseInt(page) - 1) * 25).all()

        const { results: archive } = await c.env.DB.prepare(`
            SELECT
              STRFTIME('%m', blogs.created_at) AS month,
              STRFTIME('%Y', blogs.created_at) AS year,
              COUNT(id) AS count
            FROM blogs
            WHERE LOWER(author) = ?
            GROUP BY
              STRFTIME('%m-%Y', blogs.created_at)
            ORDER BY month DESC
        `).bind(lowercasedUsername).all()

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
            totalBlogs: total,
            archive: archive
        })
    } catch (error) {
        console.error(error)
        return c.json({ message: 'There was something wrong with getting this user\'s blogs' }, 404)
    }
  })

  .get('/:username/comments', async (c) => {
    const user = c.req.param('username');
    const page = c.req.query('page')
    const pageNum = (page as unknown as number - 1) * 40 || 0
    try {
      const { results }: { results: Comment[] } = await c.env.DB.prepare(`
          SELECT * FROM comments WHERE origin_type = ? AND origin_id = ?
          ORDER BY created_at DESC
          LIMIT 40 OFFSET ?
      `).bind('user', user.toLowerCase(), pageNum).all();
      const { results: [{ total }] } = await c.env.DB.prepare(`
        SELECT COUNT(*) as total FROM comments
        WHERE origin_type = ? AND origin_id = ?
      `).bind('user', user.toLowerCase()).all()

      let comments = await addUserData(results, c.env.DB)
      const totalPages = Math.ceil(Number(total) / 25);
      return c.json({
        comments,
        page_count: totalPages - 1,
        comment_count: Number(total)
      });
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
        SELECT follower AS user FROM follows WHERE following = ?
      `).bind(lowercaseUsername).all()

      const followers = await addUserData(results, c.env.DB)
      return c.json(followers)
    } catch (error) {
      return c.json({ message: 'Something went wrong with getting user\'s followers' }, 404)
    }
  })

  .get('/:username/following', async (c) => {
    const { username } = c.req.param()
    const lowercaseUsername = username.toLowerCase()

    try {
      const { results } = await c.env.DB.prepare(`
        SELECT following AS user FROM follows WHERE follower = ?
      `).bind(lowercaseUsername).all()

      const following = await addUserData(results, c.env.DB)
      return c.json(following)
    } catch (error) {
      return c.json({ message: 'Something went wrong with getting who the user followed' }, 404)
    }
  })

  .post('/:username/comment', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }

    const { username } = c.req.param()
    const lowercaseUsername = username.toLowerCase()
    const { comment } = await c.req.json();
    if(!(comment && typeof comment === 'string')) {
      return c.json({ message: 'Comment must be a string' }, 400)
    }

    const { results } = await c.env.DB.prepare(`
      SELECT comments_enabled FROM users WHERE lowercase_username = ?
    `).bind(lowercaseUsername).all()
    if(results.length === 0) {
      return c.json({ message: 'User does not exist' }, 404)
    }
    if (!results[0].comments_enabled) {
      return c.json({ message: 'Comments are disabled for this profile!' }, 409)
    }

    try {
      const { success } = await c.env.DB.prepare(`
        INSERT INTO comments
          (origin_type, origin_id, commenter, created_at, content)
        VALUES
          (?, ?, ?, ?, ?)
      `).bind(
        'user',
        lowercaseUsername,
        decoded.user,
        new Date().toISOString(),
        comment
      ).run()

      if(!success) {
        throw new Error('Something went wrong with creating your comment')
      }
      const { results } = await c.env.DB.prepare("SELECT last_insert_rowid() AS id").all();
      const newID = results[0].id as unknown as number;
      await active(c, decoded.user)

      const truncate = comment.length > 40
      const truncatedString = comment.trim().substring(0,40) + '...'
      await sendInbox(
                c, 
                "comment", 
                `${decoded.user} commented on your profile! "${truncate ? truncatedString : comment}"`,
                "user",
                username,
                decoded.user,
                username,
                newID
              )

      return c.json({ message: 'Comment created successfully', newID: newID }, 201)
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
      await active(c, decoded.user)
      await sendInbox(
        c, 
        "follow", 
        `${decoded.user} followed you!"`,
        "user",
        decoded.user,
        decoded.user,
        username
      )

      return c.json({ message: 'User followed successfully' }, 201)
    } catch (error) {
      console.error(error)
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
      await active(c, decoded.user)

      return c.json({ message: 'User unfollowed successfully' }, 201)
    } catch (error) {
      return c.json({ message: 'Something went wrong with unfollowing this user' }, 404)
    }


  })

export default user