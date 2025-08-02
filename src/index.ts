import { Hono } from 'hono'
import { cors } from 'hono/cors'
import article from './routes/article';
import blog from './routes/blog';
import root from './routes/root'

const app = new Hono<{ Bindings: Bindings }>();
app.use('/*', cors());

app.route('/*', root)
app.route('/article', article);
app.route('/blog', blog)

export default app;