# LazyDM — Design Principles

The rules we agreed on for this project. Read this before designing or changing anything.
When a change would break one of these rules, update this file first (and agree on it).

---

## 1. Product model

LazyDM works like **Obsidian**, specialised for Dungeon Masters.

- The user's content lives in **plain `.md` files inside a folder the user owns** (the *vault*).
- LazyDM reads, renders and edits those files. It never locks content into a database.
- A vault must stay **Obsidian-compatible**: opening it in Obsidian must work.
- Single vault for now; every design choice must keep **multi-vault** possible later.

## 2. Vault layout

```text
<vault root>/                          chosen or created by the user (may live in iCloud, Box, Dropbox…)
├── .lazydm/                           vault config, synced with the vault (like .obsidian/)
│   ├── vault.json                     vault settings, template rules, folder/display-name mapping
│   └── …
├── _templates/                        note templates (scene.md, monster.md, character.md…)
├── compendium/                        vault-wide content shared across campaigns (monsters, spells…)
└── <campaign-slug>/                   one folder per campaign
    ├── campaign.md                    campaign card: display name, cover, description
    ├── assets/                        every non-.md file: images, maps, pdfs, sounds…
    ├── scenes/
    ├── characters/
    ├── monsters/
    ├── encounters/
    └── sessions/
```

- **Folder and file names are slugs**: lowercase kebab-case, `-` instead of spaces
  (`Lost Mine of Phandelver` → `lost-mine-of-phandelver`).
- The **human-readable name** lives in the content (`campaign.md` frontmatter / `title`), never in the folder name.
- A note's **`type` in its frontmatter decides what it is**; folders are only the default location.
  Moving files between folders must never break anything.
- Further default folders (`locations/`, `items/`, `lore/`) may be added later.
- A map is an image in `assets/` plus a `.md` card that embeds it.

## 3. Where data lives

**Rule: if a piece of data must follow the user to another device, it lives in the vault.**

| Location | Contents | Synced across devices |
| --- | --- | --- |
| `.md` frontmatter | `type`, `title`, `tags`, aliases, game fields (CR, HP…) | ✅ via the cloud folder |
| `.md` body | content and `[[links]]` | ✅ |
| `.lazydm/*.json` | template rules, folder/display-name mapping, vault settings | ✅ |
| Local SQLite | rebuildable index + device-local state | ❌ never |
| Device-local preferences | **theme, language** (renderer `localStorage` via `LocalPreferencesService`), Electron-side settings (`settings-store` userData JSON), current vault (`app_meta.current_vault_id`) | ❌ never |

### 3.1 SQLite is a local, rebuildable index

SQLite is **never** placed inside the vault and **never** synced (a SQLite file in iCloud/Box gets corrupted or creates conflict copies).
Every device builds its own index from the vault files; same files ⇒ same index.

Two database files, both under the app's userData folder:

- `lazydm.sqlite` — app level: `app_meta`, `vaults` (id, path, name, last opened; one row for now, the vault switcher later).
- `index/<vaultId>.sqlite` — one per vault:

| Table | Purpose |
| --- | --- |
| `files` | path (vault-relative), campaign, kind (md/asset), frontmatter `type`, title, size, mtime, content hash, frontmatter JSON |
| `links` | source file, raw target, resolved target (nullable), kind (link/embed) → backlinks, broken links, rename refactoring |
| `tags` | file ↔ tag |
| `headings` | file, level, text, line → `[[file#heading]]` and outlines |
| `files_fts` | FTS5 full-text search (title, body) |
| `workspace` | open tabs / active tab per campaign (device-local on purpose) |

Lifecycle:

1. **First open** of a vault on a device → full scan builds the index.
2. **Every start** (after the cloud-readiness check) → reconcile by mtime + size: re-index changed, add new, drop deleted.
3. **While running** → a file watcher keeps the index current (edits from LazyDM, Obsidian, Finder or sync).
4. **Corrupt or schema bump** → delete and rebuild. The index has a version number, never migrations.

Nothing in the index may be irreplaceable. If data cannot be rebuilt from the files, it does not belong in the index.

## 4. Process responsibilities

| Electron (main process) | Angular (renderer) |
| --- | --- |
| All file-system access, indexing, watching | UI only |
| Vault setup and validation | Rendering, navigation, tabs |
| Cloud-readiness check and sync waits | Minor calculations / formatting |
| Parsing frontmatter, links, tags | Calling IPC through the existing service layer |
| Saving with conflict detection | Showing conflicts and asking the user |

- Electron follows the existing **controller / model / IPC channel** pattern (`electron/controllers`, `electron/models`, `electron/ipc/channels.js`, `broadcast` for push events).
- Angular talks to Electron only through IPC (`BaseIpcService` and typed channels in `config/api.ts`).

Planned Electron modules: `vault`, `cloud-readiness`, `campaign`, `document`, `indexer`, `lazydm-asset://` protocol.

