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
├── _templates/                        note templates (scene.md, enemy.md, character.md…)
├── compendium/                        cross-campaign material, one folder per "system"
│   └── <system-slug>/                 created by the user (a game, a setting, anything reused)
│       ├── system.md                  system card: display name, description
│       └── <folders on demand>        sessions/, enemies/, assets/, notes/… appear with their first file
└── <campaign-slug>/                   one folder per campaign (section folders appear with their first file)
    ├── campaign.md                    campaign card: display name, cover, description
    ├── scenes/                        type: scene
    ├── characters/                    type: character
    ├── enemies/                       type: enemy
    │   └── <sub-type>/                one level of sub-folders: subtype: <folder name> (e.g. monsters, humans)
    ├── spells/                        type: spell
    ├── items/                         type: item
    ├── quests/                        type: quest
    ├── locations/                     type: location
    ├── world/                         type: world (lore, factions, history, deities)
    ├── encounters/                    special linkable files, format to be designed (see §12)
    ├── handouts/                      type: handout (letters, clues; may embed images from assets/)
    ├── sessions/                      type: session
    ├── assets/                        every non-.md file: images, maps, pdfs, sounds…
    └── <custom sections>/             added per campaign (see §2a), e.g. factions/ → type: faction
```

- **Folder and file names are slugs**: lowercase kebab-case, `-` instead of spaces
  (`Lost Mine of Phandelver` → `lost-mine-of-phandelver`).
- The **human-readable name** lives in the content (`campaign.md` frontmatter / `title`), never in the folder name.
- A note's **`type` (and optional `subtype`) in its frontmatter decides what it is**, and its folder should agree
  with it (§2a). When they disagree LazyDM **reports it and offers a fix; it never blocks the note and never moves
  it on its own**. Links resolve by name, so a note in the wrong folder keeps working.
- A map is an image in `assets/` plus a `.md` card that embeds it.
- **Media files** (images: png, jpg, gif, webp, svg, avif; pdf; audio: mp3, wav, ogg, m4a, flac) pasted into a
  note, dropped on the Assets section or imported from disk are **saved right away** in the scope's own `assets/`
  (`<campaign>/assets/`, `compendium/<system>/assets/`) and, from a note, embedded at the cursor as `![[name.ext]]`
  (Obsidian-compatible); a toast tells where the file went. File name: the original name as a slug
  (`pasted-<timestamp>.<ext>` for a pasted screenshot); a taken name gets a `-<timestamp>` suffix — an asset is
  never overwritten.

## 2a. Sections (campaign folders)

- A **section** is a top-level folder of a campaign bound to one note type: key (folder slug), type, label, icon.
  The **default sections** are the ones in §2 (Electron owns the list and sends it to Angular, with each campaign's
  settings applied — no list kept in sync by hand).
- **Per-campaign settings** in `.lazydm/vault.json` → `sections.campaigns.<slug>`:
  - `hidden`: default sections not shown in the sidebar (their files stay indexed and linkable; the settings show
    *hidden, N notes inside*);
  - `order`: the sidebar order;
  - `labels`: display names (`characters` → *NPCs*); the folder on disk keeps its name;
  - `custom`: the campaign's own sections (`{ key: 'factions', type: 'faction', label: 'Factions', icon: 'flag' }`),
    with a user-written label (not translated). A custom type gets a generic built-in template.
- **Folders appear on demand**: a section exists from the settings; its folder is created with its first file.
  Opening a campaign no longer creates empty folders (existing empty ones are left alone).
- **Folders are never renamed on disk** by LazyDM (renaming a section = changing its label). Hiding is not deleting:
  LazyDM never deletes a section folder.
- **Sub-folders**: one level inside a section, created from the section page (*New folder*). A sub-folder is a
  **sub-type**: notes in `enemies/humans/` have `type: enemy` and `subtype: humans` (a separate frontmatter field,
  the sub-folder slug). New notes created inside a sub-folder get both. Sub-folders share the section's template
  (one template per section; per-sub-type templates may come later). Deeper folders are **ignored** (their files
  are not listed in sections) and reported (see *Review* below).
  The section page lists its sub-folders (with file counts) above its notes; a sub-folder opens on the same page
  (`/<section>?folder=<name>`, breadcrumb `CAMPAIGN / SECTION /`), where *New note* creates notes in it and *New
  folder* is not offered (one level). A note in a sub-folder opens at `/<section>/<sub-folder>/<note>` with the
  breadcrumb `CAMPAIGN / SECTION / SUB-FOLDER /`.
- **Section page as a tree**: sub-folders are collapsible rows showing their files inline (their name still opens
  the sub-folder view). Files can be dragged onto a sub-folder, or onto the *main folder* target shown while
  dragging, to move them (one section only); right-click a file for *Move to…* (main folder or a sub-folder) and
  *Reveal in Finder* (*Show in Explorer* / file manager elsewhere), a folder for *Open* and *Reveal*.
- **Special sections**: *Assets* (any non-`.md` file) and *Encounters* (special files) hold no plain notes — they
  offer *New folder* and *Import* but no *New note*; their sub-folders only organise files (no `subtype`), and the
  Review page does not check them. *Assets* also offers **Import from disk** (toolbar): a sheet with *Select
  files* (the system file dialog) and a drop zone; media files can also be dropped straight on the section page
  (or on one of its sub-folders).
- **Enemies** (formerly *Monsters*): folder `enemies/`, type `enemy`. `type: monster` is still read as `enemy`, so
  old files coming back through sync are not misplaced. A one-time migration (vault format version in
  `vault.json`) renames `monsters/` → `enemies/` in campaigns and systems and rewrites `type:`, the template rules,
  `_templates/monster.md` and `[[monsters/…]]` path links.
- **Review** (per campaign, `/campaigns/<slug>/review`, replacing the *Broken links* page; also per system): every
  disagreement between files and sections, computed from the index so it follows changes made outside LazyDM
  (Finder, Obsidian, sync). The overview alert with its *Review* button shows when there is anything to review.
  Groups, each row with a fix menu (the user chooses; no default fix):

  | Problem | Example | Fixes |
  | --- | --- | --- |
  | Broken link | see §6 | *Remove link, keep text* · *Create note…* |
  | Misplaced: the type belongs to another section | `type: enemy` in `locations/` | *Set type to Location* · *Move to Enemies* |
  | Wrong sub-type | `subtype: monsters` in `enemies/humans/` | *Set sub-type to humans* · *Move to enemies/monsters* |
  | No type | a note written in Obsidian | *Assign type Enemy, sub-type humans* (from its folder) |
  | Outside any section | a note at the campaign root | *Move to…* (pick a section / sub-folder) |
  | Unknown folder | `lost-mine/factions/` | *Add as custom section* (type from the folder name, editable) |
  | Unknown sub-folder | `enemies/undead/` with notes of another sub-type | listed as *Wrong sub-type*: *Fix all* sets `subtype` on its notes |
  | Too deep | `enemies/humans/bandits/` | none: a notice that deeper folders are not used by LazyDM |

  *Fix all* per group previews every write first. Fixes are conflict-checked writes. Not checked: assets (no type),
  `campaign.md`, `_templates/`.
- **Moving a note** (from the Review fixes, later from the note toolbar) moves the file inside its own campaign or
  system and rewrites the links resolving to it like *Rename* does (path links, relative markdown links; bare names
  stay) and its own relative links; the note keeps its name and its `type` / `subtype` follow the destination.

## 3. Where data lives

**Rule: if a piece of data must follow the user to another device, it lives in the vault.**

| Location | Contents | Synced across devices |
| --- | --- | --- |
| `.md` frontmatter | `type`, `title`, `tags`, aliases, game fields (CR, HP…) | ✅ via the cloud folder |
| `.md` body | content and `[[links]]` | ✅ |
| `.lazydm/*.json` | template rules (`vault.json` → `templates`, see §6c), per-campaign sections (`vault.json` → `sections`, see §2a), vault format version, vault settings | ✅ |
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
- Resolution happens **only inside the link's own scope**: a campaign, or a compendium system. A campaign never
  resolves into the compendium or another campaign (copy what you need instead). The index stores the scope in
  `files.campaign` (`lost-mine`, `compendium/my-system`).
- **Link suggestions** (editor, live and source mode): typing `[[`, `![[` or `[label](` opens a list below the cursor
  with the files of the note's own scope (templates excluded), filtered on title, name and path as the target is
  typed; links list notes first, embeds list assets first. Picking one writes a link that resolves: the bare name,
  or the scope-relative path when two files share the name (`[[enemies/goblin]]`); markdown links get the path
  relative to the note (`../assets/map.png`). The closing `]]` / `)` is added unless already there. The list comes
  from the index (`documents:linkTargets`) and follows index updates.
- **Rename** (note toolbar → *Rename*): the new title gives the new kebab-case file name in the same folder;
  `title:` and the `# Heading` (if it still shows the old title) are updated. The sheet previews the notes linking
  here; with *Update links* (default on) every link the index resolved to the note is rewritten, keeping its form
  (bare name or path, `.md`, `#heading`, `|alias`, markdown links and embeds). Code blocks and inline code are never
  touched. Each rewrite is conflict-checked like a save: a note changed meanwhile is reported, not overwritten.
  Open tabs and their history follow the new URL. Unsaved edits are saved before renaming.
- Renames made outside LazyDM (Finder, Obsidian on another device) are **not** refactored: the other tool already
  rewrote the links, and LazyDM only sees a delete plus a new file.
- **Linked files** live in a right side panel of the note (*Links* toggles it with a slide, open state per device),
  styled like the settings sidebar: every file linked with the note, tagged **FROM** (it links here) and/or **TO**
  (this note links to it), with a tooltip and the linking lines. The note's own broken links appear below only
  when there are some. It follows index updates.
- Unresolved links are shown as broken, never silently dropped: styled in the preview, listed in the note panel and
  in the per-campaign **Review** page (§2a, the *Broken links* group). The overview shows an alert with a *Review*
  button only when the campaign has something to review.
- **Fixing a broken link** (menu on each broken link: in the note panel, on the broken links page, and on the
  broken link itself in the live preview and reading view — click or Enter/Space):
  - *Remove link, keep text*: every occurrence of that link in the note becomes its label (or what it pointed to).
  - *Create note…*: title (suggested from the link) and folder (the link's folder, else the source note's section);
    the note is created from its template and opened. Encounters are not offered as a folder (see below). If its kebab file name differs from the link text, the link is
    rewritten to it with the old text kept as alias (`[[klarg-the-bugbear|Klarg the Bugbear]]`).
- Moving notes between sections: see §2a (*Moving a note*). Deleting notes is not available yet.

## 6b. Compendium

- The compendium is a **cross-campaign shelf** with no fixed structure: it holds **systems**, each a folder the user
  creates (*New system*: name → kebab-case folder + `system.md`). A system starts empty.
- Notes, assets and templates get into a system by **copy** from a campaign (*Copy to compendium*) or by creating
  them there; they get out by **copy** to a campaign (*Copy to campaign*). **The original always stays**; there is
  no move. The folder comes from the note `type` (the source campaign's section for it, sub-folder kept; unknown
  types → `notes/`), other files go to `assets/`, templates to `_templates/` — created when missing. A taken name
  never overwrites: the user picks another file name.
- **Copying into a campaign that has no section for the note's type** (custom sections are per campaign): the copy
  goes to the folder the source keeps that type in, and the target's Review page reports it (*Unknown folder* →
  *Add as custom section*). Planned (not built yet): the copy asks to *Add the <label> section* to that campaign, or to
  pick one of its sections — then the copy's type (and sub-type) is set to match.
- **Import** button in every folder, next to *New note*: *Import from compendium* in a campaign folder (the same
  folder of every system), *Import from campaign* in a system folder (the same folder of every campaign).
- **Linked files come along on request**: before any copy or import LazyDM collects what the file links to,
  transitively, that the target does **not** already have (a file with the same link name in the target campaign or
  system, which is what makes the link resolve there). Files the target has stop the cascade. If anything is missing
  the user chooses whether to copy it too (default on, list shown); otherwise the option does not appear.
- Systems have their own **Broken links** page and overview alert; the fix menu (create note / remove link) works
  there like in campaigns.
- Deleting a system is **permanent** (folder and every file in it), after a confirmation showing the file count.
- UI: the Compendium page (from the campaign list and the campaign sidebar) lists systems; a system has its own
  shell (sidebar with the folders it has, overview, section lists and the note editor — rename and links included).
  Compendium pages are outside campaigns, so they have no tab bar.

## 6c. Templates

- A **template** is a plain `.md` file in a `_templates/` folder: at the vault root (`_templates/`), in a compendium
  system (`compendium/<system>/_templates/`) or in a campaign (`<campaign>/_templates/`, where *Copy to campaign*
  puts copied templates). Obsidian can use them as they are.
- **Built-in templates** ship with the app, one per note type (encounters excluded). They are read-only and never
  written to the vault unasked; *Customize* copies one into `_templates/` to edit it.
- **Per-campaign choice per note type**, saved in `.lazydm/vault.json` → `templates.campaigns.<slug>.<type>` (a
  template path or `builtin`; no entry = automatic). Deleting a template removes the choices pointing at it.
- **Which template a new note gets** (also for *Create note…* from a broken link):
  1. the campaign's choice for the type;
  2. a compendium system's own `_templates/<type>.md` (system notes only);
  3. the vault's `_templates/<type>.md`;
  4. the built-in; types without one get a minimal frontmatter.
  A choice whose file is gone falls through to 3–4.
- **Placeholders**: `{{title}}`, `{{date}}` (YYYY-MM-DD), `{{time}}` (HH:MM), `{{campaign}}` (campaign or system
  name), `{{section}}` (folder display name, in the UI language), `{{type}}`. Unknown placeholders stay as written;
  inside the frontmatter values are escaped for YAML strings, so a title with quotes keeps it valid.
- Template files are excluded from broken links (their links are placeholders).
- **UI**, three places, all writing the same `vault.json` choices:
  - **Templates sheet** (header button, next to Compendium and Settings): the library — built-ins and every
    `_templates/` folder in the shared secondary sidebar — with the note editor (Live / Source), Save, New template
    (empty or from a built-in), Delete (confirmed) and Customize. Over a campaign, the selected template file shows
    *Used in <campaign> for* with one toggle per note type to link / unlink it. Unsaved edits are saved when another
    template is selected or the sheet is left, like notes.
  - **Settings → Templates**: the per-type choices of the campaign under the sheet (a hint when opened from the
    campaign list); the Templates sheet itself opens from the title bar.
  - **Campaign section pages**: a *Template* select in the toolbar for the section's note type (Automatic, Built-in,
    the vault's, the systems' and the campaign's own templates).
- **Section pages keep their actions in the toolbar** (template select, *Import*, *New note*), never in a button
  row above the list — the same rule as every other page.

## 7. Security

- **Path guard**: every path received from the renderer is resolved and rejected if it escapes the vault root.
- Rendered markdown is **sanitized** (vault content may come from other people through a shared folder).
- External links open in the system browser, never inside the app window.
- Assets are served through the `lazydm-asset://` protocol, scoped to the vault.

## 8. UI and navigation

- **First start** → vault setup page (select or create the root folder). Until a vault exists, every route redirects there.
- **Title bar** (app header, every page): drag area, **Compendium** and **Settings**, window buttons (no app name).
- The **toolbar's bottom edge** is the ornamental rule from *engraved geometry* (bronze bar, ◇ ✣ ◇, hairline) —
  `.arc-ornament-rule`, the one dominant marker of that module. It is inset 16px on both sides.
- Every page has the **toolbar** (campaign list included: vault name as the path, *New campaign* as its action).
  The vertical divider before the title only appears next to the sidebar toggle.
  macOS keeps the native traffic lights inset into it (`titleBarStyle: 'hiddenInset'`); Windows/Linux use a
  frameless window with the app's own minimize / maximize-restore / close (double-click the bar = maximize).
- **Compendium and Settings are full-page sheets**, not pages of the campaign navigation: they open over the
  current page (named router outlet `overlay`), the campaign and its tabs stay as they are, and closing (×, Escape,
  Cmd/Ctrl+W, or the same title-bar button) brings it back. Each sheet reopens where it was left. Links to
  `/compendium/...` or `/settings/...` open in the sheet. Inside, a system has its own toolbar and appears in the sheet's cascading sidebar; sheet
  pages have their own toolbar context, so they never touch the campaign toolbar or tab titles.
- Sheets (and dialogs) share one header: big condensed title, engraved divider, square close button.
- Sheets open like a **gate**: they slide down from under the title bar and slide back up when closed
  (no motion with *reduce motion*).
- **Sidebars**, three kinds:
  - **Explorer** (campaign shell, Compendium sheet): a file tree like a code editor's. Folders (sections,
    sub-folders, compendium systems) expand on row click; a ↗ button on the right opens the folder's page. Files
    open the note. Right-click: *Move to…* and *Reveal* on files (plus *Copy to…* on assets), *Open page* and
    *Reveal* on folders. The Compendium one starts with *All systems*, then each system (↗ = its overview) with
    the folders it has.
  - **Contextual** (Settings): the Nordic Relic sidebar tabs with cascading branches (recessed panel, rows split
    by 1px lines, active row raised with a 3px bronze marker) carrying the settings-style title with its dot and
    a description.
  - **Tab-based** (Templates): the same tabs grouped into collapsible sections (light header with a count).
  - Below the two-column breakpoint the contextual and tab-based sidebars collapse into one bar showing the
    current item; clicking it expands the list in place, choosing an item collapses it again.
- **Editor settings** (Settings → Editor) are device-local, like theme and language: code map, line numbers,
  text size (also in Reading), readable line width, default view of notes never opened, line wrapping, current
  line highlight, spellcheck, auto-close pairs (off by default: typing `(` `[` `{` `"` `` ` `` also writes the
  closing one). The **code map** is our own (no dependency), in the editor and in Reading: the whole
  note at a small scale from what is shown, each markdown element in its colour (theme chart tokens; legend in
  Settings), H1–H3 as labels where they are, the visible part framed, placed right before the scrollbar;
  click/drag and the wheel scroll the note, a label jumps to its heading. The note page fits the window so the
  editor scrolls inside it.
- **Campaign list** → grid of campaigns; when empty, a CTA message with a *Create campaign* button.
- **Campaign layout** → shell with the sidebar: the campaign's sections (its settings applied, §2a) and
  **Back to campaigns**. Section settings live in Settings (per campaign, like the template choices).
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
- **Title bar**: the Compendium, Templates and Settings sheet buttons are square icon buttons (tooltip and
  accessible name from the label).
- **Note toolbar**: the note actions (*Links*, *Copy to compendium / campaign*, *Rename*, *Save*) are square icon
  buttons (tooltip and accessible name from the label).
- **Editor**: CodeMirror 6 with three views, switched by three toggle buttons in a row above the editor (not a
  segmented control); the *Unsaved changes* label sits at the right end of that row. The view is remembered **per note on this device** (`document_view_modes` local preference, the most
  recent 500 notes; a new note opens in Live preview), so moving between notes always shows each one as left.
  - **Live preview** (default, Obsidian-like): the note stays editable and is shown rendered; the markdown syntax of
    an element comes back only while the cursor is on it. Headings, emphasis, code, quotes, lists, task checkboxes
    (clickable), images, links, tables, callouts and frontmatter (as a properties box) are rendered. The note opens
    with the cursor below the frontmatter.
  - **Source**: the raw markdown in the mono font, syntax highlighted.
  - **Reading**: read-only, sanitized HTML (markdown-it + DOMPurify).
  - **Links behave like links**: pointer cursor, a click opens the note (Cmd/Ctrl-click opens it in a new tab), an
    external link opens in the browser, a broken link opens the fix menu. Clicking a link never moves the cursor.
    The editor re-resolves its links on every index update.
  - **Dividers** (`---`) render as a small primary `◇` at the start of the line followed by the plain rule.
  - **Callouts** (`> [!type] Title`): note/info (default), tip/success, warning, danger/error — left accent bar in
    the status colour, mono uppercase title.
  - **Formatting**: Cmd/Ctrl+B bold, Cmd/Ctrl+I italic (toggle: wrap the selection, or remove the marks around
    it; with no selection, insert the pair with the cursor inside). With a selection, typing `(` `[` `{` `"` `'`
    `` ` `` `*` `_` `~` wraps it instead of replacing it.
  - **Insert menu** (right-click in Live and Source; Reading has none): cut / copy / paste; bold, italic,
    strikethrough, inline code; H1–H3 (set on the current line); bulleted, numbered and task list, quote, code
    block, table, divider; *Info box* → note / tip / warning / danger callout; *Link to note* (`[[` with the link
    suggestions); *Asset* → *From assets…* (`![[` with the suggestions, assets first) and *Import file…* (file
    dialog, saved like a paste, §2).
  - **Media embeds**: images render inline; a **PDF** is a file row (icon + name) opening the system viewer;
    an **audio** file is a row with a play/stop icon button and its name (Live and Reading).
  - **Note audio channel**: one audio plays at a time per note — starting another stops the current one. While
    playing, a compact player (name, pause/resume, stop, seek, time) sits at the right end of the view-buttons row;
    it disappears when playback ends. Changing or closing the note stops it. Note audio is meant for short sounds
    (≤ 30 s); a longer file is still saved and played, with a warning toast.
  - **Link preview**: hovering a resolved note link (Live and Reading) shows a small eye button next to it;
    pressing it opens a floating, read-only preview card of the note (popover surface, 2px `border-strong` frame,
    title with its dot over the `.arc-ornament-rule`) with *Open* (Cmd/Ctrl-click: new tab). Escape or a click
    outside closes it.
  - **Editor reference** (an *info* icon button right after the three view buttons, tooltip and accessible name
    from the label): a side sheet listing everything the editor understands, grouped — text (bold, italic,
    strikethrough, inline code), headings, lists and tasks, links and embeds (`[[…]]`, `![[…]]`, markdown links),
    blocks (quote, info boxes, code block, table, divider), media (images, PDF, audio), frontmatter properties, and
    the keyboard shortcuts / right-click menu. Each entry shows the syntax (mono) next to how it renders (the
    Reading renderer, so it never drifts from the real output). Read-only; it never edits the note.

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
  - Toasts follow the *notification banner*: card surface, 1px border in the state colour, uppercase title, mono
    description, square close button on the right.
  - Tooltips: raised surface with a bronze border. Everything from the toolbar up (title bar, tab bar, toolbar)
    shows its tooltips **below** the element (`arcPosition="bottom"`), never over the window edge.
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
| 8 | Compendium: systems, copy to/from campaigns, scope-limited links |
| 8.1 | Template rules: per-campaign template choice per note type, built-in defaults, placeholders |
| 8.2 | Editor views: Live preview / Source / Reading, remembered per note; clickable links; tables, callouts, properties, `◇` dividers |
| 9 | Monsters → Enemies: folder, type, template, vault format version + one-time migration |
| 9.1 | Per-campaign sections: hide, order, labels, custom sections, folders on demand; Electron owns the section list (Settings → Sections) |
| 9.2 | Sub-folders as sub-types (one level, `subtype` field), *New folder*, breadcrumb, copy keeps the sub-folder |
| 9.3 | Review page: broken links + misplaced / wrong sub-type / untyped / outside sections / unknown / too-deep folders; move note with link rewrite |
| 10 | Editor quality: backtick input fix; bold/italic shortcuts and wrap-selection (auto-close pairs as a setting); right-click insert menu; media assets (paste, import from disk, drop on Assets); audio / PDF embeds; note audio channel and player; linked-note preview card; editor reference sheet |

## 12. Open decisions

- **Encounters** are special files: linkable from markdown notes, but not plain notes (own format/editor to be
  designed). Until then they are not offered as a target folder for notes created from links.

- **Backup**: optional "zip the vault" backup to replace the removed DB backup — to be decided later.
