const DAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
// A day heading like "Måndag" or "Måndag:", but not an opening-hours range like "Måndag – Fredag 11–14".
const DAY_RE = /^(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)\b(?!\s*[–—-]\s*(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag))/i;
const FAV_KEY = 'lunch-favorites';

// dayOffset: 0 = today, 1 = tomorrow … never past Friday of this week.
const state = { restaurants: [], menus: {}, updated: null, favs: loadFavs(), query: '', dayOffset: 0 };

function selectedDate() {
  const d = new Date();
  d.setDate(d.getDate() + state.dayOffset);
  return d;
}
// Can step forward only from Mon–Thu (menus cover the current week only).
function canGoNext() {
  const wd = selectedDate().getDay();
  return wd >= 1 && wd <= 4;
}

function renderHeader() {
  const d = selectedDate();
  document.getElementById('today').textContent =
    d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' }) + ` · v.${isoWeek(d)}`;
  document.getElementById('btn-today').disabled = state.dayOffset === 0;
  document.getElementById('btn-next').disabled = !canGoNext();
}

function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); }
}
function saveFavs() {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...state.favs])); } catch {}
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

// Returns the lines for today's day section, or null if the menu has no weekday headings.
function todaysLines(lines, dayName) {
  const start = lines.findIndex((l) => DAY_RE.test(l) && l.toLowerCase().startsWith(dayName));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (DAY_RE.test(l) || /^(veckans|hela veckan)\b/i.test(l)) break;
    out.push(l);
  }
  return out;
}

