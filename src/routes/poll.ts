import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'
import { verifyToken } from '../util/auth';
import { parseIfArray } from '../util/parse';
import active from '../util/activity';
import { addUserData } from '../util/data';

const poll = new Hono<{ Bindings: Bindings }>();

poll
  .use(trimTrailingSlash())
  .post('/', async (c) => {
    try {
      // Auth
      const decoded = await verifyToken(c)
      if (!decoded) {
        return c.json({ message: 'Unauthorized' }, 401)
      }

      const author = decoded.user
      const now = new Date().toISOString()
      const data: Poll = await c.req.json()

      let { question, options } = data
      if (!question || !options) {
        return c.json({ message: 'Question or options missing' }, 400)
      }
      
      await c.env.DB.prepare(`
        INSERT INTO polls
          (question, author, created_at, last_modified)
        VALUES
          (?, ?, ?, ?)
      `)
        .bind(question, author, now, now)
        .run()

      const { results } = await c.env.DB.prepare("SELECT last_insert_rowid() AS id").all();
      const newID = results[0].id;
      
      options = parseIfArray(options)
      await Promise.all(options.map(async (option: string) => {
        await c.env.DB.prepare(`
          INSERT INTO poll_options
            (poll_id, option)
          VALUES
            (?, ?)
        `)
          .bind(newID, option)
          .run()
      }))
        
      return c.json({ message: 'Poll created successfully', id: newID }, 201)
    } catch (error) {
      console.error(error);
      return c.json({ message: 'Failed to submit poll', error: error });
    }
  })

  .post('/:id/comment', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }
    
    const id = c.req.param('id')
    const data = await c.req.json()
    const { comment } = data
    if(!(comment && typeof comment === 'string')) {
      return c.json({ message: 'Invalid post data. Post must be a string' }, 400)
    }
  
    const { results } = await c.env.DB.prepare(`
      SELECT 1 FROM polls WHERE poll_id = ?
    `).bind(id).all()
    if(results.length === 0) {
      return c.json({ message: 'Poll does not exist' }, 404)
    }

    try {
        await c.env.DB.prepare(`
          INSERT INTO comments
            (origin_type, origin_id, commenter, created_at, content)
          VALUES
            (?, ?, ?, ?, ?)
        `).bind(
          'poll',
          id,
          decoded.user,
          new Date().toISOString(),
          comment
        ).run()
  
        await active(c, decoded.user)
  
        return c.json({ message: 'Comment created successfully' }, 201)
      } catch (error) {
        console.error(error)
        return c.json({ message: 'Something went wrong with creating your comment' }, 500)
      }
  })

  .post('/:id/vote', async (c) => {
    // Auth
    const decoded = await verifyToken(c)
    if (!decoded) {
      return c.json({ message: 'Unauthorized' }, 401)
    }
    
    const id = c.req.param('id')
    const { option } = await c.req.json()
    if(!(option && typeof option === 'number')) {
      return c.json({ message: 'Option must be a number' }, 400)
    }

    // Check if poll exists
    const { results } = await c.env.DB.prepare(`
      SELECT poll_id FROM polls WHERE poll_id = ?
    `).bind(id).all()
    if(!results) {
      return c.json({ message: 'Poll does not exist' }, 404)
    }

    // Check if option in poll exists
    const { results: options } = await c.env.DB.prepare(`
      SELECT * FROM poll_options WHERE poll_id = ?
    `).bind(id).all()
    if (option < 0 || option - 1 >= options.length) {
      console.log(id)
      return c.json({ message: 'Invalid option index' }, 400)
    }

    // Check if user already voted
    const { results: userVoted } = await c.env.DB.prepare(`
        SELECT * FROM poll_votes WHERE poll_id = ? AND user_id = ?
    `).bind(id, decoded.id).all()

    try {
      let oIndex = options[option - 1].option_id

      // Remove pre-existing vote
      if(userVoted.length > 0) {
        await c.env.DB.prepare(`
          DELETE FROM poll_votes
          WHERE poll_id = ? AND user_id = ?
        `).bind(
          id,
          decoded.id,
        ).run()
      }

      // Add new vote
      await c.env.DB.prepare(`
        INSERT INTO poll_votes
          (poll_id, user_id, option_id)
        VALUES
          (?, ?, ?)
      `).bind(
        id,
        decoded.id,
        oIndex
      ).run()

      await active(c, decoded.user)
      return c.json({ message: 'Vote created successfully' }, 201)
    } catch (error) {
      console.error(error)
      return c.json({ message: 'Something went wrong with voting' }, 500) 
    }
  
  })

  .get('/:id', async (c) => {
    const id = c.req.param('id');
    const decoded = await verifyToken(c)
    let prepareStatement = 'SELECT * FROM polls WHERE poll_id = ?'
    const bindings: (string | number | null)[] = [];
    if (decoded) {
      prepareStatement = `
        SELECT
           polls.*,    	
          v.option_id AS user_vote
        FROM polls
        LEFT JOIN
          poll_votes as v
        ON
          v.user_id = ? AND v.poll_id = ?
      `
      bindings.push(decoded.id, id)
    } else {
      bindings.push(id)
    }

    try {
      const { results } = await c.env.DB.prepare(prepareStatement).bind(...bindings).all();
      let { results: options } = await c.env.DB.prepare(`
        SELECT
           poll_options.option, COUNT(poll_votes.option_id) as votes
        FROM
          poll_options
        LEFT JOIN
          poll_votes
        ON
          poll_options.option_id = poll_votes.option_id
        WHERE
          poll_options.poll_id = ?
        GROUP BY
          poll_options.option_id, poll_options.option
      `).bind(id).all()
      
      // Add one view
      await c.env.DB.prepare(`
          UPDATE polls SET view_count = view_count + 1 WHERE poll_id = ?
      `).bind(id).run()

      let poll = await addUserData(results, c.env.DB)
      const pollData = poll[0];
      pollData.options = options;

      return c.json(pollData);
    } catch (error) {
      console.error(error)
      return c.json({ message: 'Poll does not exist' }, 404);
    }
  })

  .get('/:id/comments', async (c) => {
    const id = c.req.param('id');
    try {
      const { results }: { results: Comment[] } = await c.env.DB.prepare(`
          SELECT * FROM comments WHERE origin_type = ? AND origin_id = ?
          ORDER BY created_at ASC
      `).bind('poll', id).all();

      let comments = await addUserData(results, c.env.DB)
      return c.json(comments);
    } catch (error) {
      return c.json({ message: 'Poll does not exist' }, 404);
    }
  })

  .delete('/:id', async (c) => {
    try {
      // Auth
      const decoded = await verifyToken(c)
      if (!decoded) {
        return c.json({ message: 'Unauthorized' }, 401)
      }

      const { id } = c.req.param()
      const result = await c.env.DB.prepare(`
        SELECT * FROM polls WHERE poll_id = ?
      `).bind(id).all()
      const { success: pollExists } = result
      const poll = result.results[0]

      if(!pollExists) {
        return c.json({ message: 'Poll does not exist' }, 404)
      }

      if(poll.author !== decoded.user) {
        return c.json({ message: 'You are not the author of this poll' }, 403)
      }

      const { success } = await c.env.DB.prepare(`
        DELETE FROM polls WHERE poll_id = ?
      `).bind(id).run()

      if(!success) {
        throw new Error('Something went wrong with deleting your poll')
      }
      await active(c, decoded.user)

      return c.json({ message: 'Poll deleted successfully' }, 200)
    } catch (error) {
      console.error(error)
      return c.json({ message: 'Something went wrong with deleting this poll' }, 404)
    }
  })

export default poll