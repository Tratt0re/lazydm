<div align="center">

# LazyDM website.

**The landing page for [LazyDM](https://github.com/Tratt0re/lazydm): prep at your desk, run at the table.**

Live at [lazydm.com](https://lazydm.com) · App repository: [Tratt0re/lazydm](https://github.com/Tratt0re/lazydm)

</div>

> This is the `website` branch. It is an orphan branch with no shared history with the app, which lives on `main` and
> `develop`. Every push here publishes the site; nothing on this branch is part of the app.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/social-card-dark.png" />
  <img src="docs/social-card-light.png" alt="LazyDM. Prep at your desk. Run at the table." />
</picture>

## What it is

One long page written as a LazyDM note: a Properties box, a title with Franco, an Info box, and sections for preparing,
running the table, maps, split screen, sync and the optional AI connection. It uses the app's own theme tokens and
fonts, with a System, Light and Dark theme menu, framed screenshots that tilt into place on scroll, and a code map
down the side that lists the section titles, as in the app.

Plain HTML, CSS and JS: no framework, no dependencies, no build step. English only for now.

## Run it

```bash
cd site
python3 -m http.server 8123   # then open http://127.0.0.1:8123/
```

## Layout

| Path | What |
| --- | --- |
| `site/index.html` | The page, and the icon sprite at its top |
| `site/assets/css/styles.css` | Tokens, fonts and ornaments copied from the app (`src/styles.css`) |
| `site/assets/js/theme-init.js` | Sets the theme before first paint (same `localStorage.theme` key as the app) |
| `site/assets/js/site.js` | The theme menu, the scroll-driven tilt of the screens and the code map (a port of the app's `code-map.ts`) |
| `site/assets/img/screens/` | Screenshots of the real app, one dark and one light each, at 2400 and 960 px wide (3:2) |
| `site/assets/img/loops/` | Short animated WebP loops of the app (960 px, and 1280 px for the larger view), dark and light |
| `site/assets/video/` | The 35 second tour (desktop and mobile), opened on request, and the app clips from `docs/clips` |
| `site/assets/img/og.png` | The share image used by Open Graph and Twitter cards |
| `site/assets/fonts/` | Barlow Condensed, IBM Plex Sans and Mono, from the app |
| `site/CNAME`, `robots.txt`, `sitemap.xml` | Domain and search files |
| `docs/social-card-light.png`, `docs/social-card-dark.png` | The themed 1280x640 social preview cards shown above |
| `PRODUCT.md` | Who the site is for and which claims are settled (read before editing copy) |
| `.github/workflows/deploy.yml` | Publishes `site/` to the `gh-pages` branch |

## Rules

- Keep the tokens in step with the app. Light is `:root`, dark is `:root.dark`; use the semantic variables, never raw colours.
- Words follow the app's glossary: Codex, Combatant, Tracker layout, Links, Review, Info box.
- Do not claim a price, a release date or "open source". The app is source-available under the PolyForm Noncommercial
  License, which is not an OSI open source licence. See `PRODUCT.md`.
- Every screenshot has a `-dark` and a `-light` file; the page shows the one that matches the theme. Retake both together.
- If the domain changes, change the canonical, Open Graph, JSON-LD, `robots.txt`, `sitemap.xml` and `CNAME` together.

## Deploy

The site is published the same way as the portfolio site:

1. A push to `website` runs `.github/workflows/deploy.yml`.
2. The workflow copies the contents of `site/` (and a `.nojekyll` file) into a fresh commit and force-pushes it to the
   `gh-pages` branch.
3. GitHub Pages serves `gh-pages` from its root, with the custom domain `lazydm.com`.

One-time setup in the repository: Settings, Pages, Source: **Deploy from a branch**, Branch: **`gh-pages`** / **root**,
Custom domain: `lazydm.com`, then **Enforce HTTPS**. The `CNAME` file in `site/` is carried into every deploy, so the
domain survives each one.

DNS at the registrar: four `A` records on `@` (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
`185.199.111.153`), the four matching `AAAA` records (`2606:50c0:8000::153` to `2606:50c0:8003::153`), and a `CNAME` for
`www` pointing to `tratt0re.github.io`.

## Provenance of assets

- `site/assets/img/screens/*`, `loops/*` and `video/*`: screenshots, loops and clips of the real LazyDM app, made with the
  app's own capture scripts (`scripts/capture-screens.mjs` and `scripts/record-clips.mjs` on the `develop` branch) on a
  local demo vault with made-up data (campaign "The Ember Crown": Castle of Drake, Captain Vex, the Keep of Drake map).
  The map and the character art were supplied by the project owner.
- Franco and every icon are drawn from the app's own data (`franco.icon.ts` and the Lucide set it uses), written into
  the icon sprite at the top of `site/index.html`.

## Retaking the screenshots

On the app's `develop` branch: build the local demo vault (kept out of git), start `npm start` and the app with
`LAZYDM_USER_DATA=/tmp/lazydm-demo npx electron . --remote-debugging-port=9333`, then run
`node scripts/capture-screens.mjs <demo-vault> <out>` for the stills and `node scripts/record-clips.mjs <demo-vault> <out>`
for the clips (set `CLIP_THEME=light` for the light ones). Convert the stills to WebP at 2400 px and 960 px wide, and the
clips the page loops to animated WebP at 960 px and 1280 px (10 fps, `img2webp -lossy`). Both themes are always made together.

## License

The website follows the app's licence: [PolyForm Noncommercial License 1.0.0](https://github.com/Tratt0re/lazydm/blob/main/LICENSE).

## Author

Salvatore De Luca ([@Tratt0re](https://github.com/Tratt0re))
