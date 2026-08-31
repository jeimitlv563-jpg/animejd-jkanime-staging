import { rest } from './lib.mjs';

async function allRows(table, select) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const order = table === 'jk_queue' ? 'source_rank' : 'anime_slug,chapter_number';
    const page = await rest(`${table}?select=${select}&order=${order}&offset=${offset}&limit=1000`);
    rows.push(...(page || []));
    if (!page || page.length < 1000) return rows;
  }
}

const queue = await allRows('jk_queue', 'status');
const episodes = await allRows('jk_episodes', 'anime_slug,chapter_number,servers,downloads');
const counts = queue.reduce((all, row) => ({
  ...all,
  [row.status]: (all[row.status] || 0) + 1
}), {});
const serverNames = {};
let playerRows = 0;
let downloadLinks = 0;
for (const episode of episodes) {
  const servers = Array.isArray(episode.servers) ? episode.servers : [];
  const downloads = Array.isArray(episode.downloads) ? episode.downloads : [];
  playerRows += servers.length;
  downloadLinks += downloads.length;
  for (const server of servers) {
    const name = String(server.server_name || 'Sin nombre').trim();
    serverNames[name] = (serverNames[name] || 0) + 1;
  }
}

console.log(JSON.stringify({
  queue_total: queue.length,
  queue: counts,
  episode_rows: episodes.length,
  player_rows: playerRows,
  server_names: serverNames,
  download_links: downloadLinks
}, null, 2));
