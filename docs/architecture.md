# LazyDM — Architecture

A snapshot of what the project is and where things live, for anyone reading or contributing to the code. For the rules behind it, read
[`design-principles.md`](design-principles.md); for setup and commands, the [`README`](../README.md); for publishing a version, [`releasing.md`](releasing.md).

## What it is

A desktop app for Dungeon Masters, lazy by design: prepare fast, run the session without friction.

- Content lives in plain `.md` files (plus `.json` encounters and maps) inside a user-owned folder, the *Codex*
  (`vault` in the code). The Codex stays Obsidian-compatible.
- SQLite is only a local, rebuildable index of the Codex.
- Electron owns the file system, the index and sync. Angular is the UI plus minor calculations.

## Status

Heading to 1.0. Built and working:

- Setup flow (Welcome, Codex step), Codex selection, cloud-folder readiness and conflict copies
- Indexer with a file watcher (links, tags, headings, frontmatter)
- Campaigns with per-campaign sections, sub-types, templates and a compendium
- Editor (Live preview, Source, Reading), links panel, rename with link refactoring, Review page
- Assets: paste, drop, import, inline audio, PDFs
- Encounter manager with tracker layouts (battle rules), party roster, cemetery and statuses
- Map with pins linked to files, and a built-in map drawing editor
- Folder home: search, filters, and List / Cards / Graph views of a section or folder (`documents:folderGraph` feeds the graph)
- Quick reference: the campaign's rules sheet on Cmd/Ctrl+R (`quick-reference.json`), D&D 5e built in
- Campaign export and import as a plain zip (`lazydm.json` manifest), also for MCP agents
- Tabs and split screen with shared live documents
- Seven languages (en, it, de, es, fr, uk, zh) and the dark and light themes

Current work: UI polish for 1.0 (plans in `.claude/plans/`). The phase-by-phase roadmap is in
`design-principles.md` §11, and open decisions are in §12.

## Technologies

| Area | Choice |
| --- | --- |
| UI framework | Angular 21 (standalone components, signals) |
| Desktop | Electron 44 |
| Styling | Tailwind CSS 4, class-variance-authority |
| Language | TypeScript 5.9 (Angular), JavaScript (Electron) |
| Index | Better-SQLite3 12 |
| Editor | CodeMirror 6 |
| i18n | ngx-translate 17 |
| Icons, toasts, charts | Lucide, ngx-sonner, ECharts |
| Tests | Vitest 4 (Angular and Electron) |

## Architecture

```text
┌──────────────────────────────────────┐
│  Renderer (Angular)                  │
│  pages, components, services         │
└──────────────────┬───────────────────┘
                   │ typed IPC channels
┌──────────────────┴───────────────────┐
│  Main process (Electron)             │
│  controllers → models                │
│  vault files · SQLite index · sync   │
└──────────────────────────────────────┘
```

| Path | What |
| --- | --- |
| `electron/controllers/` | Input validation and orchestration, one per feature (campaign, document, encounter, map, review, section, template, compendium…) |
| `electron/models/` | Data access: vault files, SQLite index; campaign zips: `campaign-bundle` (the `lazydm.json` manifest), `campaign-export`, `campaign-import`; the Quick reference: `quick-reference` (the file and its one reader) and `quick-reference-builtin` (seeding, *Start from…*, reset) |
| `electron/data/quick-reference/<system>/` | The built-in rules: `rules.json` (structure, credit line) and one `<language>.json` per language |
| `electron/utils/zip-*.js`, `path-utils.js` | Campaign zip support: `zip-reader` (hostile-zip reader over `yauzl`), `zip-paths` (entry name checks), `zip-limits` (caps), shared path helpers |
| `electron/mcp/` | The opt-in MCP server: tools, scope guard, folder importer and `bundles.js` (campaign zips) |
| `electron/database/` | SQLite setup, schemas, migrations |
| `electron/ipc/` | Channel names, handler registration, push events |
| `electron/preload.js` | Preload source (`preload.bundle.cjs` is generated, never edited) |
| `src/app/config/api.ts` | Typed IPC channels for Angular |
| `src/app/services/` | Angular services (`BaseIpcService` for IPC, workspace, file actions…) |
| `src/app/layout/` | Shell: sidebar, toolbar, panes, tab bar |
| `src/app/pages/` | Routed pages |
| `src/app/shared/components/` | ArcTechUI component library (35 component folders) |
| `public/i18n/` | Translations |

## Routes

| Route | Page |
| --- | --- |
| `/setup/welcome`, `/setup/vault` | Setup flow |
| `/campaigns` | Campaign list |
| `/campaigns/:slug` | Campaign overview, `review`, and `:section` pages with their notes, encounters and maps |
| `/compendium` | Systems and shared content |
| `/templates` | Template library |
| `/battle-rules` | *Tracker layouts* settings: pick the layout, row size and Follow the turn, with a live preview |
| `/settings/:section` | Settings |

## Adding a feature

1. Read the matching section of `design-principles.md`.
2. Add the controller and model in `electron/`, and the channel in `electron/ipc/channels.js` and
   `src/app/config/api.ts`.
3. Run `npm run build:preload` and commit the regenerated bundle whenever channels change.
4. Add the Angular service (extending `BaseIpcService`), the page or component, and the route.
5. Put every user-facing string in the i18n files, in all 7 languages, using the glossary words (§1b).
6. Run `npx ng build --configuration development`, `npm test` and `npm run test:electron`.

## Conventions

- Standalone components, signals, `inject()` and the `@/` alias.
- Semantic theme tokens only; both themes must work.
- Prettier: `printWidth: 100`, single quotes.
- Git: commit at the end of each completed step. The remote is `origin` (GitHub), and nothing is pushed unless the
  user asks.

---

**Created**: 2026-06-16
**Last updated**: 2026-11-24
