import { cleanText, decodeHtml, fetchHtml, rest, slugify } from './lib.mjs';

const BASE = 'https://jkanime.net';
const option = (name, fallback) => {
  const found = process.argv.slice(2).find(arg => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const MAX_MINUTES = Math.min(Math.max(Number(option('max-minutes', 290)), 5), 350);
const DELAY = Math.min(Math.max(Number(option('delay', 700)), 300), 5000);
const deadline = Date.now() + MAX_MINUTES * 60_000;

function parseDetail(html, row) {
  const title = cleanText(html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i)?.[1] || row.title, 180);
  const image = decodeHtml(html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || row.metadata?.image || '');
  const description = cleanText(html.match(/<p\s+class=["']scroll["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1] || '');
  const genresHtml = html.match(/<li><span>Generos:<\/span>([\s\S]*?)<\/li>/i)?.[1] || '';
  const genres = [...genresHtml.matchAll(/>([^<>]+)<\/a>/g)].map(x => cleanText(x[1], 80)).filter(Boolean);
  const year = Number(html.match(/(?:Temporada:|Emitido:)[\s\S]*?(20\d{2}|19\d{2})/i)?.[1]) || null;
  const episodeCount = Number(html.match(/id=["']uep["'][^>]*>[\s\S]*?-\s*(\d+)/i)?.[1] || html.match(/<li><span>Episodios:<\/span>\s*(\d+)/i)?.[1]) || 0;
  const altBlock = html.match(/Titulos Alternativos[\s\S]*?<div[^>]+id=["']c["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const alternatives = [...altBlock.matchAll(/<b[^>]*class=["']t["'][^>]*>[^<]*<\/b>\s*([^<\r\n]+)/gi)]
    .map(x => cleanText(x[1], 180)).filter(Boolean);
  return { slug: row.slug, title, image_url: image, description, year, status: 'Finalizado', genres, alternative_titles: alternatives, source_url: row.source_url, episode_count: episodeCount };
}

function extractServers(html) {
  const buttons = [...html.matchAll(/<a\b(?=[^>]*class=["'][^"']*servers[^"']*["'])(?=[^>]*data-id=["'](\d+)["'])[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => ({ index: Number(match[1]), name: cleanText(match[2], 80) }));
  return buttons.map(item => {
    const encoded = html.match(new RegExp(`video\\[${item.index}\\]\\s*=\\s*(["'])([\\s\\S]*?)\\1;`, 'i'))?.[2] || '';
    const url = decodeHtml(encoded.match(/src=["']([^"']+)/i)?.[1] || '');
    return url ? { server_name: item.name || `Servidor ${item.index}`, embed_url: url } : null;
  }).filter(Boolean).sort((a, b) => Number(/desu/i.test(b.server_name)) - Number(/desu/i.test(a.server_name)));
}

function extractDownloads(html) {
  const raw = html.match(/var\s+servers\s*=\s*(\[[\s\S]*?\]);/i)?.[1];
  if (!raw) return [];
  try {
    return JSON.parse(raw).map(item => ({
      server: cleanText(item.server || 'Descarga', 80),
      url: Buffer.from(String(item.remote || ''), 'base64').toString('utf8').trim(),
      size: cleanText(item.size || '', 40)
    })).filter(item => /^https?:\/\//i.test(item.url));
  } catch { return []; }
}

async function patchQueue(slug, values) {
  await rest(`jk_queue?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...values, updated_at: new Date().toISOString() })
  });
}

async function nextQueue() {
  const rows = await rest('jk_queue?select=*&status=in.(pending,retry,extracting)&order=source_rank.asc&limit=1');
  return rows?.[0] || null;
}

let completed = 0;
let episodes = 0;
while (Date.now() < deadline - 60_000) {
  const row = await nextQueue();
  if (!row) break;
  try {
    await patchQueue(row.slug, { status: 'extracting', attempts: Number(row.attempts || 0) + 1, last_error: null });
    const detail = parseDetail(await fetchHtml(row.source_url, DELAY), row);
    if (!detail.episode_count) throw new Error('No se detectó el número de episodios');
    await rest('jk_animes?on_conflict=slug', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ...detail, updated_at: new Date().toISOString() })
    });
    const start = Math.max(1, Number(row.next_episode || 1));
    await patchQueue(row.slug, { episode_count: detail.episode_count, next_episode: start });
    for (let number = start; number <= detail.episode_count; number += 1) {
      if (Date.now() >= deadline - 60_000) {
        await patchQueue(row.slug, { status: 'pending', next_episode: number });
        console.log(`Pausa segura en ${row.slug}, episodio ${number}`);
        process.exit(0);
      }
      const sourceUrl = `${BASE}/${row.slug}/${number}/`;
      const html = await fetchHtml(sourceUrl, DELAY);
      const servers = extractServers(html);
      const downloads = extractDownloads(html);
      const thumbnail = decodeHtml(html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i)?.[1] || detail.image_url);
      await rest('jk_episodes?on_conflict=anime_slug,chapter_number', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ anime_slug: row.slug, chapter_number: number, thumbnail, servers, downloads, source_url: sourceUrl, updated_at: new Date().toISOString() })
      });
      await patchQueue(row.slug, { next_episode: number + 1 });
      episodes += 1;
      if (number % 10 === 0 || number === detail.episode_count) console.log(`${detail.title}: ${number}/${detail.episode_count}`);
    }
    await patchQueue(row.slug, { status: 'completed', next_episode: detail.episode_count + 1, last_error: null });
    completed += 1;
    console.log(`Completado: ${detail.title} (${detail.episode_count} episodios)`);
  } catch (error) {
    console.error(`${row.slug}: ${error.message || error}`);
    await patchQueue(row.slug, { status: 'retry', last_error: String(error.message || error).slice(0, 1000) });
  }
}
console.log(JSON.stringify({ completed, episodes, stopped_at: new Date().toISOString() }));