// Weekly dishes ("Veckans fisk", "Veckans vegetariska" …) shown alongside today's dish.
// Only looks after the last weekday heading, so intros/tabs before the day list are skipped.
function weeklyLines(lines) {
  let lastDay = -1;
  lines.forEach((l, idx) => { if (DAY_RE.test(l)) lastDay = idx; });
  const i = lines.findIndex((l, idx) => idx > lastDay && /^veckans\s+(?!lunch)/i.test(l));
  if (i < 0) return [];
  const out = [];
  for (let j = i; j < lines.length && out.length < 14; j++) {
    if (DAY_RE.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function lineHtml(l) {
  let cls = '';
  if (DAY_RE.test(l) || /^veckans\b/i.test(l)) cls = 'day';
  else if (/^\d[\d\s/:–-]*(kr|:-)?\s*$/i.test(l)) cls = 'price';
  return `<p class="${cls}">${esc(l)}</p>`;
}

// What a card shows for the selected day: that day's dishes + weekly dishes,
// or the whole text when the menu has no weekday headings (or it's the weekend).
function dayView(r) {
  const m = state.menus[r.id];
  if (!m?.ok) return null;
  const lines = m.text.split('\n');
  const sel = selectedDate();
  const dayName = DAYS[sel.getDay()];
  const weekend = sel.getDay() === 0 || sel.getDay() === 6;
  const today = weekend ? null : todaysLines(lines, dayName);
  if (today && today.length) return { lines, dayName, weekend, today, weekly: weeklyLines(lines) };
  return { lines, dayName, weekend, today: null, weekly: [] };
}

// Text the search matches against: only what's on screen for the selected day
// (not the collapsed "Hela veckans meny").
function searchText(r) {
  const v = dayView(r);
  const shown = !v ? [] : v.today ? [...v.today, ...v.weekly] : v.lines;
  return (r.name + '\n' + shown.join('\n')).toLowerCase();
}

// Warns when the restaurant hasn't published this week's menu yet (common early on Mondays).
function weekBadge(m) {
  const cur = isoWeek(new Date());
  if (!m.week || m.week === cur) return '';
  const text = m.week < cur || m.week - cur > 40 ? `Inte uppdaterad – meny för v.${m.week}` : `Meny för v.${m.week}`;
  return ` <span class="badge-old">${text}</span>`;
}

function menuHtml(r) {
  const m = state.menus[r.id];
  if (!m) return `<div class="menu"><p class="err">Ingen meny hämtad än.</p></div>`;
  if (!m.ok) {
    const why = /HTTP 403/.test(m.error) ? 'Sidan tillåter inte automatisk hämtning.' : `Kunde inte läsa menyn (${esc(m.error)}).`;
    return `<div class="menu"><p class="err">${why} Tryck på <a href="${esc(r.lunchUrl)}" target="_blank" rel="noopener">Lunchsida ↗</a> för dagens meny.</p></div>`;
  }

  const { lines, dayName, weekend, today, weekly } = dayView(r);
  const label = state.dayOffset === 0 ? `Idag · ${dayName}` : dayName;
  const full = `<div class="full">${lines.map(lineHtml).join('')}</div>`;
  const badge = weekBadge(m);

  if (today) {
    return `<div class="menu">
      <span class="label">${label}</span>${badge}
      ${today.map(lineHtml).join('')}
      ${weekly.length ? `<div class="weekly">${weekly.map(lineHtml).join('')}</div>` : ''}
      <details><summary>Hela veckans meny</summary>${full}</details>
    </div>`;
  }
  return `<div class="menu">
    <span class="label">${weekend ? 'Helg – veckans meny' : 'Veckans meny'}</span>${badge}
    ${full}
  </div>`;
}

function render() {
  const q = state.query.trim().toLowerCase();
  const items = state.restaurants
    .filter((r) => !q || searchText(r).includes(q))
    // Order follows restaurants.json; favorites float to the top (sort is stable).
    .sort((a, b) => state.favs.has(b.id) - state.favs.has(a.id));

  const list = document.getElementById('list');
  if (!items.length) {
    list.innerHTML = `<p class="empty">Inga träffar.</p>`;
    return;
  }
  list.innerHTML = items.map((r) => {
    const fav = state.favs.has(r.id);
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ', ' + (r.address || 'Linköping'))}`;
    return `<article class="card">
      <div class="card-head">
        <div style="flex:1">
          <h2>${esc(r.name)}</h2>
          ${r.address ? `<div class="addr">${esc(r.address)}</div>` : ''}
        </div>
        <button class="star ${fav ? 'on' : ''}" data-id="${esc(r.id)}" aria-label="Favorit">${fav ? '★' : '☆'}</button>
      </div>
      ${menuHtml(r)}
      <div class="links">
        <a href="${esc(r.lunchUrl)}" target="_blank" rel="noopener">Lunchsida ↗</a>
        <a href="${maps}" target="_blank" rel="noopener">Karta ↗</a>
      </div>
    </article>`;
  }).join('');
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(url + ': ' + res.status);
  return res.json();
}

async function loadData() {
  const [restaurants, menus] = await Promise.all([
    getJson('restaurants.json'),
    getJson('menus.json').catch(() => ({ menus: {} })),
  ]);
  state.restaurants = restaurants;
  state.menus = menus.menus || {};
  state.updated = menus.updated ? new Date(menus.updated) : null;
}

function setStatus(text, kind = '') {
  const el = document.getElementById('updated');
  el.textContent = text;
  el.className = 'updated' + (kind ? ' ' + kind : '');
}

function showUpdated() {
  if (!state.updated) return setStatus('');
  // Per-restaurant "not updated" badges cover stale menus; here just say how many are waiting.
  const cur = isoWeek(new Date());
  const waiting = state.restaurants.filter((r) => { const m = state.menus[r.id]; return m?.ok && m.week && m.week !== cur; }).length;
  setStatus(`Menyer uppdaterade ${state.updated.toLocaleString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` +
    (waiting ? ` · ${waiting} väntar på veckans meny` : ''));
}

async function init() {
  renderHeader();
  try {
    await loadData();
  } catch (e) {
    document.getElementById('list').innerHTML = `<p class="empty">Kunde inte ladda data: ${esc(String(e.message))}</p>`;
    return;
  }
  showUpdated();
  render();
}

// ---- Manual refresh: starts the "Update lunch menus" workflow on GitHub ----
// The token is typed in by the user and kept only in this browser's localStorage.
const GH_REPO = 'ZhaoQX62/lunch-linkoping';
const GH_WORKFLOW = 'update-menus.yml';
const TOKEN_KEY = 'lunch-gh-token';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} }

async function gh(path, token, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    ...opts,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    const err = new Error('auth'); err.status = res.status; throw err;
  }
  if (!res.ok) throw new Error(`GitHub svarade ${res.status}`);
  return res.status === 204 ? null : res.json();
}

let refreshing = false;
async function refreshMenus(token) {
  if (refreshing) return;
  refreshing = true;
  const btn = document.getElementById('btn-refresh');
  btn.disabled = true;
  const before = state.updated?.getTime() || 0;
  const started = Date.now();
  try {
    setStatus('Startar hämtning på GitHub…', 'busy');
    await gh(`/actions/workflows/${GH_WORKFLOW}/dispatches`, token, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });

    // Find the run we just started, then wait for it to finish (fetch + deploy ≈ 1 min).
    let run = null;
    for (let i = 0; i < 60; i++) {
      await sleep(i < 3 ? 3000 : 5000);
      const data = await gh(`/actions/workflows/${GH_WORKFLOW}/runs?event=workflow_dispatch&per_page=3`, token);
      run = (data.workflow_runs || []).find((r) => new Date(r.created_at).getTime() >= started - 60000) || run;
      const secs = Math.round((Date.now() - started) / 1000);
      setStatus(`Hämtar menyer… ${secs} s`, 'busy');
      if (run?.status === 'completed') break;
    }
    if (!run || run.status !== 'completed') throw new Error('Tog för lång tid – försök igen om en stund');
    if (run.conclusion !== 'success') throw new Error(`Hämtningen misslyckades (${run.conclusion})`);

    // The site can take a few seconds to serve the new menus.json after deploy.
    for (let i = 0; i < 6; i++) {
      await loadData();
      if ((state.updated?.getTime() || 0) !== before) break;
      await sleep(5000);
    }
    render();
    showUpdated();
    if ((state.updated?.getTime() || 0) === before) {
      setStatus(document.getElementById('updated').textContent.replace(/^Menyer uppdaterade/, 'Inga nya menyer · senast uppdaterade'));
    }
  } catch (e) {
    if (e.message === 'auth') {
      setStatus('GitHub-nyckeln fungerar inte (fel, utgången eller saknar behörighet). Ange en ny.', 'error');
      openTokenDialog();
    } else {
      setStatus(`Kunde inte uppdatera: ${e.message}`, 'error');
    }
  } finally {
    refreshing = false;
    btn.disabled = false;
  }
}

function openTokenDialog() {
  const dlg = document.getElementById('token-dialog');
  document.getElementById('token-input').value = '';
  dlg.showModal();
}

document.getElementById('token-repo').textContent = GH_REPO.split('/')[1];
document.getElementById('actions-link').href = `https://github.com/${GH_REPO}/actions/workflows/${GH_WORKFLOW}`;
document.getElementById('btn-refresh').addEventListener('click', () => {
  const token = getToken();
  token ? refreshMenus(token) : openTokenDialog();
});
document.getElementById('token-dialog').addEventListener('close', () => {
  const dlg = document.getElementById('token-dialog');
  const token = document.getElementById('token-input').value.trim();
  document.getElementById('token-input').value = '';
  if (dlg.returnValue === 'save' && token) {
    setToken(token);
    refreshMenus(token);
  }
});
document.getElementById('token-cancel').addEventListener('click', () => {
  document.getElementById('token-dialog').close('cancel');
});
document.getElementById('token-forget').addEventListener('click', () => {
  setToken('');
  document.getElementById('token-dialog').close('cancel');
  setStatus('Sparad GitHub-nyckel borttagen.');
});

document.getElementById('btn-next').addEventListener('click', () => {
  if (!canGoNext()) return;
  state.dayOffset++;
  renderHeader();
  render();
});
document.getElementById('btn-today').addEventListener('click', () => {
  state.dayOffset = 0;
  renderHeader();
  render();
});
document.getElementById('search').addEventListener('input', (e) => { state.query = e.target.value; render(); });
document.getElementById('list').addEventListener('click', (e) => {
  const btn = e.target.closest('.star');
  if (!btn) return;
  const id = btn.dataset.id;
  state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
  saveFavs();
  render();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
