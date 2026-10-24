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

## 1b. Glossary (what the user reads)

One word per idea in every UI string, in all 7 languages. The code, the file formats, the folders and this document keep
their technical names; only the text the user sees changes. Add to this table before inventing a new word.

| Say (UI) | Technical name (code, files, this document) | Notes |
| --- | --- | --- |
| **Codex** | vault, `.lazydm/`, `vault.json` | One fixed word in every language, never translated |
| **Combatant** | entity | Natural word per language (Combattente, Combattant, Kämpfer, Combatiente, Боєць, 战斗者) |
| **Tracker layout** | battle rule, `_battle-rules/` | The layout of a combatant row; translated per language |
| **Links** | backlinks panel, linked files / notes | The note panel and its toolbar button; groups inside it are *Notes* and *Assets* |
| **Review** | broken links page, `/review` | The page and its alert; *Broken links* is only a group title inside it |
| **Delete forever** | permanent delete | Combatant card, cemetery and its confirmation |
| **Info box** | callout | `> [!note]` stays as the markdown syntax example |
| **Default** | built-in tracker layout (`Generic` in the file) | Display name only; the stored name never changes |

## 2. Vault layout

```text
<vault root>/                          chosen or created by the user (may live in iCloud, Box, Dropbox…)
├── .lazydm/                           vault config, synced with the vault (like .obsidian/)
│   ├── vault.json                     vault settings, template rules, folder/display-name mapping
│   └── …
├── _templates/                        note templates (scene.md, enemy.md, character.md…)
├── _battle-rules/                     battle rules (JSON), see §6d; also per system and per campaign
├── compendium/                        cross-campaign material, one folder per "system"
│   └── <system-slug>/                 created by the user (a game, a setting, anything reused)
│       ├── system.md                  system card: display name, description
│       └── <folders on demand>        sessions/, enemies/, assets/, notes/… appear with their first file
└── <campaign-slug>/                   one folder per campaign (section folders appear with their first file)
    ├── campaign.md                    campaign card: display name, cover, description
    ├── scenes/
    ├── characters/
    ├── enemies/
    │   └── <sub-folder>/              one level of sub-folders to organise notes (e.g. monsters, humans)
    ├── spells/
    ├── items/
    ├── quests/
    ├── locations/
    ├── world/                         lore, factions, history, deities
    ├── encounters/                    encounters: .json files, not notes (see §6d); _party.json = the party roster
    ├── maps/                          interactive maps: .json files, not notes (see §6e); the image stays in assets/
    ├── handouts/                      letters, clues; may embed images from assets/
    ├── sessions/
    ├── assets/                        every non-.md file: images, maps, pdfs, sounds…
    └── <custom sections>/             added per campaign (see §2a), e.g. factions/
```

- **Folder and file names are slugs**: lowercase kebab-case, `-` instead of spaces
  (`Lost Mine of Phandelver` → `lost-mine-of-phandelver`).
- The **human-readable name** lives in the content (`campaign.md` frontmatter / `title`), never in the folder name.
- **A note's folder decides what it is**: a note in `enemies/` is an enemy, one in `enemies/humans/` an enemy of the
  sub-group *humans* (§2a). LazyDM never reads or writes a `type` / `subtype` frontmatter key for this; they are
  ordinary user fields (`type: beast`, `type: devil`…) that LazyDM leaves alone, like any other key. Links resolve by
  name, so a note moved to another folder keeps working.
- A plain map is an image in `assets/` plus a `.md` card that embeds it. An **interactive map** (pins, paths, notes)
  is a `.json` file of the *Maps* section that points at an image in `assets/` (see §6e).
- **Media files** (images: png, jpg, gif, webp, svg, avif; pdf; audio: mp3, wav, ogg, m4a, flac) pasted into a
  note, dropped on the Assets section or imported from disk are **saved right away** in the scope's own `assets/`
  (`<campaign>/assets/`, `compendium/<system>/assets/`) and, from a note, embedded at the cursor as `![[name.ext]]`
  (Obsidian-compatible); a toast tells where the file went. File name: the original name as a slug
  (`pasted-<timestamp>.<ext>` for a pasted screenshot); a taken name gets a `-<timestamp>` suffix — an asset is
  never overwritten. A file **identical** to an asset already in the scope (same size, then same content) is not
  saved again: the existing one is embedded and the toast says *Already in assets*.

## 2a. Sections (campaign folders)

- A **section** is a top-level folder of a campaign bound to one note type: key (folder slug), type, label, icon,
  optional description. Sections are **user-managed**: the user creates them (name, optional description, icon,
  optional template) from the campaign overview toolbar (*New section*) or Settings → Sections, and can reorder,
  hide, rename and delete them. Only *Assets*, *Encounters* and *Maps* are fixed (special sections, see below).
- **Presets**: the sections in §2 (scenes, characters, enemies…) are **presets** with their built-in template
  already set. They are offered as a checklist when a campaign is created (*New campaign*), as a way to
  pre-initialise its spaces; Assets and Encounters are always included. Campaigns that already exist keep the
  sections they have (the special ones are listed for every campaign). Electron owns the list and sends it to Angular, with each campaign's settings applied — no
  list kept in sync by hand.
