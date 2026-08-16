import { error, type RequestEvent } from '@sveltejs/kit';
import { D1SqliteAdapter, type D1DatabaseLike } from './d1-adapter';
import type { SqliteDatabaseAdapter } from './adapter';

export function databaseFor(event: RequestEvent): SqliteDatabaseAdapter {
  const binding = event.platform?.env?.DB;
  if (!binding) {
    throw error(
      503,
      'The SQLite database binding is unavailable. Run this app with Wrangler for database features.',
    );
  }
  return new D1SqliteAdapter(binding as D1DatabaseLike);
}
