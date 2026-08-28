import { readFile } from 'node:fs/promises';
import { rest } from './lib.mjs';

const source = JSON.parse(await readFile(new URL('../data/jkanime-finalizados-faltantes.json', import.meta.url), 'utf8'));
const rows = (source.missing || []).map((item, index) => ({
  slug: item.slug,
  title: item.title,
  source_url: item.url || `https://jkanime.net/${item.slug}/`,
  source_rank: index,
  metadata: { status: item.status, image: item.image, alternative_titles: item.alternative_titles || [] }
}));

for (let offset = 0; offset < rows.length; offset += 250) {
  const chunk = rows.slice(offset, offset + 250);
  await rest('jk_queue?on_conflict=slug', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(chunk)
  });
  console.log(`Cola preparada: ${Math.min(offset + chunk.length, rows.length)}/${rows.length}`);
}
