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
| `site/assets/js/site.js` | the theme menu (System, Light, Dark) and the code map (a port of the app's `code-map.ts`) |
| `site/assets/img/shots/` | screenshots of the real app, one dark and one light each (see below) |
| `site/assets/fonts/` | Barlow Condensed, IBM Plex Sans and Mono, from the app |
| `PRODUCT.md` | who the site is for and which claims are settled (read before editing copy) |
| `.github/workflows/pages.yml` | deploys `site/` to GitHub Pages on every push to `website` |

## Rules

- Keep the tokens in step with the app. Light is `:root`, dark is `:root.dark`; use the semantic variables, never raw colours.
- Words follow the app's glossary: Codex, Combatant, Tracker layout, Links, Review, Info box.
- Do not claim a licence, a price, "open source" or a release date until they exist. See `PRODUCT.md`.
- Every screenshot has a `-dark` and a `-light` file; the page shows the one that matches the theme. Retake both together.

## Deploy

One-time: repository Settings, Pages, Source: GitHub Actions. After that every push to `website` publishes `site/`.
Asset paths are relative, so the site works from `/lazydm/` or a custom domain.

## Provenance of assets

- `site/assets/img/shots/*`: screenshots of the real LazyDM app (Angular build, 1440x900 at 2x, resized to 1920px wide), running in a browser with a faked `window.electronAPI` and made-up data (campaign "Lost Mine", the encounter and scene "Ambush at the fort"). The map is the sample dungeon supplied by the project owner.
- Franco and every icon are drawn from the app's own data (`franco.icon.ts` and the Lucide set it uses), written into the icon sprite at the top of `site/index.html`.

## Retaking the screenshots

Start the app's dev server (`npx ng serve` in the app repo), load `/campaigns/lost-mine` with a fake `window.electronAPI` (the app repo has `.claude/plans/mock-electron-rich.js` as a starting point), and capture the encounter, the map, a note and the split screen (open `/campaigns/lost-mine` with `window.__workspace` set to a left tab and a right tab) in both themes at 1440x900.
