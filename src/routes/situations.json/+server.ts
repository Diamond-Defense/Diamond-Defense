import type { RequestHandler } from './$types';

export const prerender = false;

export const GET: RequestHandler = () =>
  new Response('Seed data is not a runtime endpoint.', { status: 404 });