## 5. Cloud sync

- Sync is done **by the cloud provider**, not by LazyDM. LazyDM never copies its database anywhere.
- At startup LazyDM detects the provider from the vault path, finds **not-yet-downloaded placeholders**
  (iCloud dataless files, Dropbox/OneDrive on-demand files), triggers their download and **waits** with a
  progress screen and a timeout before indexing.
- Be honest about the limit: no provider tells us that another device has an edit still in flight.
  The safety net is **conflict detection on save**: compare the on-disk mtime + hash with the version that was
  loaded; if different, offer *reload / keep mine / save as copy*.
- Provider conflict copies (`file 2.md`, `(conflicted copy)`) are detected and shown to the user.

## 6. Links

- Obsidian syntax: `[[note-name]]`, `[[note-name|label]]`, `[[note-name#heading]]`, embeds `![[image.png]]`.
- Resolution by file name, campaign first, then `compendium/`.
- **Rename** (note toolbar → *Rename*): the new title gives the new kebab-case file name in the same folder;
  `title:` and the `# Heading` (if it still shows the old title) are updated. The sheet previews the notes linking
  here; with *Update links* (default on) every link the index resolved to the note is rewritten, keeping its form
  (bare name or path, `.md`, `#heading`, `|alias`, markdown links and embeds). Code blocks and inline code are never
  touched. Each rewrite is conflict-checked like a save: a note changed meanwhile is reported, not overwritten.
  Open tabs and their history follow the new URL. Unsaved edits are saved before renaming.
- Renames made outside LazyDM (Finder, Obsidian on another device) are **not** refactored: the other tool already
  rewrote the links, and LazyDM only sees a delete plus a new file.
- **Backlinks** live in a right side panel of the note (*Links* toggles it, open state per device): linking notes
  with the line that links, then the note's own broken links. It follows index updates.
- Unresolved links are shown as broken, never silently dropped: styled in the preview, listed in the note panel and
  in the per-campaign **Broken links** page (`/campaigns/<slug>/broken-links`, reachable from the overview).
- Moving notes between sections and deleting notes are not available yet.

## 7. Security

- **Path guard**: every path received from the renderer is resolved and rejected if it escapes the vault root.
- Rendered markdown is **sanitized** (vault content may come from other people through a shared folder).
- External links open in the system browser, never inside the app window.
- Assets are served through the `lazydm-asset://` protocol, scoped to the vault.

## 8. UI and navigation

- **First start** → vault setup page (select or create the root folder). Until a vault exists, every route redirects there.
- **Campaign list** → grid of campaigns; when empty, a CTA message with a *Create campaign* button.
- **Campaign layout** → current shell with the sidebar: campaign sections, *Settings*, and right below it a link
  button **Back to campaigns**.
