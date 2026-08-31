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

// Los registros completados conservan su checkpoint y se reutilizan. Solo se
// reinician candidatos del lote actual que habían agotado sus reintentos.
const sourceSlugs = new Set(rows.map(row => row.slug));
const failed = await rest('jk_queue?select=slug,status&status=in.(skipped,retry)&limit=5000');
const retry = (failed || []).filter(row => sourceSlugs.has(row.slug));
for (const [index, row] of retry.entries()) {
  await rest(`jk_queue?slug=eq.${encodeURIComponent(row.slug)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'pending', attempts: 0, next_episode: 1, last_error: null, updated_at: new Date().toISOString() })
  });
  if ((index + 1) % 25 === 0 || index + 1 === retry.length) {
    console.log(`Reintentos reactivados: ${index + 1}/${retry.length}`);
  }
}
