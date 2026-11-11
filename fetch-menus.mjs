// Fetches each restaurant's lunch page and saves the menu text to menus.json.
// Usage: node fetch-menus.mjs            (only refetches menus that aren't from this week)
//        node fetch-menus.mjs --force    (refetch everything)
// No dependencies; needs Node 18+.
//
// Week-aware: a menu whose text says the current week ("v.46", "Vecka 46" …) is kept as is.
// Menus from an older week, without a week number, or that failed last time are fetched again.
// If a fetch fails but an earlier menu exists, the earlier menu is kept.

import { readFile, writeFile } from 'node:fs/promises';

const MAX_CHARS = 5000;
const FORCE = process.argv.includes('--force');
const MENUS_FILE = new URL('./menus.json', import.meta.url);

const restaurants = JSON.parse(await readFile(new URL('./restaurants.json', import.meta.url), 'utf8'));
const previous = await readFile(MENUS_FILE, 'utf8').then(JSON.parse).catch(() => ({ menus: {} }));

// ISO week of today's date in Sweden (the runner's clock is UTC).
function swedishIsoWeek(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(now).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const year = t.getUTCFullYear();
  return { year, week: Math.ceil(((t - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7) };
}

// First week number in the menu text: "v.46", "V. 46", "v 46", "Vecka 46", "Lunchmeny v. 46" …
function detectWeek(text) {
  const m = text.match(/\b(?:vecka|v)\.?\s*(\d{1,2})\b/i);
  const n = m ? Number(m[1]) : null;
  return n >= 1 && n <= 53 ? n : null;
}

// Changing a restaurant's URL or trim markers forces a refetch of that restaurant.
const configKey = (r) => [r.lunchUrl, r.start || '', r.end || ''].join('|');
const now = swedishIsoWeek();

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
  const page = htmlToText(await res.text());
  let text = crop(page, r.start, r.end);
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + '\n…';
  if (text.length < 40) throw new Error('No menu text found (page may be built with JavaScript or use an image/PDF)');
  // Week number usually sits in the menu; some pages put it just above the trimmed part.
  return { text, week: detectWeek(text) ?? detectWeek(page) };
}

const isCurrent = (m) => m?.ok && m.week === now.week && m.year === now.year;

const out = { updated: previous.updated, menus: {} };
let changed = false;
await Promise.all(
  restaurants.map(async (r) => {
    const prev = previous.menus?.[r.id];
    if (!FORCE && isCurrent(prev) && prev.config === configKey(r)) {
      out.menus[r.id] = prev;
      console.log(`SKIP  ${r.name} (already v.${prev.week})`);
      return;
    }
    try {
      const { text, week } = await fetchOne(r);
      const entry = { ok: true, text, week, year: week ? now.year : null, config: configKey(r) };
      if (!week) delete entry.year;
      out.menus[r.id] = entry;
      if (prev?.text !== text || prev?.week !== week || !prev?.ok || prev.config !== entry.config) changed = true;
      const status = !week ? 'no week number' : week === now.week ? `v.${week}, current` : `v.${week}, NOT current yet`;
      console.log(`OK    ${r.name} (${status})`);
    } catch (e) {
      const error = String(e.message || e);
      if (prev?.ok) {
        // Keep the last good menu rather than blanking the card.
        out.menus[r.id] = { ...prev, lastError: error };
        console.log(`FAIL  ${r.name}: ${error} — keeping earlier menu (v.${prev.week ?? '?'})`);
      } else {
        out.menus[r.id] = { ok: false, error };
        if (prev?.error !== error) changed = true;
        console.log(`FAIL  ${r.name}: ${error}`);
      }
    }
  })
);
// A restaurant removed from the list also counts as a change.
if (Object.keys(previous.menus || {}).some((id) => !out.menus[id])) changed = true;

if (changed || FORCE) {
  out.updated = new Date().toISOString();
  await writeFile(MENUS_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Saved menus.json (week ${now.week})`);
} else {
  console.log(`No changes (week ${now.week}); menus.json left as is`);
}
