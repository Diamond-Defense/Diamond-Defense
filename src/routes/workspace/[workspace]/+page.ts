import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ params }) => {
  if (!['org', 'training', 'design'].includes(params.workspace)) error(404, 'Workspace not found.');
};
