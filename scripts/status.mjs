import { rest } from './lib.mjs';

const queue = await rest('jk_queue?select=status');
const counts = (queue || []).reduce((all, row) => ({ ...all, [row.status]: (all[row.status] || 0) + 1 }), {});
const episodes = await rest('jk_episodes?select=chapter_number', { headers: { Prefer: 'count=exact' } });
console.log(JSON.stringify({ queue: counts, episode_rows_returned: episodes?.length || 0 }, null, 2));
