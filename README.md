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
