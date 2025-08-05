import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'

const all = new Hono<{ Bindings: Bindings }>();

all.use(trimTrailingSlash())

export default all