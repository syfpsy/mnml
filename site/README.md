# mnml landing site

Self-contained static page at `site/index.html`. No build step — pure HTML, one CSS file, one short JS file. Hosted on GitHub Pages.

## What's here

| File | Purpose |
|---|---|
| `index.html`   | Page markup. Hero, faux compact-view demo, four principles, three feature blocks, specs grid, install CTA, footer. |
| `styles.css`   | Token system (mirrors the desktop app) + layout. ~500 lines. |
| `main.js`      | Two effects: fetch the latest GitHub Release on load and rewrite the download buttons; reveal sections on scroll. Page works fully without JS — the static download link points to `releases/latest`. |
| `favicon.svg`  | 32×32 emerald dot on the cool-tinted dark bg. |
| `og.svg`       | 1200×630 Open Graph card. SVG renders identically in all link unfurlers Pages serves through CDN. |

The download buttons fetch the latest release's `.exe` asset and stamp version + size + date — so you don't have to edit the page when you ship `npm run release`.

## Local preview

Any static server works. Two zero-install options:

```powershell
# Python (already on most machines)
cd site
python -m http.server 8080
# → http://localhost:8080

# Or Node's built-in
cd site
npx --yes http-server -p 8080
```

## Deploy

The site is hosted on **Vercel**. Project config is at `vercel.json` in the repo root: no build step, `outputDirectory: "site"`, immutable cache on images, short cache on CSS/JS.

### Auto-deploy

Once the Vercel project is linked to the GitHub repo (one-time, via the Vercel dashboard's **Git** tab → connect the `syfpsy/mnml` repo), every push to `master` redeploys. The `site/` folder is the build output; the rest of the repo is ignored.

### Manual deploy

From a local checkout:

```powershell
vercel --prod
```

The CLI uploads the project files directly (doesn't need a GitHub push first), so you can preview production-builds before committing.

### Custom domain

In the Vercel dashboard: **Project → Settings → Domains → Add**. Point a CNAME / ALIAS record at `cname.vercel-dns.com`.

## Editing

The site shares **only the colour token names** with the desktop app — no shared source. If you re-tune `--accent-*` or `--t*` in `src/styles.css`, mirror the changes here. The demo widget in the hero is also a hand-built recreation; if the app's overlay window changes structurally (different sections, different rows), update the hero HTML to match.

## Anti-patterns deliberately avoided

- No gradient text.
- No glassmorphism. (One soft radial glow behind the demo widget — not blurred.)
- No identical card grid. The three feature blocks alternate alignment.
- No hero-metric template (big-number-small-label-stat).
- No em dashes in user-visible copy.
- No web font requests. System stack only — `Segoe UI Variable Display` first, falls back gracefully.
