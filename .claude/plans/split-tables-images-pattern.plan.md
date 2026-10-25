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
- [ ] B5 DESIGN_PRINCIPLES §8: describe the "…" width menu and the `|half|wide|full` syntax

## C. Table editing in Live preview
- [ ] C1 Parser/serializer `table-edit.ts` + vitest
- [ ] C2 Phase A: add row/column buttons, row/column "…" menu (insert, delete, align)
- [ ] C3 Phase B: editable cells, Tab/Shift+Tab, one transaction per edit
- [ ] C4 Docs, i18n

## D. Split screen
- [ ] D1 Per-pane `ToolbarContextService` and `WorkspaceService` (no visible change)
- [ ] D2 `pane` on tabs, `splitRatio`, second outlet, divider, narrow-window fallback
- [ ] D3 Tab drag between panes, "Open in split" (explorer, note "…", tab menu)
- [ ] D4 Shortcuts follow the active pane, persistence, docs
- [ ] D5 Shared document store: same note in both panes edits one text; live sync between the two editors,
      cursor/scroll stay per pane, one autosave and one conflict modal
