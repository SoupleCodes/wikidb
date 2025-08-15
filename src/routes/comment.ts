import { Hono } from 'hono';
import { trimTrailingSlash } from 'hono/trailing-slash'

const comment = new Hono<{ Bindings: Bindings }>();

comment
  .use(trimTrailingSlash())

export default comment