import { Hono } from 'hono'
import { cors } from 'hono/cors'
import comment from './routes/comment'
import article from './routes/article';
import theme from './routes/theme';
import blog from './routes/blog';
import poll from './routes/poll';
import user from './routes/user';
import root from './routes/root'
import all from './routes/all'

const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());
app.route('/', root)
app.route('/theme', theme)
app.route('/comment', comment)
app.route('/article', article);
app.route('/blog', blog)
app.route('/user', user)
app.route('/poll', poll)
app.route('/all', all)

export default app;