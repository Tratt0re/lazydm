# Plan: Background pattern, image frames, table editing, split screen

**Complexity**: High. Order of work: A → B → C → D, one commit per phase, `npx ng build --configuration development` after each.

Decisions (defaults, change if wrong):
- Same note open in both panes: both panes share ONE document state (user decision), so an edit on one side
  shows live on the other. Implementation idea: a per-path shared document store (text, dirty flag, version) that
  both CodeMirror instances sync from, instead of each page holding its own copy; one save, one conflict check.
- Image frame options live in the embed alias: `![[img.png|right|50]]`.
- A new markdown-table parser/serializer is allowed (no existing counterpart).
- Pattern: design critique before code; static CSS, no Framer component, no animation.

## A. Background pattern (DEFERRED to the end)
The grid was built, critiqued and reverted: DESIGN_PRINCIPLES §9 bans background grids and the cells were not
aligned to the layout. Last step of the whole plan, after B, C and D: try a very fine noise at 2-3% (no lines)
on the app canvas only, opt-in in Settings → General. A grid may still make sense on the Maps page only.
- [x] A1 Design critique done, grid reverted
- [ ] A2 (last) Fine noise 2-3%, `BACKGROUND_NOISE` local preference + switch, token based, both themes
- [ ] A3 (last) i18n (7 languages), amend DESIGN_PRINCIPLES §9 if the noise is kept

## B. Image width (DONE; alignment was dropped by the user because it did not work, only width stays)
- [x] B1 Parse/write the width word in the embed alias (`![[img.png|half]]`, `wide`, `full`)
- [x] B2 "…" button under the eye in `ImageWidget` + menu
- [x] B3 Same classes in Reading (`document-preview.markdown.ts`)
- [x] B4 Editor reference sheet, i18n
- [x] B5 DESIGN_PRINCIPLES §8: the "…" width menu and the `|half|wide|full` syntax

## C. Table editing in Live preview
- [x] C1 Parser/serializer `table-edit.ts` + vitest (13 tests)
- [x] C2a Add row / add column buttons (`table-widget.ts`), shown on hover
- [x] C2b Cell menu (right-click / menu key): insert row above/below, column left/right, delete row, delete
      column. Column alignment skipped by the user (model function `setColumnAlign` exists, no UI).
- [x] C2c Arrow keys: Up/Down/Left/Right enter a table from the neighbouring line and move between cells
- [x] C3 Editable cells (click = markdown source of the cell), Enter / Tab / Shift+Tab / Esc, Tab out of the
      last cell adds a row, one change per edit. Tried by the user in the app and working.
- [x] C4 i18n (seven languages)
- [x] C5 DESIGN_PRINCIPLES §8 (Editor): describe in-place table editing, the cell menu, the arrow keys, and
      the image width "…" menu with its `![[img|half|wide|full]]` syntax (this is also task B5); add tables
      and image width to the editor reference sheet if a table entry is wanted

## Handoff (written before /compact, 2026-10-25)
- Commits so far: `903a006` image width, `2775f61` tables. Working tree clean. Nothing for A (noise) yet.
- The user tests in the real app with `npm run dev` (Electron); the chrome-devtools tool cannot drive
  Electron and plain `npm start` has no vault, so UI claims need the user's eyes. Say what was not tried.
- Project hooks: the Fact-Forcing Gate blocks the FIRST edit/write of each file in a session (just retry);
  the auto-mode classifier blocks `git checkout --`, `pkill`, and scripts that rewrite many files.
- Do not run prettier on existing files. No git push. Commit per finished phase with the Co-Authored-By line.
- i18n: every new key goes in all seven files (en, it, de, es, fr, uk, zh); en is the fallback.
- `toSpliced` is not available in this TS lib target; `git checkout` for reverts is blocked, use edits.
- The user asked to compact context before starting D. Start D by re-reading `workspace.service.ts`,
  `layout/tab-bar/tab-bar.ts`, `layout/root-layout/root-layout.html` (one `<router-outlet />` inside
  `arc-content#main-content`), `toolbar-context.service.ts`, `pages/document-page/document-page.ts`
  (autosave on leave) and `app.routes.ts` (named outlet `APP_SHEET_OUTLET` already used by sheets).
  Propose the D1 refactor and get the user's OK before touching code.
- Decisions for D: two panes only; the same note in both panes shares ONE live document (edit on one side
  shows on the other, cursor/scroll per pane, one autosave, one conflict modal); tabs move between sides;
  "Open in split" in the explorer, the note "…" menu and the tab context menu.
- Open for later: A (very fine noise 2-3% on the app canvas only, opt-in in Settings → General; §9 of
  DESIGN_PRINCIPLES bans background grids so a grid was reverted), and the DESIGN_PRINCIPLES update (C5).