- **Per-campaign settings** in `.lazydm/vault.json` → `sections.campaigns.<slug>`:
  - `hidden`: default sections not shown in the sidebar (their files stay indexed and linkable; the settings show
    *hidden, N notes inside*);
  - `order`: the sidebar order;
  - `labels`: display names (`characters` → *NPCs*); the folder on disk keeps its name;
  - `custom`: the campaign's own sections (`{ key: 'factions', type: 'faction', label: 'Factions', icon: 'flag',
    description: '…' }`), with a user-written label and description (not translated); the description is shown on
    the overview tile. A custom section has no built-in template: it starts on *Automatic* (a minimal frontmatter) until the user links one.
- **Folders appear on demand**: a section exists from the settings; its folder is created with its first file.
  Opening a campaign no longer creates empty folders (existing empty ones are left alone).
- **Section folders are never renamed on disk** by LazyDM (renaming a section = changing its label). Hiding is not
  deleting. **Deleting a section** (Settings → Sections, *Delete…*) deletes it **with all its content**: the folder
  goes to the system Trash (recoverable) and the section leaves the settings. The confirmation asks whether to
  update the links to its files (*Turn links into plain text* / remove embeds, default on, like deleting a
  sub-folder). Special sections cannot be deleted. **Sub-folders** can be renamed and deleted (see *Renaming and
  deleting* below).
- **Sub-folders**: one level inside a section, created from the section page (*New folder*). They only organise
  the section's notes: the note's kind is the section, the sub-folder is a grouping, and nothing is written in the
  notes. Sub-folders share the section's template (one template per section; per-sub-folder templates may come later). Deeper folders are **ignored** (their files
  are not listed in sections) and reported (see *Review* below).
  The section page lists its sub-folders (with file counts) above its notes; a sub-folder opens on the same page
  (`/<section>?folder=<name>`, breadcrumb `CAMPAIGN / SECTION /`), where *New note* creates notes in it and *New
  folder* is not offered (one level). A note in a sub-folder opens at `/<section>/<sub-folder>/<note>` with the
  breadcrumb `CAMPAIGN / SECTION / SUB-FOLDER /`.
- **Section page as a tree**: sub-folders are collapsible rows showing their files inline; a click anywhere on the
  row expands / collapses it, and a ↗ button shown on hover (as in the explorer) opens the sub-folder view.
  *New folder* keeps the user on the current page, with the new sub-folder expanded. Rows keep the normal cursor
  (pointer on what is clickable). Files can be dragged onto a sub-folder, or onto the *main folder* target shown
  while dragging, to move them (one section only); right-click a file for *Rename…*, *Move to…* (main folder or a
  sub-folder), *Reveal in Finder* (*Show in Explorer* / file manager elsewhere) and *Delete…*, a folder for *Open*,
  *Rename…*, *Reveal* and *Delete…*.
- **Asset rows** show a small thumbnail for images (an icon for PDF and audio), a *Rename* button and *Copy to
  compendium*. Clicking an image (section page or explorer) opens the **asset page**
  (`/<section>/…/<file name with extension>`, its own tab title and breadcrumb; a rename moves it): only the
  image, fitted to the page, with *Rename*, *Copy to compendium / campaign* and *Delete* in the toolbar.
- **Renaming and deleting** (notes, assets, sub-folders) — every link change is conflict-checked like a save:
  - *Rename* a note: the note page's modal (§6), also from the section page. *Rename* an asset: the new name gives
    the slug, the extension stays; embeds and links to it are rewritten.
  - *Rename* a sub-folder: the folder on disk and path links through it
    (`[[enemies/humans/bandit]]`) — the same rewrite as the `monsters/` → `enemies/` migration. A taken name is
    refused.
  - *Delete…* a note or an asset, after a confirmation listing the notes that link to it. For a note, *Turn links
    into plain text* (default on); for an asset, *Remove the embeds* (default on). Unticked, the links stay and are
    reported as broken in Review. Deleted files go to the **system Trash** (recoverable), never deleted for good.
  - *Delete…* a sub-folder: the confirmation shows its file count and offers **Delete the files too** (each one as
    above) or **Move them to the main folder** (links rewritten like *Move to…*). A file whose name
    is taken in the main folder is listed and nothing is moved until it is renamed. The folder goes to the Trash.
  - Unsaved edits of a note are saved before it is renamed; on delete they are dropped (a deleted note is
    never written back, even when it was open while deleted from the explorer). Tabs and history entries
    showing a deleted file go to its section page (the last tab rule still holds). *Delete…* is in the note and
    asset toolbars and in the file right-click menus of the section page and the explorer.
  - **Folder right-click menus** (explorer and section page) offer what the folder takes: a section *New note*
    (not the special sections) and *New folder*; a sub-folder *New note* (created inside it) but no
    *New folder* (one level only). The same modals as the section toolbar; a new note opens right away.
- **Special sections**: *Assets* (any non-`.md` file), *Encounters* (`.json` files, see §6d) and *Maps* (`.json`
  files, see §6e) hold no plain notes —
  they offer *New folder* and *Import* but no *New note* (*Encounters* offers *New encounter*, *Party roster* and a
  *Battle rule* select instead; *Maps* offers *New map*); their sub-folders only organise files, and the
  Review page does not check them. *Assets* also offers **Import from disk** (toolbar): a sheet with *Select
  files* (the system file dialog) and a drop zone; media files can also be dropped straight on the section page
  (or on one of its sub-folders).
- **Enemies** (formerly *Monsters*): folder `enemies/`, section type `enemy`. A one-time migration (vault format
  version in `vault.json`) renamed `monsters/` → `enemies/` in campaigns and systems and rewrote the template rules,
  `_templates/monster.md` and `[[monsters/…]]` path links (it also rewrote the `type:` of the notes, as it did
  back then; today nothing reads that key).
- **Review** (per campaign, `/campaigns/<slug>/review`, replacing the *Broken links* page; also per system): every
  disagreement between files and sections, computed from the index so it follows changes made outside LazyDM
  (Finder, Obsidian, sync). The overview alert with its *Review* button shows when there is anything to review.
  Groups, each row with a fix menu (the user chooses; no default fix):

  | Problem | Example | Fixes |
  | --- | --- | --- |
  | Broken link | see §6 | *Remove link, keep text* · *Create note…* |
  | Outside any section | a note at the campaign root | *Move to…* (pick a section / sub-folder) |
  | Unknown folder | `lost-mine/factions/` | *Add as custom section* (type from the folder name, editable) |
  | Too deep | `enemies/humans/bandits/` | none: a notice that deeper folders are not used by LazyDM |

  *Fix all* per group previews every write first. Fixes are conflict-checked writes. Not checked: assets,
  `campaign.md`, `_templates/`.
- **Moving a note** (from the Review fixes, later from the note toolbar) moves the file inside its own campaign or
  system and rewrites the links resolving to it like *Rename* does (path links, relative markdown links; bare names
  stay) and its own relative links; the note keeps its name.

## 3. Where data lives

**Rule: if a piece of data must follow the user to another device, it lives in the vault.**

| Location | Contents | Synced across devices |
| --- | --- | --- |
| `.md` frontmatter | `title`, `tags`, aliases, game fields (CR, HP…), any key the user adds (`type: beast`…) | ✅ via the cloud folder |
| `.md` body | content and `[[links]]` | ✅ |
| `.json` encounters, battle rules | encounters (`<scope>/encounters/*.json`), the party roster, battle rules (`_battle-rules/*.json`), see §6d | ✅ via the cloud folder |
| `.lazydm/*.json` | template rules (`vault.json` → `templates`, see §6c), battle-rule choices (`vault.json` → `battleRules`, see §6d), per-campaign sections (`vault.json` → `sections`, see §2a), vault format version, vault settings | ✅ |
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
| `files` | path (vault-relative), campaign, kind (md/asset), section type (from the folder), title, size, mtime, content hash, frontmatter JSON |
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
- The setup flow says exactly this (§8): the cloud app syncs the files, LazyDM never claims to sync by itself.
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
  `title:` and the `# Heading` (if it still shows the old title) are updated. The modal previews the notes linking
  here; with *Update links* (default on) every link the index resolved to the note is rewritten, keeping its form
  (bare name or path, `.md`, `#heading`, `|alias`, markdown links and embeds). Code blocks and inline code are never
  touched. Each rewrite is conflict-checked like a save: a note changed meanwhile is reported, not overwritten.
  Open tabs and their history follow the new URL. Unsaved edits are saved before renaming.
- Renames made outside LazyDM (Finder, Obsidian on another device) are **not** refactored: the other tool already
  rewrote the links, and LazyDM only sees a delete plus a new file.
- **Linked files** live in a right side panel of the note (*Links* toggles it with a slide; it starts **closed** and
  the button carries a badge with the number of links; open state per device),
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
    the note is created from its template and opened. Encounters are not offered as a folder (they are `.json` files, see §6d). If its kebab file name differs from the link text, the link is
    rewritten to it with the old text kept as alias (`[[klarg-the-bugbear|Klarg the Bugbear]]`).
- Moving notes between sections: see §2a (*Moving a note*). Renaming and deleting notes, assets and sub-folders:
  see §2a (*Renaming and deleting*).

## 6b. Compendium

- The compendium is a **cross-campaign shelf** with no fixed structure: it holds **systems**, each a folder the user
  creates (*New system*: name → kebab-case folder + `system.md`). A system starts empty.
- Notes, assets and templates get into a system by **copy** from a campaign (*Copy to compendium*) or by creating
  them there; they get out by **copy** to a campaign (*Copy to campaign*). **The original always stays**; there is
  no move. The folder is the one the note has in its source (section and sub-folder kept; a folder that is not
  a section → `notes/`), other files go to `assets/`, templates to `_templates/` — created when missing. A taken name
  never overwrites: the user picks another file name.
- **Copying into a campaign that has no such section** (custom sections are per campaign): the copy goes to the
  same folder name, and the target's Review page reports it (*Unknown folder* → *Add as custom section*). Planned
  (not built yet): the copy asks to *Add the <label> section* to that campaign, or to pick one of its sections.
- **Import** button in every folder, next to *New note*: *Import from compendium* in a campaign folder (the same
  folder of every system), *Import from campaign* in a system folder (the same folder of every campaign).
- **Linked files come along on request**: before any copy or import LazyDM collects what the file links to,
  transitively, that the target does **not** already have (a file with the same link name in the target campaign or
  system, which is what makes the link resolve there). Files the target has stop the cascade. If anything is missing
  the user chooses whether to copy it too (default on, list shown); otherwise the option does not appear.
- Systems have their own **Broken links** page and overview alert; the fix menu (create note / remove link) works
  there like in campaigns.
- Deleting a system sends its folder (every file in it) to the **system Trash** (recoverable), after a confirmation showing the file count.
- UI: the Compendium page (from the campaign list and the campaign sidebar) lists systems; a system has its own
  shell (sidebar with the folders it has, overview, section lists and the note editor — rename and links included).
  Compendium pages are outside campaigns, so they have no tab bar.

## 6c. Templates

- A **template** is a plain `.md` file in a `_templates/` folder: at the vault root (`_templates/`), in a compendium
  system (`compendium/<system>/_templates/`) or in a campaign (`<campaign>/_templates/`, where *Copy to campaign*
  puts copied templates). Obsidian can use them as they are.
- **Built-in templates** ship with the app, one per preset section's note type (encounters and maps excluded, they are not `.md` notes); sections the user creates have none. They are read-only and never
  written to the vault unasked; *Customize* copies one into `_templates/` to edit it.
- **Per-campaign choice per note type**, saved in `.lazydm/vault.json` → `templates.campaigns.<slug>.<type>` (a
  template path or `builtin`; no entry = automatic). Deleting a template removes the choices pointing at it.
- **Which template a new note gets** (also for *Create note…* from a broken link):
  1. the campaign's choice for the type;
  2. a compendium system's own `_templates/<type>.md` (system notes only);
  3. the vault's `_templates/<type>.md`;
  4. the built-in; types without one (the user's own sections) get a minimal frontmatter.
  A choice whose file is gone falls through to 3–4.
- **Placeholders**: `{{title}}`, `{{date}}` (YYYY-MM-DD), `{{time}}` (HH:MM), `{{campaign}}` (campaign or system
  name), `{{section}}` (folder display name, in the UI language), `{{type}}`. Unknown placeholders stay as written;
  inside the frontmatter values are escaped for YAML strings, so a title with quotes keeps it valid.
- Template files are excluded from broken links (their links are placeholders).
- **UI**, where templates are made and where they are linked (the same `vault.json` choices):
  - **Templates sheet** (title bar → *Customize* menu): the library — built-ins and every
    `_templates/` folder in the shared secondary sidebar — with the note editor (Live / Source), Save, New template
    (empty or from a built-in), Delete (confirmed) and Customize. It only creates and edits templates; it does not
    link them. Unsaved edits are saved when another template is selected or the sheet is left, like notes.
  - There is no *Settings → Templates*: choosing a template happens in one place only, the section page.
  - **Campaign section pages**: a *Template* select in the toolbar for the section's note type (Automatic, Built-in,
    the vault's, the systems' and the campaign's own templates). This is how a template is linked to a section;
    the *New section* modal offers the same select.
- **Section pages keep their actions in the toolbar** (template select, *Import*, *New note*), never in a button
  row above the list — the same rule as every other page.

## 6d. Encounters and battle rules

- An **encounter** is a **`.json` file** of the *Encounters* section (`<scope>/encounters/<slug>.json`, or one
  sub-folder deeper). It is not a note: no frontmatter, no `type`, not offered as a folder for notes created from
  broken links. The index lists it as an asset; it is linked **like an asset**, with its full file name
  (`![[ambush.json]]`, `[[ambush.json]]`).
- **File format** (`version: 1`): `name`, `notes`, `rule` (the encounter's own battle rule: a rule path or
  `builtin`, null follows the campaign), `battle` (`status` idle | running, `round`, `turnId`) and `entities`.
  An entity is `{ id, name, values, isDead }`. **Everything but `id` is optional** and a missing or wrong field
  never breaks the page: the file is normalised when read, so a hand-edited or minimal one opens. A file that is
  not valid JSON opens empty and read-only (it would be replaced by a save). Saves are atomic and
  **conflict-checked by content hash**, like a note save (*Keep my version* / *Load the other version*).
- **Values** are stored by the key of the battle-rule field that shows them (`initiative`, `ac`, `hp` =
  `{ current, max, temp }`, `statuses` = `[{ name, rounds? }]`, `note` = vault path of the linked note, …). A value
  the rule no longer lists survives a change of rule; empty values are not stored.
- **Page** (`/<scope>/encounters/<file>`, own tab title and breadcrumb): the round (`03 / ROUND`: a big two-digit number and a smaller, quieter word) and whose turn it is
  on top, then the **battle bar** (*Start battle* or *Stop battle* / *Next turn* on the left; *Roll initiative* and
  the *Add party* and *Add entity* icon buttons on the right), then the initiative list. The **toolbar keeps the
  main and utility actions**: *Battle rule*, *Cemetery* (opens the side panel) and a **"…" menu** with *Copy to…*,
  *Rename…* and *Delete…* (Delete last, after a separator). Every edit
  is saved right away. The open encounter follows a rename (its name is the file name) and any change of its
  battle rule or of the rule library.
  - **Battle**: *Start* sorts by initiative (highest first, entities without one last), sets round 1 and gives the
    first entity the turn; *Next turn* moves on and starts a new round after the last; *Stop* asks first, then
    clears initiatives and statuses and refills HP to the maximum where one is known (temporary HP go too). There
    is no reset. Entities can be added, edited and removed while the battle runs; a new one takes its place by
    initiative and the current turn does not move. Rows can be dragged to any order.
  - **Entities**: *Add entity* (a modal) leads with the **note picker** (searchable list of the scope's notes); picking one
    fills the name and the values the rule reads from its frontmatter, without touching what the user already
    typed. Then the name, initiative / maximum HP / AC on one row (a dice inside the initiative input rolls it when the rule has a formula), and a **quantity** (1–15, default 1); above 1 the confirm
    button reads *Insert N* and the copies are numbered ("Goblin 1", "Goblin 2"…). *Duplicate* numbers the same way.
    A field the rule reads from the note shows the note's value **only when the entity has none of its own**;
    nothing is copied into the file.
  - **Hit points**: a labelled bar: the label on the left, `+temp  current / max` on the right of the same row, the
    meter under it (temporary HP as a second segment); the bar slides when the value goes down or up. *Manage HP* (an icon button) applies damage (temporary HP first, never below 0), healing (up to the
    maximum) or sets the temporary HP. There is no undo.
  - **Statuses** are **free tags** typed in place on an entity (one line, no dialog): `stunned`, space, `3`, space
    makes the tag *stunned · 3* (it counts down at the end of that entity's turn and goes at 0); a second space right
    after the name makes it without rounds. Enter or leaving the field also makes one, Backspace on an empty field
    removes the last tag. They are not notes and have no section.
  - **Entity card**: a small header holds the system actions (drag handle, roll selection checkbox, edit, duplicate,
    send to the cemetery, delete permanently without asking); the rule's grid is below it.
  - **Cemetery**: *Remove* sends an entity to a side panel (it leaves the order; if it had the turn, the turn
    passes on); *Recover* puts it back by initiative; *Delete forever* (confirmed) removes it from the file for
    good. An entity's **linked note** opens read-only, as in Reading, in a **right-hand sheet** like the editor
    reference, rendered by the Reading view (links open their note, embeds and previews work). An encounter is
    always shown by its **name**, never by the `.json` file name (the index stores it as the title).
- **Party roster**: a hidden `encounters/_party.json` per campaign (the same file format and page, without the
  battle), reached from the full *Party roster* button at the top right of the Encounters page (a section of its own) — it is not listed or offered as a link. It has the *Battle rule* select too (default: the campaign's), so what its rows show is never implicit.
  *Add party* copies its entities into an encounter (also a running one), skipping a member whose name is already
  there.
- **In notes**: `![[ambush.json]]` is a row with the battle (swords) icon and the file name, in Live preview and
  Reading; a click opens the encounter (Cmd/Ctrl-click: a new tab). The Linked files panel lists encounters with the
  other assets.
- **Battle rules** configure the entity row; they are the encounter's equivalent of note templates:
  - A rule is a **JSON file** `_battle-rules/<name>.json` at the vault root, in a compendium system or in a
    campaign. The **built-in rule** (*Generic*: initiative, AC, HP bar, statuses, linked note; it rolls `1d20 + {initiative_mod}`, a key of the built-in enemy template) is read-only and
    *Customize* copies it out. Unknown or duplicate fields are dropped on read, and a rule always has an initiative.
  - A rule has a `name`, a `template` (a template path or `builtin:<type>`) whose **frontmatter keys** are the
    attributes it may read from an entity's note, an `initiative` (`roll`: null when typed by hand, or a dice
    formula) and an ordered list of `fields`: `{ key, component, label, source, showInRow, area, options? }`. The row is a
    **12-column grid of up to 4 rows**: `area` is `{ row, column, span }` of a field and `nameArea` the name's (a rule
    without areas is laid out left to right; a field with `showInRow: false` takes no place).
    `component` is `initiative`, `number`, `text`, `healthbar`, `statuses`, `side` or `note-link`; `source` is `entity`
    or `frontmatter:<key>`. The name and the initiative are in every rule. The system is not assumed: nothing in the
    battle code names a game's fields.
  - **Which rule applies**: the encounter's own choice, else its campaign's (`.lazydm/vault.json` →
    `battleRules.campaigns.<slug>`), else the built-in; a choice whose file is gone falls through to the next. Both
    are picked from a *Battle rule* select (encounter toolbar, and the Encounters section toolbar for the campaign).
    Deleting a rule clears the campaign choices that pointed at it.
  - **Dice formula**: `1d20`, `1d100`, `2d6 + 3`, `1d20 + {dex_mod}`. Terms are dice, whole numbers and `{key}`
    (the **integer** of that frontmatter key of the entity's note: a positive one is added, a negative one
    subtracts), joined by `+` and `-`. Never evaluated as code. The formula is checked while it is edited.
  - **Roll initiative** appears only when the rule has a formula **and no battle is running** (it sets up the order,
    so the button, *Select all* and the row checkboxes leave while it runs). It rolls for the **selected** entities (a
    checkbox per row, *Select all*, *Clear*) and sorts the list. An entity the formula cannot be rolled for (no note, no such
    key, not a whole number) has its initiative **erased**, and the failures are reported.
  - **Editor**: the *Battle rules* sheet (title-bar button next to Templates) has the same library layout: built-in,
    vault, systems and campaigns in the secondary sidebar, with a form for the name, the template, the initiative
    (typed or rolled, formula and the template's keys as chips) and a **mock entity row**: each element sits where
    the real row will show it. **Drag** an element to move it (a preview shows whether it fits); dropped **on another
    element** the two swap places when each fits where the other was; the **right edge** is dragged to resize it, a
    column at a time, until it meets a neighbour. There are no row, column or width fields and no arrows. A **gear** on
    each element opens its settings (label, key, value source, sides, hide, remove); they are typed into a draft and only
    reach the rule when *Apply* is pressed (*Discard* drops them). A **palette** holds the hidden elements and the types
    that can be added (drag in, or click to use the first free place); dropping an element on it hides it. *Linked note*,
    *Statuses* and *Side* can only exist once in a rule; the health bar type is called *Bar*. The name and the initiative
    can move but not go. Unsaved edits are saved when another rule is selected or the
    sheet is closed.

## 6e. Maps

- An **interactive map** is a **`.json` file** of the *Maps* section (`<scope>/maps/<slug>.json`, or one sub-folder
  deeper). It is not a note: no frontmatter, no `type`. The index lists it as an asset, titled by its `name`, and it
  is linked **like an asset** with its full file name (`![[world.json]]`). Section-aware: a `.json` in `maps/` opens
  the map page, a `.json` in `encounters/` the encounter page.
- **The image stays in `assets/`** (§2): the map only stores its vault-relative path (`image`). The map never copies,
  moves or edits the image. *New map* picks an existing image of the scope's assets or imports one from disk into
  `assets/` first (the usual import rules). Renaming an image rewrites the `image` of the maps pointing at it;
  deleting it leaves those maps open with a *missing image* state (never a crash).
- **File format** (`version: 1`): `name`, `image`, `pins`, `paths`, `notes`. Coordinates are **fractions of the image**
  (`x`, `y` in 0..1, origin top-left), so a map survives a replaced image of another size. Everything is optional and
  normalised when read, like encounters; unknown fields are dropped, numbers clamped, colours validated against the
  palette. Saves are atomic and conflict-checked by content hash (*Keep my version* / *Load the other version*).
  - **Pin**: `{ id, x, y, label, color, icon, link }`; `link` is a vault path of a note, asset or encounter of the same
    scope (null for none).
  - **Path**: `{ id, points: [{ x, y }], color, width, label, closed }`; `closed` (three points at least) is a
    polygon: its area is filled with the colour at low opacity.
  - **Note**: `{ id, x, y, text, color }`, a free text box anchored to a point.
- **Library**: Leaflet (core only) with `CRS.Simple`, the image as an overlay. Pins and notes are `divIcon` markers
  styled by us; no Leaflet default marker images and no drawing plugin. Leaflet's own chrome (zoom control,
  attribution) is replaced by ArcTechUI controls.
- **Page** (`/<scope>/maps/<file>`, own tab title and breadcrumb): the toolbar keeps the main actions (*Details*,
  *Rename…*, *Delete…*); a **tool palette** over the map holds *Interact*, *Select*, *Pin*, *Path*, *Note* and
  the zoom buttons (zoom in / out / fit). Every edit is saved right away. The map is a stacking context of its
  own: nothing of it (panes, tools) ever shows above a sheet, a modal or a menu.
  - **Interact** is the default: drag to pan, click an item to select it, drag a pin or a note to move it, drag the
    points of the selected path to reshape it. **Double-click** on a pin with a linked file opens that file;
    **Cmd/Ctrl-click** opens it in a background tab (any other double-click opens the item's form).
  - **Select** drags a rectangle on the map and selects every pin, note and path it touches (Shift / Cmd / Ctrl add
    to the selection, *Cmd/Ctrl+A* selects all). Dragging one selected item moves them all together (kept inside
    the image); *Delete* removes them after one confirmation. Space held pans the map meanwhile.
  - **Zoom** is eased: the wheel, a trackpad pinch and the buttons move a target zoom that the map follows frame by
    frame around the pointer. The **view** (centre and zoom, relative to the fit zoom) is remembered per map on
    this device (`LocalPreferencesService`), so coming back to a map shows it as it was left; *Fit* resets it.
  - **Path**: each click adds a point; a click on the **first point** (three points at least) closes the shape and
    ends the drawing, a click on another earlier point loops back to it and ends it too. A double-click does not
    end it. While *Path* is the tool, *Done* and *Cancel* buttons sit on its right (*Enter* / *Esc* do the same);
    the first point is highlighted when the pointer is close enough to close the shape.
  - **Context menus** (right-click): on the map *Add pin here*, *Add note here*, *Draw a path from here*, *Zoom
    in*, *Zoom out*, *Fit*; on an item *Edit…*, *Open linked file* (a pin with a link) and *Delete…* (on a selected
    item of several: delete all of them).
  - A selection of one shows its details in the **side panel** (information: label, colour, link — a real link, so
    Cmd/Ctrl-click opens a background tab —, shape); a selection of several lists them. Editing happens in modals,
    and so does every confirmation (§8).
  - **Asset changes**: renaming or moving an image of the assets rewrites the `image` of the maps showing it.
- **Style**: the map is part of the app, not a widget: square shapes, Nordic Relic surface tokens
  (`bg-card`, `bg-raised`), `font-mono` labels, semantic colours for the chrome in both themes. User colours come from
  a fixed palette of the app's `--system-app-color-N` tokens, never free hex input.

## 7. Security

- **Path guard**: every path received from the renderer is resolved and rejected if it escapes the vault root.
- Rendered markdown is **sanitized** (vault content may come from other people through a shared folder).
- External links open in the system browser, never inside the app window.
- Assets are served through the `lazydm-asset://` protocol, scoped to the vault.
- **External URLs** go through `openExternalSafe` (`electron/utils/external-url.js`): only `https:`, `http:` and
  `mailto:` are handed to the system. `update:open-release` ignores the renderer and opens only the release page
  found by the last update check, on the configured GitHub repository.
- **Navigation** is limited to the app itself (exact dev origin, or the built `index.html`); IPC calls from any
  other frame are rejected.
- **CSP** is a `<meta>` tag in `src/index.html` (no remote scripts; the inline theme script is allowed by hash —
  update the hash if that script changes). Production builds do not inline critical CSS, which would need
  `unsafe-inline` scripts.
- `documents:open` only opens media files (images, PDFs, audio), never executables or scripts.

## 8. UI and navigation

- **Campaign and section management**: *Edit* and *Delete* are in the right-click menu of a campaign card (campaigns
  page) and in the toolbar of the campaign overview. Editing changes the name and description in `campaign.md`;
  **the folder (slug) never changes**. Deleting sends the folder to the system Trash after a confirmation with the
  file count, and forgets the campaign's entries in `vault.json`, its saved tabs and its index rows. For a section,
  *Edit* and *Delete* are in the right-click menu of the explorer and of the overview cards, and in the toolbar of
  the section page. A custom section opens the full edit sheet; a preset section can only be renamed. *Assets* and
  *Encounters* can be edited but never deleted. Sections of a compendium system are not editable.

- **First start** → the **setup flow** (`/setup`), two steps: *Welcome* then *Vault*. Until a vault exists, every
  route redirects there. LazyDM is made by a DM for DMs and is lazy by design, so the flow is short and speaks to a
  DM (preparing and running the session), with no feature tour and no *Skip* (two steps are shorter than a skip).
  - **Welcome**: Franco (`franco` icon, `text-primary`), the name `LazyDM.` as a page title, what the app is for in
    a few sentences (prepare once, run it at the table, the notes are plain Markdown files in a folder the user
    owns), and the device's **language and theme** selects (applied live, per-device, changeable later in
    *Settings → General*). The language starts from the system language. *Continue*.
  - **Vault**: what a vault is, the two ways to keep it — **on this device** (the files stay on this computer; no
    sharing, backups are the user's) or **in a cloud folder** (iCloud Drive, Dropbox, OneDrive, Box, Google Drive:
    the cloud app syncs the files between devices; LazyDM waits for pending downloads at start-up and warns when two
    devices changed the same note, see §5) — then *Choose folder* and the folder check (new / existing vault,
    writable, and which cloud drive the folder is in, if any), then *Create vault* / *Open vault*.
  - A vault that is missing or unreachable skips *Welcome* and goes to *Vault* with the usual alert. The
    `onboardingCompleted` device preference is set when a vault is opened or created; with it set and no vault the
    flow starts at *Vault*.
  - Look: the usual bordered `bg-card` panel; the ornaments of the engraved geometry module (ornamental rule under
    the title, bronze corner brackets on the panel, engraved divider between the two vault options); a step marker
    made of the same bronze bar as the ornamental rule. Decoration only, no text.
- **Title bar** (app header, every page): drag area, **Compendium**, **Customize** (a menu with *Templates* and
  *Tracker layouts*) and **Settings**, window buttons (no app name). The keyboard shortcuts list is in
  *Settings → General* (and Cmd/Ctrl+/).
- **Actions on pages and rows**: a toolbar keeps the labelled or icon **primary** actions and puts the rest behind a
  **"…" menu** (*New folder*, *Edit*, *Delete…*; Delete is last, after a separator, never one click away). Every row
  of a list and every campaign card has a visible **"…"** button that opens the same menu as the right-click.
- The **toolbar's bottom edge** is the ornamental rule from *engraved geometry* (bronze bar, ◇ ✣ ◇, hairline) —
  `.arc-ornament-rule`, the one dominant marker of that module. It is inset 16px on both sides.
- Every page has the **toolbar** (campaign list included: vault name as the path, *New campaign* as its action).
  The vertical divider before the title only appears next to the sidebar toggle.
  macOS keeps the native traffic lights inset into it (`titleBarStyle: 'hiddenInset'`); Windows/Linux use a
  frameless window with the app's own minimize / maximize-restore / close (double-click the bar = maximize).
- **Compendium, Templates, Battle rules and Settings are full-page sheets**, not pages of the campaign navigation: they open over the
  current page (named router outlet `overlay`), the campaign and its tabs stay as they are, and closing (×, Escape,
  Cmd/Ctrl+W, or the same title-bar button) brings it back. Each sheet reopens where it was left. Links to
  `/compendium/...` or `/settings/...` open in the sheet. Inside, a system has its own toolbar and appears in the sheet's cascading sidebar; sheet
  pages have their own toolbar context, so they never touch the campaign toolbar or tab titles.
- **Sheet or modal**: a **side sheet shows information** (the entity's linked note, the editor reference) and the
  **full-page sheets** (Compendium, Templates, Battle rules, Settings, Import from disk) are libraries and big
  editors. Anything that **creates, edits or deletes** — a form, a confirmation, a conflict — is a **modal**
  (`AppDialogFormService` for forms, `ArcTechAlertDialogService` for confirmations). A form never opens in a side sheet.
- Sheets and modals share one header: big condensed title, engraved divider, square close button.
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
  closing one), Source view (off by default: notes offer Live preview and Reading only). Choices among options are
  **dropdowns**, not segmented controls; each text size option is written at that size. The **code map** is our own (no dependency), in the editor and in Reading: the whole
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
  error, the navigation is cancelled and the conflict modal / error toast is shown.
- **Title bar**: the Compendium, Customize and Settings buttons are square icon buttons (tooltip and accessible name
  from the label).
- **Note toolbar**: the note actions (*Links*, *Copy to compendium / campaign*, *Rename*, *Save*) are square icon
  buttons (tooltip and accessible name from the label).
- **Editor**: CodeMirror 6 with three views, switched by three toggle buttons in a row above the editor (not a
  segmented control); the *Unsaved changes* label sits at the right end of that row. The view is remembered **per note on this device** (`document_view_modes` local preference, the most
  recent 500 notes; a new note opens in Live preview), so moving between notes always shows each one as left.
  - **Live preview** (default, Obsidian-like): the note stays editable and is shown rendered; the markdown syntax of
    an element comes back only while the cursor is on it. Headings, emphasis, code, quotes, lists, task checkboxes
    (clickable), images, links, tables, callouts and frontmatter (as a properties box) are rendered. The note opens
    with the cursor below the frontmatter. An image being edited stays shown, with its `![[…]]` / `![](…)` source
    on the line below it.
  - **Cursor and marks**: Up/Down always move one line, also through rendered tables and callouts; a click
    or an inserted list / task / quote / heading puts the cursor after its marks, so typing writes its text.
    Rendered blocks keep their spacing inside the widget, so clicks land on the line under the pointer.
  - **Same look as Reading**: quotes (primary bar, muted text), list markers in primary, task checkboxes as the
    app's square checkbox (primary with a check when done).
  - **Source**: the raw markdown in the mono font, syntax highlighted. **Hidden by default**; Settings → Editor
    turns it on. While hidden, a note remembered in Source opens in Live preview.
  - **Reading**: read-only, sanitized HTML (markdown-it + DOMPurify).
  - **Link suggestions**: Enter or Tab picks the highlighted one.
  - **Links behave like links**: pointer cursor (in every view), a click opens the note (Cmd/Ctrl-click opens it in a new tab), an
    external link opens in the browser, a broken link opens the fix menu. Clicking a link never moves the cursor.
    The editor re-resolves its links on every index update.
  - **Dividers** (`---`) render as a small primary `◇` at the start of the line followed by the plain rule.
  - **Callouts** (`> [!type] Title`): note/info (default), tip/success, warning, danger/error — left accent bar in
    the status colour, mono uppercase title.
  - **Formatting**: Cmd/Ctrl+B bold, Cmd/Ctrl+I italic (toggle: wrap the selection, or remove the marks around
    it; with no selection, insert the pair with the cursor inside). With a selection, typing `(` `[` `{` `"` `'`
    `` ` `` `*` `_` `~` wraps it instead of replacing it.
  - **Insert menu** (right-click in Live and Source; Reading and read-only templates have none; a right-click
    outside the selection moves the cursor there first): cut / copy / paste; bold, italic, strikethrough, inline
    code; *Heading* → H1–H3; *List* → bulleted, numbered, task; quote, code block (around the selected lines),
    table, *Info box* → note / tip / warning / danger callout, divider; *Link to note…* (`[[` with the link
    suggestions); *Asset* → *From assets…* (`![[` with the suggestions, assets first) and *Import file…* (file
    dialog, saved like a paste, §2). Link and asset entries need a scope (not in templates). A line is either a
    heading or a list / quote item: setting one replaces the other's marks; setting the same list or quote again
    removes it. Blocks go on their own lines, after a blank line when the cursor's line has text.
  - **Media embeds**: images render inline (drag an image to move its embed elsewhere in the note); a **PDF** is
    a file row (icon + name) opening the system viewer; an **audio** file is a row with a play/stop icon button,
    its name, its time and a volume slider, always shown (Live and Reading): the length (`0:12`, read from the
    file's metadata, rounded up) while stopped, `elapsed / length` while it plays.
  - **Note audio channel**: one audio plays at a time per note — starting another stops the current one. One
    volume for note audio, remembered on this device. There is no separate player: the row is the player.
    Changing or closing the note stops it. Note audio is meant for short sounds (≤ 30 s); a longer file is still
    saved and played, with a warning toast.
  - **Links before saving**: links, embeds and media typed in the note resolve right away (Live and Reading),
    against the files of the note's scope with the index's own rules (exact path, path suffix, name, shortest
    path); the index takes over again after the save.
  - **Link preview**: hovering a resolved note link (Live and Reading) shows a small eye button next to it;
    pressing it opens a floating, read-only preview card of the note (popover surface, 2px primary frame, title
    with its dot over the `.arc-ornament-rule`) with two icon buttons: *Open* (Cmd/Ctrl-click: new tab) and
    *Close*. The body renders as in
    Reading; a first heading repeating the title is left out. Escape, a click outside, the eye button again or
    changing note closes it.
  - **Editor reference** (an *info* icon button right after the three view buttons, tooltip and accessible name
    from the label): a side sheet listing everything the editor understands, grouped — text (bold, italic,
    strikethrough, inline code), headings, lists and tasks, links and embeds (`[[…]]`, `![[…]]`, markdown links),
    blocks (quote, info boxes, code block, table, divider), media (images, PDF, audio), frontmatter properties, and
    the keyboard shortcuts / right-click menu. Each entry shows the syntax (mono) next to how it renders (the
    Reading renderer, so it never drifts from the real output; images and properties get a one-line note instead).
    A right-side sheet without footer. Read-only; it never edits the note, and its samples are not clickable.

## 9. ArcTechUI visual style (Nordic Relic)

The component library is **ArcTechUI** (formerly ZardUI): classes `ArcTech*`, selectors `arc-*`, inputs/outputs `arc*`,
provider `provideArcTech()`. The visual style is **Nordic Relic**. The library is self-contained: the original
reference template has been removed, and the existing components and `src/styles.css` tokens are the reference now.
Component behaviour, variant keys and configuration stay as they are.

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
- **Campaign cards** (the campaigns page) carry bronze **corner brackets** (`.arc-campaign-card`, four
  `.arc-card-corner` spans, decoration only, `aria-hidden`) that grow on hover and focus; the card shows the
  standard pointer cursor. No glyph on the border.
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
- **No decorative text or glyphs** (runes, mottos, fake archive codes, background grids…).
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
| 10 | Editor quality (10.1–10.4) |
| 10.1 | Backtick input fix (macOS Option shortcuts of the completion keymap removed) |
| 10.2 | Cmd/Ctrl+B / Cmd/Ctrl+I toggles, wrap the selection on typing a pair, *Auto-close pairs* setting |
| 10.3 | Right-click insert menu: edit, format, H1–H3, lists, quote, code block, table, divider, info boxes, link, asset |
| 10.4 | Media assets: save on paste, *Import file…* in the editor, `assets:save` / `assets:import`, toast |
| 11 | File management (11.1–11.6) |
| 11.1 | Folder home: *New folder* stays on the page, row click toggles a sub-folder (↗ on hover opens it), normal cursor |
| 11.2 | Asset rows: image thumbnails, *Rename* for assets (embeds rewritten); identical pasted files reused |
| 11.3 | Asset page: the image alone, with *Rename*, *Copy to compendium / campaign*, *Delete* |
| 11.4 | *Delete…* notes and assets (system Trash; links to plain text / embeds removed, or left broken), confirmed |
| 11.5 | *Rename…* notes and sub-folders from the section page (sub-folder: folder, `subtype`, path links) |
| 11.6 | *Delete…* sub-folders: delete the files too, or move them to the main folder (links rewritten) |
| 12 | Editor media and preview (12.1–12.4) |
| 12.1 | Assets section: *Import from disk* sheet (select files or drop zone), drop on the page and its sub-folders |
| 12.2 | Media embeds in Live and Reading: audio row with play/stop, PDF row opening the system viewer |
| 12.3 | Editor fixes: links resolve before saving (Live and Reading), Reading view follows the edits, drag images to move them; audio rows with time and a remembered volume |
| 12.4 | Linked-note preview card (eye button on hover) and the editor reference sheet |
| 12.5 | Folder right-click menu (explorer and section page): *New note* and *New folder* where the folder allows them |
| 13 | Design polishing (13.1–13.4), from the impeccable audit |
| 13.1 | Normalize: light-theme contrast (`--muted-foreground`, form-control border token), text-size floor, `--scrim` / overlay-shadow tokens instead of literals, one focus style |
| 13.2 | Harden: `arc-dropdown-menu` trigger semantics (role, `aria-haspopup`, `aria-expanded`), hard-coded strings to i18n (`ESC`, table row labels), modal focus trap / return |
| 13.3 | Adapt: touch-target sizes (tab close, icon buttons), header-search listbox width and z-index scale, dialog margins on narrow windows |
| 13.4 | Optimize: replace `transition-all` (accordion, progress bar, sidebar width), `OnPush` for app-level components |
| 14 | Encounter manager (14.1–14.11), design in §6d: encounters are `.json` files of the Encounters section, linked like assets (`![[ambush.json]]`); every entity field is optional; rows are driven by battle rules |
| 14.1 | Format and Electron: encounter model (conflict-checked save), battle rule schema and default rule, `encounters:*` channels, typed service |
| 14.2 | Route and page: `*.json` in `encounters/` opens the encounter page; the section page lists encounters (swords icon) and offers *New encounter* |
| 14.3 | Rule-driven rows: initiative, name, health bar (HP + temporary HP), *Manage HP* modal (damage / heal / temporary HP) |
| 14.4 | Battle flow: *Start battle* / *Stop battle* (stop clears statuses and initiatives and restores HP where possible; no reset), next turn, add entities mid-battle, duplicate with numbering, drag to reorder, *Roll initiative* only when the rule has a formula |
| 14.5 | Cemetery: remove an entity, side panel listing the dead with recover |
| 14.6 | Statuses: free tags the user types on an entity, with an optional round count that ticks down at the end of its turn (no section, no notes; richer statuses may come later) |
| 14.7 | Side panel: the entity's linked note and rule fields read from the note's frontmatter |
| 14.8 | Party roster: hidden `encounters/_party.json`, always reachable from the encounters overview, re-added to any encounter |
| 14.9 | Battle rules: `_battle-rules/` JSON files (vault, system, campaign), built-in rule with *Customize*, per-campaign and per-encounter choice, dice-formula initiative and *Roll initiative* for selected entities, form editor in its own *Battle rules* sheet |
| 14.10 | Embedding: `![[x.json]]` renders as an encounter row in notes, link suggestions list encounters, Linked files panel shows them |
| 14.11 | Docs: §6d written, §2, §3, §8 and §12 updated with the final encounter design |
| 15.1 | Setup flow: *Welcome* (Franco, name, what it is for, language and theme) and *Vault* (device or cloud folder explained, folder check with the cloud drive), step marker, ornaments, entry guard |

## 12. Open decisions

- **TODO — settings for the open vault and a factory reset**: Settings has no place to see or manage the current
  vault (path, close it, switch) nor to reset the app. Add both, and make `factoryReset` stop the indexer and the
  cloud controllers first.

- **TODO — update check repository**: `package.json` `repository.url` is still a placeholder
  (`github.com/yourusername/lazy_dm`). Set the real GitHub repository once it exists; the update check and the
  release-URL allowlist both derive from it.

- **Encounters, later**: richer statuses (shared definitions with descriptions), combat timers, delay / hold turns,
  a roll for several encounters at once, and a starting-HP reset are left out on purpose and can be added without
  changing the file format (`version: 1`).

- **Backup**: optional "zip the vault" backup to replace the removed DB backup — to be decided later.
