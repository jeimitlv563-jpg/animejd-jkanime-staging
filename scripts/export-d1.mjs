import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { rest } from './lib.mjs';

const OUT = new URL('../export/', import.meta.url);
await mkdir(OUT, { recursive: true });

async function exportTable(table, select, order, fileName) {
  const stream = createWriteStream(new URL(fileName, OUT), { encoding: 'utf8' });
  let total = 0;
  for (let offset = 0; ; offset += 1000) {
    const page = await rest(`${table}?select=${select}&order=${order}&offset=${offset}&limit=1000`);
    for (const row of page || []) {
      if (!stream.write(`${JSON.stringify(row)}\n`)) await once(stream, 'drain');
      total += 1;
    }
    console.log(`${table}: ${total}`);
    if (!page || page.length < 1000) break;
  }
  stream.end();
  await once(stream, 'finish');
  return total;
}

const animes = await exportTable(
  'jk_animes',
  'slug,title,alternative_titles,image_url,description,year,status,genres,source_url,episode_count,updated_at',
  'slug',
  'jk-animes.jsonl'
);
const episodes = await exportTable(
  'jk_episodes',
  'anime_slug,chapter_number,thumbnail,servers,downloads,source_url,updated_at',
  'anime_slug,chapter_number',
  'jk-episodes.jsonl'
);
const skipped = await exportTable(
  'jk_queue',
  'slug,title,source_url,status,attempts,last_error,metadata',
  'source_rank',
  'jk-queue.jsonl'
);

const manifest = {
  format: 1,
  generated_at: new Date().toISOString(),
  animes,
  episodes,
  queue_rows: skipped
};
await writeFile(new URL('manifest.json', OUT), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest));
