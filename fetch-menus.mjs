// Fetches each restaurant's lunch page and saves the menu text to menus.json.
// Usage: node fetch-menus.mjs
// No dependencies; needs Node 18+.

import { readFile, writeFile } from 'node:fs/promises';

const MAX_CHARS = 5000;

const restaurants = JSON.parse(await readFile(new URL('./restaurants.json', import.meta.url), 'utf8'));

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aring: 'å', Aring: 'Å', auml: 'ä', Auml: 'Ä', ouml: 'ö', Ouml: 'Ö', eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', oacute: 'ó', uuml: 'ü', Uuml: 'Ü', ntilde: 'ñ', ccedil: 'ç', oslash: 'ø', aelig: 'æ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n] ?? m);
}

function htmlToText(html) {
  // decoded twice: some sites double-encode (e.g. "&amp;ntilde;")
  return decodeEntities(decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|noscript|svg|head|nav|header|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|table|section|article|span class="[^"]*block[^"]*")[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ))
    .replace(/[​-‍﻿]/g, '')
    .replace(/¥\s*/g, '') // icon-font glyph some sites put before prices
    .replace(/(^|\n)\s*\$\s*(?=\d)/g, '$1') // same, as "$ 159"
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .filter((l, i, arr) => l !== arr[i - 1]) // drop repeated lines
    .join('\n');
}

function crop(text, start, end) {
  const lower = text.toLowerCase();
  if (start) {
    const i = lower.indexOf(start.toLowerCase());
    if (i >= 0) text = text.slice(i);
  }
  if (end) {
    const j = text.toLowerCase().indexOf(end.toLowerCase(), 1);
    if (j > 0) text = text.slice(0, j);
  }
  return text.trim();
}

async function fetchOne(r) {
  const res = await fetch(r.lunchUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (personal lunch menu reader)', 'Accept-Language': 'sv,en;q=0.8' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let text = crop(htmlToText(await res.text()), r.start, r.end);
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + '\n…';
  if (text.length < 40) throw new Error('No menu text found (page may be built with JavaScript or use an image/PDF)');
  return text;
}

const out = { updated: new Date().toISOString(), menus: {} };
await Promise.all(
  restaurants.map(async (r) => {
    try {
      const text = await fetchOne(r);
      out.menus[r.id] = { ok: true, text };
      console.log(`OK    ${r.name} (${text.length} chars)`);
    } catch (e) {
      out.menus[r.id] = { ok: false, error: String(e.message || e) };
      console.log(`FAIL  ${r.name}: ${e.message || e}`);
    }
  })
);

await writeFile(new URL('./menus.json', import.meta.url), JSON.stringify(out, null, 2), 'utf8');
console.log('Saved menus.json');
