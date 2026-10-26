# LazyDM

**LazyDM** is a desktop app for Dungeon Masters, built by a DM for DMs and lazy by design: prepare fast, run the
session without friction. Your campaigns live in plain Markdown files that you own.

## How it works

- Your content lives in plain **`.md` files inside a folder you own** (the *Codex*, called the vault in the code).
  LazyDM never locks it into a database.
- The Codex is ordinary Markdown in ordinary folders, and stays Obsidian-compatible: any Markdown editor can open it.
- SQLite is only a local, rebuildable index (search, links, tags). Delete it and it is rebuilt from the files.
- The Codex can live on the device or in a cloud-synced folder. LazyDM detects the provider, waits for placeholder
  files to download and handles conflict copies.

## Features

### Campaigns and notes

- **Campaigns** with a start card, a campaign overview and per-campaign **sections** (Enemies, Encounters, Assets…):
  hide, reorder, rename, add custom sections, sub-folders as sub-types.
- **Editor** (CodeMirror): Live preview, Source and Reading views remembered per note; clickable `[[wikilinks]]`,
  tables edited in place, info boxes, properties box, `◇` dividers, image width (half, wide, full), Cmd/Ctrl+B and
  Cmd/Ctrl+I, auto-close pairs and a right-click insert menu.
- **Links panel** (backlinks), rename with link refactoring, a linked-note preview card and **Review**, a page that
  lists broken links and misplaced, untyped or unknown notes, with a move that rewrites the links.
- **Templates** per note type and per campaign, with placeholders.
- **Compendium**: shared systems and content you can copy to and from campaigns.
- **Assets**: images, audio and PDFs. Paste or drop them anywhere, or use *Import from disk*. Audio plays inline and
  PDFs open in the system viewer.
- **Search** from the header and file actions everywhere: rename, copy, delete (to the system Trash) and move.

### Encounters and the map

- **Encounter manager**: encounters are `.json` files linked like assets (`![[ambush.json]]`). Combatants with
  initiative, a health bar (HP and temporary HP), statuses with round counters, a cemetery to recover the dead and
  a **party roster** you can add to any encounter.
- **Tracker layouts**: the row of a combatant is driven by a battle rule (`_battle-rules/`). Use the built-in
  *Default* layout, customise it, or write your own with dice-formula initiative and *Roll initiative*.
  A *Tracker rows* density setting makes the rows more compact.
- **Battle bar**: *Start battle*, *Stop battle*, next turn, with the round and the turn always visible.
- **Map**: pins that link to notes and files, with Copy, Edit and Delete in the "…" menu.

### Workspace

- **Tabs** with context menus, drag to sort and an icon-only open tab.
- **Split screen**: open any file to the side, drag tabs between the two panes, resize the divider. The same note in
  both panes edits one live document, and maps and encounters in both panes share one live state.
- **Customize menu**, toolbar "…" menus and a shortcuts reference in Settings.
- **Startup**: optionally open the last campaign at start (Settings → General → Startup).
- **Themes and languages**: *Nordic Relic* dark and light themes, in English, Italian, German, Spanish, French,
  Ukrainian and Chinese.
- **Setup flow**: a short Welcome step (name, language, theme) and a Codex step that explains device versus cloud
  folders.

## Tech stack

- **Framework**: Angular 21 (standalone components, signals)
- **Desktop**: Electron 44
- **Styling**: Tailwind CSS 4
- **Index**: Better-SQLite3 (local, rebuildable)
- **Editor**: CodeMirror
- **i18n**: ngx-translate
- **UI**: ArcTechUI, the in-house component library (Nordic Relic visual style)
- **Tests**: Vitest (Angular and Electron)

## Architecture

LazyDM uses an IPC-driven layered architecture:

- **Renderer**: Angular UI, sandboxed. It does the UI and minor calculations.
- **Main process**: Electron owns all file-system, index and sync logic. Controllers validate input and
  orchestrate, models access data.
- **Typed IPC**: channels are declared in `electron/ipc/channels.js` and `src/app/config/api.ts`.

The full set of rules (data placement, sync, security, UI, visual style, roadmap) is in
[`DESIGN_PRINCIPLES.md`](DESIGN_PRINCIPLES.md). Read it before changing anything.

## Project structure

```text
lazy_dm/
├── src/
│   ├── app/
│   │   ├── components/       # App components
│   │   ├── config/           # Typed IPC channels, preferences
│   │   ├── guards/           # Route guards (vault, campaign, launch)
│   │   ├── layout/           # Shell: sidebar, toolbar, panes, tab bar
│   │   ├── pages/            # Routed pages
│   │   ├── services/         # Angular services (IPC, workspace…)
│   │   └── shared/           # ArcTechUI component library
│   ├── assets/               # Fonts, icons
│   └── styles.css            # Theme tokens and utilities
├── electron/
│   ├── controllers/          # One controller per feature
│   ├── models/               # Data access (SQLite, files)
│   ├── database/             # Schema and migrations
│   ├── ipc/                  # Channels, handlers, push events
│   └── __tests__/            # Electron tests
├── public/i18n/              # Translations
├── scripts/                  # Build scripts
├── CLAUDE.md                 # Working notes for Claude Code
└── DESIGN_PRINCIPLES.md      # Source of truth for design
```

## Getting started

### Prerequisites

- Node.js 18+
- npm 11+

### Install

```bash
npm install
npm run build:preload
```

### Develop

```bash
npm run dev            # Angular dev server + preload watch + Electron
npm start              # Angular only, http://localhost:4200 (no Electron APIs)
```

### Test

```bash
npm test               # Angular unit tests (Vitest)
npm run test:electron  # Electron-side tests
npx ng build --configuration development   # fast type and template check
```

### Build

```bash
npm run build:prod     # production web build + preload bundle
npm run build:desktop  # unpackaged desktop app
npm run dist           # distributable for the current platform
npm run dist:mac       # or dist:win, dist:linux
```

`electron/preload.bundle.cjs` is generated by `npm run build:preload`. Never edit it by hand, and rebuild and commit it
whenever `electron/ipc/channels.js` changes.

## Development guidelines

- Standalone components, signals, `inject()` and the `@/` path alias.
- User-facing strings go through i18n keys, in all 7 languages. UI words follow the glossary in
  `DESIGN_PRINCIPLES.md` §1b (Codex, Combatant, Tracker layout, Links, Review…).
- Use semantic theme tokens (`bg-card`, `text-primary`…), never raw colours. Both themes must work.
- Prettier: `printWidth: 100`, single quotes.

## Status

Heading to 1.0. The Codex, editor, link maintenance, compendium, encounter manager, map, split screen and setup flow
are in place; the current work is UI polish. The roadmap is in `DESIGN_PRINCIPLES.md` §11.

## License

Private project. All rights reserved.

## Author

Salvatore De Luca