## D. Split screen (branch `feature/split-screen`; fall back to `main` if it goes wrong)
Decisions: each pane has its own tab bar and toolbar; the right pane is a named router outlet `split`; any tab
can be in a pane. Navigation inside a pane stays in that pane (option 1): every link and `navigateByUrl`
(39 + 36 call sites) targets the primary outlet today, so the right pane provides its own `Router` stand-in
(wrapper: `navigateByUrl`/`navigate`/`createUrlTree` write to `split`, `url` is the pane's path, the rest passes
through) and no call site changes. Spike it first (campaign routes duplicated under `outlet: 'split'`, one page
on the right); fall back to an explicit `PaneNavigator` plus call-site edits if the spike fails.
- [x] D1a `Pane` component (tab bar + toolbar + page) with its own `ToolbarContextService` (`b0612f6`)
- [x] D1b Router stand-in spike: works (checked in Chrome with `.claude/plans/mock-electron.js`, which must be
      pasted as `initScript` on every `navigate_page`). Second pane shows `/…(split:campaigns/x/npcs/bob)`;
      toolbar breadcrumbs and `router.navigateByUrl` in the right pane change only `split`; leaving an edited
      note in the right pane autosaves through `documentLeaveGuard`. `routerLink` passes `relativeTo` even for
      absolute links, so the stand-in only defers to the real router for relative commands. Not yet checked:
      editor `[[links]]` (needs resolved links in the mock), `ActivatedRoute` params in the right pane.
      The spike shows the right pane whenever the URL has a `split` outlet (`RootLayout.hasSplit`).
- [x] D1c `WorkspaceService` with tabs per pane: `pane` on tabs (missing = left), `rightActiveTabId` saved in
      `tabs_json` (`{ tabs, rightActiveTabId }`; old rows are a plain array and still load), one active tab per
      pane, a focused pane, the right pane exists while it has tabs, closing a pane's last tab closes the pane.
      `TabBar` takes `pane` and shows that side's tabs; only the left bar listens to the document (link
      clicks, shortcuts, Cmd+W). Checked in Chrome with the mock: restore, switch tabs in each pane, new tab in
      the right pane, back in the right pane, close down to no split, saved shape, same note in both panes.
      Found on the way: reporting a tab title read signals inside an effect, so two panes showing one note
      renamed each other forever (NG0103); `reportTitle` is now untracked and renames per pane.
      Not done yet: no way to open the split from the UI (D3), draggable divider and widths (D2), shortcuts
      for the other pane (D4), the app menu still acts on the focused pane only.
- [x] D2 divider (drag, arrows, Home/End, double-click = 50%), ratio saved per device (`split_ratio` local preference), panes keep 360px minimum, below two panes' width only the focused pane shows (the other stays mounted). Checked in Chrome. OPEN: in the narrow fallback nothing on screen switches to the other pane (only tab activation does).
- [~] D3a done (`Open to the side` in the explorer file menu, the tab-bar link menu and the note's "…" menu; `Move to the right/left side` in the tab menu; checked in Chrome). Tab drag between the two bars done (one `cdkDropListGroup` on the panes, drop at the dropped position; checked in Chrome with the drag tool, both directions).
- [ ] D3 Tab drag between panes, "Open in split" (explorer, note "…", tab menu)
- [x] D4 The focused side follows click and keyboard focus; its active tab keeps the bronze underline, the other side's is neutral; shortcuts, the application menu and back/forward act on the focused side (the workspace defaults to it); in a narrow window a button in the tab bar shows the other side. DESIGN_PRINCIPLES §8 now has the split screen, tables edited in place and the image width menu (B5, C5 done). Checked in Chrome.
- [x] D5 Shared document: `SharedNoteService` keeps one live document per note path (file, text, save state); each pane's `DocumentPage` joins it, its editor follows remote changes through `syncContent` (a minimal change flagged remote, so undo history and cursor stay per pane), one save and one conflict modal for both panes, leaving one pane never saves while the other still shows the note. Checked in Chrome: typing on each side, undo on one side, one write on save, one modal for two simultaneous saves, reload from the conflict modal, right pane to another note and back.
      cursor/scroll stay per pane, one autosave and one conflict modal

## Follow-ups after the user's first try (2026-10-25)
- [x] Links in a pane carry the other pane (`/a(split:b)`): the tab bar read the first pane's page out of every
      link, so Cmd/Ctrl-click and the link menu in the right pane (and on a breadcrumb) opened a copy of the
      left tab. `WorkspaceService.pageOfLink` takes the page of the side the link is in; tabs open on that side.
- [x] Maps and encounters shown in both panes share one live state (`SharedFileService`: file, data and the
      save flags), so a pin, a path or an entity added on one side shows on the other and the file is saved once.
      Checked in Chrome with the pages' own update methods; not by clicking the map tools.

