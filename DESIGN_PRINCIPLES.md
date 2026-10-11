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
- Renaming or moving a file updates the links that point to it.
- Unresolved links are shown as broken, never silently dropped.

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
- **Tab bar** above the header bar, browser-like, one set of tabs per campaign, restored per device.
- **Editor**: CodeMirror 6, markdown source with live preview (Obsidian-like). Reading mode renders sanitized markdown.

## 9. ArcTechUI visual style (Techno-Brutalism / Retro-Futurism)

The component library is **ArcTechUI** (formerly ZardUI): classes `ArcTech*`, selectors `arc-*`, inputs/outputs `arc*`,
provider `provideArcTech()`. Reference design: `arcane-ledger-dashboard-ui-style/`.

- **Theme and language are per-device** preferences (never stored in the vault).
- **Two themes**: dark (the reference palette) and a matching **parchment** light variant. Both are always supported;
  use semantic tokens (`bg-card`, `text-primary`, `border-input`…), never raw colours in components.
- **Square everything**: `--radius: 0`. No rounded shapes by default, no soft UI shadows.
- **Fonts**: IBM Plex Mono for the UI/body, Barlow Condensed (`font-display`) for headings and big numbers. Fonts are bundled locally.
- **Typography**: labels, table headers, buttons and nav items are uppercase with wide letter-spacing.
- **Titles of pages, routes and cards end with a dot in the primary colour**:
  `{{ title }}<span class="text-primary" aria-hidden="true">.</span>` (no whitespace between text and dot).
- **Accents**: primary-filled buttons, gold active nav item, gold title bar on dialogs, 3px left bar for notices and
  selected rows, inverted selected segments.
- **No decorative text or glyphs** from the reference demo (runes, mottos, fake archive codes…). Lucide icons stay.
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
| 6 | Tab bar |
| 7 | Link maintenance: backlinks, rename refactoring, broken links |
| 8 | Compendium and template rules |

## 12. Open decisions

- **Backup**: optional "zip the vault" backup to replace the removed DB backup — to be decided later.
