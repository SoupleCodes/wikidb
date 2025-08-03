import { Hono } from 'hono';

const all = new Hono<{ Bindings: Bindings }>();

export default all