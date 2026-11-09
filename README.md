# LazyDM website

The landing page for [LazyDM](https://github.com/Tratt0re/lazydm). This is an orphan branch (`website`) with no
shared history with the app; the app lives on `main`.

Plain HTML, CSS and JS: no framework, no dependencies, no build step. English only for now.

## Run it

```bash
cd site
python3 -m http.server 8123   # then open http://127.0.0.1:8123/
```

## Layout

| Path | What |
| --- | --- |
| `site/index.html` | the page: one long LazyDM note |
| `site/assets/css/styles.css` | tokens, fonts and ornaments copied from the app (`src/styles.css`) |
| `site/assets/js/theme-init.js` | sets the theme before first paint (same `localStorage.theme` key as the app) |
| `site/assets/js/site.js` | theme switch, Source/Reading tabs, sample tracker, code map |
| `site/assets/fonts/` | Barlow Condensed, IBM Plex Sans and Mono, from the app |
| `PRODUCT.md` | who the site is for and which claims are settled (read before editing copy) |
| `.github/workflows/pages.yml` | deploys `site/` to GitHub Pages on every push to `website` |

## Rules

- Keep the tokens in step with the app. Light is `:root`, dark is `:root.dark`; use the semantic variables, never raw colours.
- Words follow the app's glossary: Codex, Combatant, Tracker layout, Links, Review, Info box.
- Do not claim a licence, a price, "open source" or a release date until they exist. See `PRODUCT.md`.
- Screenshots of the real app are still to be added (dark and light). The samples on the page are drawn for it and labelled as such.

## Deploy

One-time: repository Settings, Pages, Source: GitHub Actions. After that every push to `website` publishes `site/`.
Asset paths are relative, so the site works from `/lazydm/` or a custom domain.

## Provenance of assets

- `site/assets/img/dungeon-map.webp`: the sample dungeon map, supplied by the project owner (`map_41x36.webp`, resized to 2000px wide).
- Franco and every icon are drawn from the app's own data (`franco.icon.ts` and the Lucide set it uses), written into the icon sprite at the top of `site/index.html`.
- The sample note, encounter and map are made up for this page and labelled as such on it.
