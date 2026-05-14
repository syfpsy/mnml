# mnml landing site

Self-contained static page at `site/index.html`. No build step — pure HTML, one CSS file, one short JS file. Hosted on Vercel.

## What's here

| File | Purpose |
|---|---|
| `index.html`   | Page markup. Hero, faux compact-view demo, four principles, three feature blocks, specs grid, install CTA, footer. Theme toggle in header. |
| `styles.css`   | Token system (mirrors the desktop app) + layout. Dark + light themes via `html.light` class. ~550 lines. |
| `main.js`      | Two effects: theme toggle (persists to localStorage, follows system preference until the user picks) and reveal-on-scroll for `[data-reveal]` sections. Page works fully without JS. |
| `favicon.svg`  | 32×32 emerald dot on the cool-tinted dark bg. |
| `og.svg`       | 1200×630 Open Graph card. SVG renders identically in every link unfurler Vercel serves through its CDN. |
| `mnml-setup.exe` | The actual installer. Not in git (binary). Drop the latest build here when you ship; the page links to it directly via `<a href="mnml-setup.exe">`. |

The download buttons are static `<a>` links to a local `mnml-setup.exe`. No GitHub Releases fetching — the page works against a private repo because the binary is served from the same origin as the site.

## Themes

Dark by default. Light mode is a full token override under `html.light` — body, demo widget, kbd pills, code blocks all theme. The header toggle persists the choice to `localStorage` under `mnml-theme`. If the user has never clicked it, the page follows `prefers-color-scheme` and updates live when the OS theme changes.

## Local preview

Any static server works:

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

The site is hosted on **Vercel**. Project config is at `vercel.json` in the repo root: no build step, `outputDirectory: "site"`, immutable cache on images, short cache on CSS/JS. Production deploys happen via `vercel --prod` from a local checkout — never automatic, never unprompted.

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