- **Tab bar** above the header bar, browser-like, one set of tabs per campaign, restored per device
  (`workspace` table of the vault index; at most 30 tabs, each tab's URL stays inside its campaign).
  - Each tab has its **own back/forward history** (max 50 entries); navigating inside a tab drops its forward entries.
  - Click activates, × or middle-click closes, **+** opens the campaign overview. Cmd/Ctrl-click or middle-click on a
    campaign link opens it in a background tab.
  - **The last open tab cannot be closed**: with a single tab there is no ×, and close (menu, Cmd/Ctrl+W,
    middle-click) does nothing.
  - **Drag to sort** tabs (CDK drag-drop, horizontal). Each tab shows its section icon.
  - **Context menu** (right-click, or the menu key / Shift+F10 on a focused tab): on a campaign link — open, open in
    new tab, open in background tab; on a tab — new tab, duplicate, close, close others, close tabs to the right.
  - Active tab uses the Nordic Relic *page tabs* look: no fill, 3px bronze bottom border, strong bold text.
    The tablist has roving focus (arrows / Home / End move the focus, Enter activates).
  - Shortcuts: Cmd/Ctrl+T new tab, Cmd/Ctrl+W close tab (forwarded by the main process, so it no longer closes the
    window), Ctrl+Tab / Ctrl+Shift+Tab next/previous, Cmd/Ctrl+[ / ] back/forward.
  - Entering a campaign from its root restores the last active tab. The bar is hidden outside campaign pages.
- **Breadcrumb**: section and note pages show the path (`CAMPAIGN / SECTION /`, mono, linked) above the page title
  in the toolbar, so a restored tab always tells where it points.
- **Leaving a note with unsaved edits autosaves it** (tab switch, link, sidebar). If the save hits a conflict or an
  error, the navigation is cancelled and the conflict sheet / error toast is shown.
- **Editor**: CodeMirror 6, markdown source with live preview (Obsidian-like). Reading mode renders sanitized markdown.

## 9. ArcTechUI visual style (Nordic Relic)

The component library is **ArcTechUI** (formerly ZardUI): classes `ArcTech*`, selectors `arc-*`, inputs/outputs `arc*`,
provider `provideArcTech()`. Reference design: **Nordic Relic v0.3.3** in `nordic-relic-v033/` (`DESIGN-SPEC.md`,
`tokens.css`, `index.html`). Its palette and aesthetics are applied to the existing components; their behaviour,
variant keys and configuration stay as they are.

- **Theme and language are per-device** preferences (never stored in the vault).
- **Two themes**: the Nordic Relic dark and light palettes (cold mineral neutrals, a single bronze accent). Both are
  always supported; use semantic tokens, never raw colours in components.
  - Surfaces: `bg-background` (canvas), `bg-recessed` (inputs, editor, tracks), `bg-card` (panels, dialogs),
    `bg-raised` / `bg-popover` (headers, menus, tooltips, selected/active items), `bg-accent` (hover).
  - Borders: `border-border-subtle`, `border-input`/`border-border` (default 1px steel), `border-border-strong`
    (popups, dialog frames).
  - Text: `text-foreground-strong` (headings), `text-foreground`, `text-foreground-secondary`, `text-muted-foreground`.
  - Bronze: `primary` (fill), `highlight` (hover, focus ring), `primary-pressed` (active).
  - Semantic: `destructive`, `success`, `warning`, `info`/`mana`, `arcane`. Never use colour alone for state.
- **Square everything**: `--radius: 0`. Only popups and dialogs get a shadow.
- **Fonts** (bundled locally): Barlow Condensed (`font-display`) for titles and big numbers, IBM Plex Sans
  (`font-sans`) for UI and body, IBM Plex Mono (`font-mono`) for labels, nav items, table headers, chips and metadata.
- **Titles of pages, routes and cards end with a dot in the primary colour**:
  `{{ title }}<span class="text-primary" aria-hidden="true">.</span>` (no whitespace between text and dot).
- **Component rules**:
  - Buttons: primary is bronze fill → highlight on hover → pressed on active; secondary/outline are steel-bordered.
  - Focus: 2px `ring` (highlight) outline with offset.
  - Nav: the active item is raised surface + border + bronze text (mono, not uppercase).
  - Selected segments/tabs: bronze fill with canvas-coloured text.
  - Dialogs and sheets: no coloured header band, same surface throughout, large condensed title, a 2px
    `border-strong` frame; dialogs add the engraved divider
    `<div class="arc-engraved-divider" aria-hidden="true"><span></span></div>` under the title. Backdrop is
    `rgb(3 5 7 / 82%)`.
  - Alerts: full 1px border plus a 3px left bar in the state colour.
  - Badges/status chips: outlined, mono.
  - Tables: raised mono headers; selected row is the raised surface.
  - Tooltips: raised surface with a bronze border.
- **No decorative text or glyphs** from the reference demo (runes, mottos, fake archive codes, background grids…).
  Lucide icons stay.
- Changes to components are **look only**: variant keys, inputs, outputs and behaviour stay stable.

## 10. Code conventions

- Follow the **existing code patterns, utilities and style**. Reuse before adding.
- **Ask before creating** a new function or utility that has no similar existing counterpart, describing what and why.
- **Ask before adding a dependency**. Planned (to be approved in the phase that needs them):
  `yaml` (frontmatter), CodeMirror 6 (`@codemirror/state`, `view`, `lang-markdown`, `language-data`),
  `markdown-it` + `DOMPurify` (reading mode), possibly `chokidar` (if `fs.watch` is not reliable enough).
- When in doubt about requirements, ask.
- Angular: standalone components, signals, `inject()`, `@/` path alias, i18n keys for user-facing strings.

## 11. Roadmap

| Phase | Scope |
| --- | --- |
| 0 | Remove the legacy DB-snapshot sync and backup (useless once the DB is a cache) |
| 1 | Vault core: setup/selection, `.lazydm/vault.json`, `vaults` table, path guard, setup page + route guard |
| 2 | Indexer: per-vault index DB, scan, reconcile, watcher, frontmatter/links/tags/headings parsing |
| 3 | Cloud readiness at startup: provider detection, placeholder download, wait UI, conflict copies |
| 4 | Campaigns: create (slug + `campaign.md` + default folders), grid with empty CTA, campaign layout + back link |
| 5 | Documents: section lists, CodeMirror live preview, reading mode, wikilinks, assets, save with conflict detection, templates |
| 5.1 | Design-system alignment to Nordic Relic v0.3.3 (tokens, fonts, component look) |
| 6 | Tab bar |
| 6.1 | Tab bar usability: context menus, breadcrumb, drag to sort, overview tab rules, page-tabs style |
| 7 | Link maintenance: backlinks panel, rename with link refactoring, broken links page |
| 8 | Compendium and template rules |

## 12. Open decisions

- **Backup**: optional "zip the vault" backup to replace the removed DB backup — to be decided later.
