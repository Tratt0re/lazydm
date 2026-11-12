# CLAUDE.md

LazyDM — a desktop app for Dungeon Masters (Electron 44 + Angular 21 + Tailwind 4).
Content lives in `.md` files inside a user-owned vault folder; SQLite is only a local, rebuildable index.

**Read [`docs/design-principles.md`](docs/design-principles.md) before designing or changing anything.** It is the source of
truth for architecture, data placement, sync, security, UI and visual style. If a change would break one of its
rules, propose an update to that file first and get agreement.

## Commands

```bash
npm run dev                              # Angular dev server + preload watch + Electron (electronmon)
npm start                                # Angular only, http://localhost:4200 (no Electron APIs)
npx ng build --configuration development # fast type/template check
npm run build:prod                       # production web build + preload bundle
npm test                                 # vitest via Angular unit-test builder
```

A build with no errors is the minimum check after every change. The 3 `NG8113` warnings about unused
`ArcTechIconComponent` imports in the placeholder pages are pre-existing.

## Project map

| Path | What |
| --- | --- |
| `docs/` | `design-principles.md` (source of truth) and `architecture.md`; `docs/images/` holds the README screenshots |
| `electron/main.js` | app lifecycle |
| `electron/controllers/` | input validation + orchestration, one controller per feature |
| `electron/models/` | data access (SQLite, file system) |
| `electron/ipc/channels.js`, `handlers.js`, `broadcast.js` | IPC channel names, handler registration, push events |
| `electron/database/` | SQLite setup, schema (`schemas/*.sql`), migrations |
| `electron/utils/settings-store.js` | device-local JSON settings (theme, language…) |
| `electron/preload.js` | preload source; `preload.bundle.cjs` is **generated** (`npm run build:preload`), never edit it |
| `src/app/config/api.ts` | typed IPC channels for Angular |
| `src/app/services/` | Angular services (`BaseIpcService` for IPC) |
| `src/app/layout/` | app shell: root layout, sidebar, toolbar, header, breadcrumb |
| `src/app/shared/components/` | **ArcTechUI** component library |
| `src/app/components/`, `src/app/pages/` | app components and routed pages |
| `src/styles.css`, `src/styles/fonts.css` | theme tokens (dark + light), utilities, fonts |
| `src/assets/` | bundled fonts and icons (the folder name `assets` is intentional — do not rename) |
| `public/i18n/*.json` | translations (en, it, de, es, fr, uk, zh) |

## Conventions

- **Follow existing patterns.** Reuse existing functions and utilities; match the surrounding code's style.
- **UI words follow the glossary** in `docs/design-principles.md` §1b (Codex, Combatant, Tracker layout, Links, Review…).
  Code, files and folders keep their technical names (`vault`, `entity`, `battleRules`).
- **Ask first** before creating a new function/utility with no similar existing counterpart (say what and why),
  and before adding any npm dependency.
- **When requirements are unclear, ask.** Analyze the involved files and present a plan before larger changes.
- Electron owns all file-system and sync logic; Angular is UI plus minor calculations.
- Angular: standalone components, signals, `inject()`, `@/` path alias, `ChangeDetectionStrategy.OnPush` in the
  shared library, user-facing strings through i18n keys.
- Prettier: `printWidth: 100`, single quotes.

### ArcTechUI

- Naming: classes `ArcTech*`, selectors `arc-*` (`<arc-button>`, `button[arc-button]`), inputs/outputs `arc*`
  (`arcType`, `arcSize`), provider `provideArcTech()`, id directive `arcTechId`, tokens `ARC_*`.
- Styles live in `*.variants.ts` (class-variance-authority) merged with `mergeClasses()` from `@/shared/utils/merge-classes`.
- Use semantic tokens (`bg-card`, `text-primary`, `border-input`…), never raw colours; both themes must work.
- Square shapes; `font-display` (Barlow Condensed) for titles, `font-sans` (Plex Sans) for UI, `font-mono` (Plex Mono) for labels/metadata. Use the ArcTechUI surface tokens (`bg-recessed`, `bg-card`, `bg-raised`) — see docs/design-principles.md §9.
- **Page, route and card titles end with a primary-coloured dot**:
  `{{ title }}<span class="text-primary" aria-hidden="true">.</span>` — no whitespace before the span.
- No decorative text with fake meaning (runes, mottos, fake codes…). The ornamental symbols of the design (◇ ✣ ◇) stay, used sparingly and with a job (docs/design-principles.md §9).

## Workflow

- The git remote is `origin` (https://github.com/Tratt0re/lazydm.git). Never push unless the user asks.
- Commit at the end of each completed phase/step with a descriptive message.
- Verify UI changes visually (`npm start`, check dark and light themes) when possible.
- Before deleting files, list them and get confirmation.

## Gotchas

- The shell is **zsh**: unquoted `$VAR` lists are not word-split (use `bash -c` or arrays), and `====` lines expand.
- Tailwind radius tokens derive from `--radius: 0`, so `rounded-sm/md/lg` render square; `rounded-full`/`rounded-xl` do not.
- ngx-sonner toasts are themed through `--ngx-sonner-*` variables in `toast.variants.ts`, not global CSS.
