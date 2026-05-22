# mnml — design system

The visual + interaction language shared by the app (`src/`) and the landing site
(`site/`). Source of truth for color, type, the brand mark, focus/a11y, and the
anti-patterns we refuse. Product intent: [`PRODUCT.md`](./PRODUCT.md). Code:
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Two surfaces, one identity

| Surface | Register | Tokens |
| --- | --- | --- |
| Desktop app | **product** (design serves the tool) | `src/styles.css`: `:root` (dark) + `html.light` |
| Landing site | **brand** (design IS the product) | `site/styles.css`: mirrors the same token *names* |

They share **token names, not source** — no shared stylesheet. Change a color in
one, mirror it in the other. The site hero is a hand-built recreation of the app
window; if the app's layout changes structurally, update the hero HTML.

## Color

Strategy: **Restrained** — tinted neutrals carry the surface; accents are used
sparingly and semantically. Primary UI accent is emerald (`--accent-app`); warm
orange (`--brand-dot`) is **brand identity only**.

### Neutrals (never pure black/white)

Dark = cool-tinted, light = warm-tinted. Text tokens are calibrated to **WCAG AA**
against `--bg`; the ratios below are the floor — don't lower them.

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--bg` | `#0e0f12` | `#fafaf8` | window background |
| `--bg-raised` | `#181a1f` | `#f0f0ec` | search bar, sheet |
| `--t1` | `#e8e8e6` (~14.5:1) | `#15151a` (~16:1) | primary text |
| `--t2` | `#9494a0` (~6.5:1) | `#565660` (~6.9:1) | secondary text |
| `--t3` | `#7e7e85` (~5:1) | `#69696f` (~5.1:1) | hint / footer / placeholder |
| `--border` / `--border-focus` | white 9% / 40% | black 10% / 45% | hairlines / generic focus |
| `--item-hover/active/selected` | white 5/10/10% | black 4/8/8% | row states |

### Category + semantic accents

Dark uses the bright base on any surface; light needs a darker `-text` variant for
small text (4.5:1) while the base covers graphical use (3:1). Each group also
defines `-bg` (tile fill) and `-row`/`-row-hover` (the inline `--item-tint`).

| Group | Dark | Light | Light `-text` | Use |
| --- | --- | --- | --- | --- |
| `--accent-text-*` (blue) | `#60a5fa` | `#2563eb` | `#1e3a8a` | text items |
| `--accent-link-*` (violet) | `#a78bfa` | `#7c3aed` | `#5b21b6` | link items |
| `--accent-image-*` (rose) | `#fb7185` | `#e11d48` | — | image items |
| `--accent-app` (emerald) | `#34d399` | `#10b981` | `#047857` | launcher + **primary UI accent** |
| `--accent-saved` (sky) | `#38bdf8` | `#0284c7` | `#075985` | saved snippets |
| `--accent-danger` (red) | `#ef4444` | `#dc2626` | — | destructive |
| `--accent-pinned` (amber) | `#f59e0b` | `#d97706` | — | pin marker |
| `--brand-dot` (orange) | `#fb923c` | `#ea580c` | — | **brand mark only** |

Also: `--accent-info`/`--accent-success` (+`-bg`/`-border`/`-btn`) for the update
banner; `--accent-highlight-bg` (amber ~22%) for search matches; `--focus-search`
(sky-300 dark / sky-600 light) for the search ring; `--scrim` + `--elevation-2`
themed per mode. Rule of thumb: **base accent for graphical surfaces, `-text`
variant for small text overlays.**

## Typography

System stack, **no web fonts** (`"Segoe UI Variable Display"` first, graceful
fallbacks), antialiased. The UI is dense and small by design (11–13px chrome);
hierarchy comes from weight + the `--t1/--t2/--t3` ramp, not many sizes.

## Brand mark (two tiers)

- **Full logomark** (icon / OG / marketing): small-caps "M" with a V counterform
  (SVG `fill-rule="evenodd"`) + a warm orange dot, on a cool-dark rounded square.
  Master `build/icon.svg` → `icon-{16..256}.png` + `icon.ico` + `tray.png` via
  `npm run icons`; site favicon is the same geometry at 32 px.
- **Compact wordmark** (inline UI / site chrome): `•mnml` — `--brand-dot` + lowercase
  wordmark.

**Orange is identity only.** Functional UI and the launcher accent stay emerald.

## Focus & accessibility

One keyboard-only indicator (`:focus-visible`, never on mouse click):

- Generic: `2px solid var(--border-focus)`, 2px offset.
- Search bar: its own 1px `--focus-search` box-shadow on the wrapper; children opt
  out of the generic outline so signals don't stack.
- List rows: a **1px inset ring** on `aria-selected` rows (the real WCAG 1.4.11
  indicator) + a subtle bg shift. **Never a colored side-stripe** (banned).

Proper ARIA throughout: `listbox`/`option` + `aria-activedescendant`,
`tablist`/`tab`/`tabpanel`, `aria-modal` Settings sheet with the rest `inert`.
Placeholders pinned to `--t3` (not the browser 50%, which fails AA in light). AA in
both themes.

## Motion & layout

- Color transitions ~120 ms ease. **Never animate layout properties.** No bounce/elastic.
- The site adds reveal-on-scroll for `[data-reveal]` and one soft radial glow (not a
  blur); it works fully without JS.
- One window, 440×540, frameless: header (drag) + tab strip + scrollable content +
  optional banner + footer. Scrollbars hidden, scroll works. Drag via `.mnml-drag`,
  opt out with `.mnml-no-drag`. Vary spacing for rhythm; no card-in-card.

## Anti-patterns we refuse ("AI slop")

If you're about to add one, stop and rework the element.

- No **gradient text** (`background-clip:text`) — emphasis via weight/size, one solid color.
- No **glassmorphism** as decoration (the site's single radial glow is not a blur).
- No **colored side-stripe borders** on rows/cards/callouts.
- No **hero-metric template**, no **identical card grid** of icon+heading+text.
- No **web fonts** / generic "Inter everywhere" — system stack only.
- No **pure `#000`/`#fff`** — tint every neutral.
- No **em dashes in user-visible UI copy** (this rule is for shipped copy; these
  engineering docs keep the repo's prose style).

## Editing checklist

1. Change a token → update **both** `src/styles.css` and `site/styles.css`.
2. Touch contrast → re-verify AA in both themes; keep `-text` variants for light text-on-tint.
3. New interactive element → give it the `:focus-visible` ring + an `aria-label` if icon-only.
4. New color → justify against the map above. Restrained beats rainbow.
