import { json } from '@sveltejs/kit';
import situations from '../../../situations.json';

export const prerender = true;

export function GET() {
  return json(situations);
}
