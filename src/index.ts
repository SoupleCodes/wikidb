import { Hono } from 'hono'
import { cors } from 'hono/cors'
import article from './routes/article';
import blog from './routes/blog';
import user from './routes/user';
import root from './routes/root'
import all from './routes/all'

const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());
app.route('/', root)
app.route('/article', article);
app.route('/blog', blog)
app.route('/user', user)
app.route('/all', all)

export default app;