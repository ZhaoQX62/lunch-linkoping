# Lunch Linköping

A small personal PWA that shows today's lunch from a list of restaurants you choose.

## How it works

- `restaurants.json` – your list of restaurants (edit this).
- `fetch-menus.mjs` – downloads each restaurant's lunch page and saves the text to `menus.json`.
  This has to run as a script: a web app in the browser isn't allowed to read other sites directly (CORS).
- `index.html`, `app.js`, `style.css` – the app. It shows **today's** dish when the menu has weekday
  headings (Måndag, Tisdag …), plus "Veckans …" dishes, and the full week behind a toggle.
  Menus without weekday headings are shown in full.
- `sw.js`, `manifest.webmanifest`, `icons/` – make it installable and work offline.

## When menus are refreshed

**Main trigger – Task Scheduler on this PC:** the task "Lunch Linkoping - update menus" runs
`tools/trigger-menu-update.ps1` on Monday at 09:00, 10:30 and 12:00 (restaurants often publish
the new week late), and Tuesday–Friday at 09:00. It asks GitHub to start the
workflow right away, using the GitHub login Git already has saved (no token stored anywhere).
It only runs while the PC is on and you're logged in; a missed time runs as soon as the PC is back.
Log: `%LOCALAPPDATA%\LunchLinkoping\trigger.log`.
Re-create it (e.g. after moving this folder): `powershell -ExecutionPolicy Bypass -File tools\install-task.ps1`.
Remove it: `Unregister-ScheduledTask -TaskName 'Lunch Linkoping - update menus' -Confirm:$false`.

**Backup – GitHub's own schedule:** every hour on weekdays (at :17 past, UTC). GitHub starts these
late on small repos (7.5–8.5 hours in Nov 2026), so they only catch up later in the day. Each check only refetches restaurants whose saved menu isn't from the current week yet (week number
read from the menu, e.g. "v.46" or "Vecka 46"), or that have no week number at all. So:

- Monday: restaurants that publish late (after 10:00) are picked up by the later checks.
- Tue–Fri: usually nothing to do – no commit, no redeploy.
- A site that is down keeps its last good menu instead of going blank.
- Until a restaurant has published this week's menu, its card shows "Inte uppdaterad – meny för v.NN".

GitHub turns off scheduled workflows in public repos after 60 days without activity. The weekly
menu commits should count as activity; if the schedule ever stops, re-enable it under Actions.

To refetch right away: GitHub → Actions → "Update lunch menus" → **Run workflow**
(tick "force" to refetch everything, even menus already from this week).
Locally: `node fetch-menus.mjs` (or `node fetch-menus.mjs --force`).

## Run it on this computer

```bash
node fetch-menus.mjs
node serve.mjs
```

Open http://localhost:8080

## Add a restaurant

Add an entry to `restaurants.json`:

```json
{
  "id": "short-unique-id",
  "name": "Restaurant name",
  "address": "Street 1, Linköping",
  "lunchUrl": "https://example.se/lunch",
  "start": "text where the menu starts",
  "end": "text right after the menu ends"
}
```

`start`/`end` are optional and just trim the page text. Run `node fetch-menus.mjs` and check the output.
Pages that are images, PDFs, or built purely with JavaScript won't give any text; the app then shows
a link to the lunch page instead.

## Get it on your phone

The app needs to be hosted somewhere, and the menus need refreshing each week. The simplest free way:

1. Create a private or public GitHub repo and push this folder to `main`.
2. In the repo: Settings → Pages → Source: **GitHub Actions**.
3. `.github/workflows/update-menus.yml` then fetches menus every weekday morning and publishes the site.
4. Open the Pages URL on your phone → Share → **Add to Home Screen** (iPhone) or ⋮ → **Install app** (Android).

Note: GitHub Pages sites are public even if the repo is private (on free accounts). That's fine for
restaurant menus, but don't put anything private in this folder.
