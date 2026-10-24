# Plan: UI/UX polish pass (MVP)

Started 2026-10-24. Source: impeccable critique + a live look at the real screens (dark and light, 1440x900 and 900x700,
mocked Electron API in the browser). Update the status table and the log at the end of every phase. One commit per phase.

Rules for every phase: read DESIGN_PRINCIPLES.md first, ask before new utilities or dependencies, i18n keys in all 7
languages (same line count in each file), no prettier reformat of existing files, local git only, verify both themes,
rebuild the preload bundle only if `channels.js` changes (not expected).

## Decisions (agreed with the user)

| Topic | Decision |
| --- | --- |
| Tracker row density | The compact row is the **default**; Settings gets an opt-in density choice (device-local) to go back to the roomy row |
| Note properties box | **Collapsed by default**, with a trigger button to open it, so the properties can always be checked; the open state is remembered per device so a user can keep it visible |
| Note names and tab titles | Move to `font-sans`; mono stays for labels, nav items, metadata |
| Vault step cards | **One explanation**, not real choices; the cloud note is short |
| Plan file | This file, tracked in `.claude/plans/` |

## Status

| Phase | Scope | Status | Commit |
| --- | --- | --- | --- |
| 0 | Update DESIGN_PRINCIPLES.md (agree the wording first) | done | see git log |
| 1 | Tracker rows: compact default + density setting | done | see git log |
| 2 | Encounters section page | done | see git log |
| 3 | Note page chrome and toolbar, collapsible properties | done | see git log |
| 4 | Alignment, overview alert, Review page | done | see git log |
| 5 | Ornament and typography | done | see git log |
| 6 | Light theme | pending | |
| 7 | Setup flow copy | pending | |
| 8 | Narrow windows | pending | |
| 9 | Closure | pending | |

Status values: pending, questions, in-progress, done.

## Phase 0. DESIGN_PRINCIPLES.md

Changes that break written rules, so the file changes first:

- [ ] §9 ornament: the ◇✣◇ rule is on every page title; restrict it (welcome and top-level pages, or a real break)
- [ ] §6d entity card: the header strip with all system actions is replaced by hover/focus actions and a "…" menu
- [ ] §6d: density setting (compact default, roomy opt-in)
- [ ] §9 fonts: mono is for labels, nav items and metadata, not note names or tab titles
- [ ] §8 note toolbar: Save and Links visible; Rename, Copy and Delete in the "…" menu
- [ ] §8 editor: properties box collapsed by default, trigger button, state remembered per device
- Verify: the user agrees the wording before Phase 1.

## Phase 1. Tracker rows

Problem: rows are ~180px tall (2.5 of 5 combatants visible at 1440x900); the statuses help sentence repeats under every
row; delete is always visible next to harmless icons; the turn highlight is only an outline.

- [ ] Compact default row of ~80-90px; roomy layout kept behind the density setting
- [ ] Statuses help shown once (field hint or tooltip), not per row
- [ ] Row header strip replaced by actions revealed on hover/focus; delete inside a "…" row menu, last, after a separator
- [ ] Current turn: bronze left marker plus a "Turn" label (not colour alone)
- [ ] Density setting in Settings → General (device-local, `LocalPreferencesService`)
- Files: `pages/encounter-page/encounter-page.html` (420 lines) and `.ts`, `components/encounter-health-bar`,
  `pages/settings-page`, `src/styles.css`, `public/i18n/*.json`
- Risks: HIGH, rows are driven by user-defined Tracker layouts (12 columns, up to 4 rows), so test a 1-row and a 4-row
  layout; touch targets (§13.3); drag-to-reorder must survive the header change
- Verify: `npx ng build --configuration development`; browser at 1440x900, dark and light, with 5 and 15 combatants;
  keyboard-only run (next turn, edit HP, add a status, delete); `npm test`

## Phase 2. Encounters section page

- [ ] Remove the large swords watermark
- [ ] Party roster out of the floating full-width button (toolbar or "…" menu)
- [ ] Label or tooltip the filled swords icon (New encounter) and the import icon; make sure the primary action is clear
- Files: `pages/campaign-section-page/*`
- Risk: the page is shared by every section type, so check Enemies and Assets too
- Verify: Encounters, Enemies, Assets pages in both themes

## Phase 3. Note page chrome and toolbar

- [ ] Properties box collapsed by default with a trigger button; open state remembered per device
- [ ] No duplicate H1 when it equals the title; breadcrumb and title tightened
- [ ] Toolbar: Save (clear dirty and clean states) and Links stay; Rename, Copy to compendium, Delete go to the "…" menu
- [ ] Code map only past a length threshold (behaviour change: confirm the threshold with the user)
- Files: `pages/document-page/*`, `layout/toolbar/toolbar.html`, `components/code-map`, `components/document-preview`,
  the CodeMirror frontmatter widget
- Risks: the toolbar is shared by every page; the title must stay in the file's frontmatter (Obsidian compatibility)
- Verify: edit, save, rename, delete by keyboard; unsaved-changes autosave on leaving

## Phase 4. Alignment, overview, Review

- [ ] Campaign list grid and overview content aligned to the title's left edge
- [ ] Review alert: warning treatment instead of destructive red, the sentence instead of a summed count
- [ ] Review page: hide empty groups
- Files: `campaign-list-page.html`, `campaign-home-page.ts`, `review-page.html`, `layout/root-layout`
- Verify: 1440 and 900px, both themes

## Phase 5. Ornament and typography

- [ ] Ornament rule conditional (`toolbar.html:180`, `styles.css:402-424`, welcome page, `link-preview-card`)
- [ ] Tile ghost icons removed or reduced
- [ ] Note names and tab titles in `font-sans`
- [ ] Welcome trio varied (one lead statement, two supporting lines)
- Risks: font change shifts widths in tabs and sidebar; check long names and all 7 languages

## Phase 6. Light theme

- [ ] Muddy grey canvas, filled-grey selects and toggles that read as disabled
- Tokens only (`src/styles.css`); re-check the §13.1 contrast work
- Verify: every earlier screen again in light, plus a contrast check

## Phase 7. Setup flow copy

- [ ] Vault step: one explanation, shorter cloud note
- Files: `pages/vault-setup-page`, `pages/welcome-page`, i18n

## Phase 8. Narrow windows

- [ ] First confirm the problem: at 900px the sidebar was hidden, but I did not confirm whether anything signals it
- Files: `layout/root-layout`, `layout/sidebar`

## Phase 9. Closure

- [ ] DESIGN_PRINCIPLES.md roadmap row (§11), §6d and §9 final
- [ ] The 7 i18n files have the same line count; unused keys removed
- [ ] Final `npx ng build --configuration development` and `npm test`

## Log

- 2026-10-24, user follow-up: the encounter page fills the width too (its `max-w-5xl` cap is gone), and the three
  hover-revealed icons (edit, duplicate, cemetery) are removed from the combatant row: the "…" menu already held all
  four actions and now is the only place. The row keeps its drag handle, roll checkbox, HP button and the "…".
  Checked in the mock (dark): row buttons are `Manage HP` + `More actions` only, the menu lists Edit, Duplicate, Send
  to the cemetery, Delete forever (last, after a separator), list right edge 1418 against 1424 for the area. Not
  checked: light theme, the keyboard path of the menu, a running battle with 15 combatants at the new width, and the
  roomy density.
- 2026-10-24, Phase 4 follow-up (user: "very wide space on the right"): the gap was the `max-w-5xl`/`max-w-6xl` cap
  on the page columns, which phase 4 made visible by left-aligning them. The user chose to fill the width: caps
  removed on the overview, system overview, Review, broken links, Compendium, section and campaign list pages; tile
  grids are `auto-fill` (18–24rem minimum) instead of 2/3 fixed columns; description paragraphs keep `max-w-3xl`/
  `max-w-2xl`. Measured at 1440: column and widest row end at the same x on all of them. At 2200px wide the tiles are
  fine (312px each) but list rows are 1918px wide (name at the far left, "…" at the far right): a decision for the user
  (a generous cap such as 90rem on list pages). The encounter page was not part of this change and keeps its cap.
- 2026-10-24, Phase 5: the toolbar takes a `hasOrnament` input (default false): the ◇✣◇ rule is drawn only on the
  Campaigns page; every other toolbar gets a plain hairline (Welcome keeps its own rule in its page header; Settings
  already had its own ◇ divider, untouched). The ghost icons of the section tiles (campaign and system overviews)
  are gone, replaced by a small icon beside the title; the Campaigns card keeps its large icon (the card has corner
  brackets and is the page's identity). Note and file names in the sidebar explorer are `font-sans` 13px; sections
  and sub-folders keep mono. Welcome: the trio is now one lead card (the table session, bigger) with two lighter
  supporting lines. Copy unchanged. Checked in the mock: ornament counts per page (overview 0, section 0, Review 0,
  Campaigns 1), the overview and section pages in both themes, Welcome in dark. Not done: the Campaigns card icon,
  the compendium/system list pages (not looked at), `link-preview-card` keeps its own ornament (design doc says so),
  the mono tab titles were already changed in phase 3, the breadcrumb stays mono (a label). Not checked: Welcome
  in light, Welcome at narrow widths (the grid has one column below `md`), Setup's vault step, the Compendium pages.
- 2026-10-24, Phase 4: the cause of the misalignment was the pages centring a `max-w` column (`mx-auto`) inside a
  content area that was already wider than it, so the column started 68px (overview) or 128px (campaign list) after
  the title. Now `arc-content` has a 16px side padding (the toolbar's), the column is left-aligned (`py-6` only) on
  the overview, system overview, Review, Compendium, broken links, section and encounter pages, and the campaign list
  grid starts at the title edge (measured: title 264 = column 264 on all of them; list 16 = 16). The section page's
  drop-zone wrapper negative margins follow the new padding. New `warning` alert variant; the Review alert on both
  overviews uses it, and its title lost the summed count (all 7 languages; the sentence below still counts each
  kind). The "empty Broken links heading" from the critique did not reproduce: the group renders only when the
  count is above 0, and the page shows the group and its rows together; I could not test the case where the index
  count and the list differ (my mock returns both). Not checked: the note, map and asset pages (they fill the area;
  the note was measured at 264 but not looked at), `tooDeep` group, narrow window beyond one screenshot of the list.
- 2026-10-24, Phase 3 follow-up (user request): the repeated name. The open tab now shows only its icon (the page
  title names the page); the other tabs keep icon and name; the label's width animates on select/deselect (grid
  `0fr`/`1fr`, 200ms, off with reduced motion; measured 175 → 66px over ~200ms, no jump). The `min-w-28` floor went
  with it and the tab text moved from mono to the sans font (agreed typography). The *Properties* toggle now also
  works in Reading (box with the same width as the text column), through one shared parser
  (`frontmatterProperties`, also used by the live preview). Not checked: the tab animation with many tabs and an
  overflowing bar, drag-to-sort of tabs after the width change, screen reader name of an icon-only active tab (the
  `title` attribute and the DOM text stay, but a hidden-opacity label may be read twice), light theme beyond one screen.
- 2026-10-24, Phase 3: note toolbar is Save + Links + a "…" menu (Rename, Copy to compendium / campaign, Delete… last
  after a separator). Properties box collapsed by default with a *Properties* toggle in the editor row (live view
  only; open state per device in `document_properties_open`); a `title` property equal to the page title is left out of
  the box, and a header with nothing else to show is replaced by nothing. Templates keep the box (the editor input
  defaults to shown). Code map: new setting *Hide the code map on short notes* in Settings → Editor, off by default
  (the map stays always-on, as the user asked); the threshold is 40 body lines (`CODE_MAP_SHORT_NOTE_LINES`, chosen
  by me at the user's request), applied in the editor and in Reading. Checked in the mock: collapsed and opened box,
  open state stored, the 2-line note loses the map and its 116px padding while a ~60-line note keeps both, Reading
  follows the same rule, the "…" menu in dark, unsaved state (Save from 50% to full opacity plus the label).
  Not done from the plan: the breadcrumb and the page title are untouched (the title still appears in the tab, the
  sidebar, the toolbar and the H1). Not checked: the light theme of the "…" menu, Escape/arrow keys in that menu, a
  live check that rename/copy/delete still run from the menu, notes whose frontmatter has no `title`, the 40-line
  threshold counts raw lines (a wrapped paragraph is one line).
- 2026-10-24, Phase 2: the background watermark is removed from every section page (user decision: it was common to
  all of them), with its `.arc-page-watermark` CSS. The *Party roster* link is now a labelled outline button in the
  Encounters toolbar instead of a row above the list. *New encounter*, *New map* and *New note* lost `iconOnly` and
  show their label (they were unlabelled icons). The import icons stay icon-only with a tooltip. Checked in the mock:
  Encounters, Enemies, Assets, Maps toolbars in both themes, no watermark left in the DOM. Not checked: the toolbar at
  narrow widths (more labelled buttons now), the real Assets drop zone.
- 2026-10-24, Phase 1: the built-in Default tracker layout is now 2 rows (initiative, AC, name, HP / statuses, note;
  agreed with the user). Row header strip replaced by a left rail (drag, roll checkbox) and an actions column (edit,
  duplicate, cemetery on hover/focus; "…" always visible, Delete last). Turn chip next to the name. Statuses hint written
  once above the list. Density setting in Settings → General (`tracker_row_density`, compact default). Measured at
  1440x900 with the built-in layout: compact 86px (was ~180px+), roomy 122px; custom 1-row layout 50px, 4-row 142px.
  Deviations: compact lands at 86px (inside the 80-90 target); Roomy keeps the same structure as compact with the old
  spacing, as agreed. Custom layouts made earlier with *Customize* keep their own areas. Not covered: drag-to-reorder
  was not exercised (no drag in the mock), the touch size of the row buttons is 28px, and no Angular specs exist for
  this page (`npm test` finds none; `test:electron` passes, 57 tests).
- 2026-10-24: plan written; decisions above agreed. The critique covered the welcome and vault steps, the campaign list,
  the overview, a note, the tracker (running state only), the Encounters section page, Review, Settings → General and
  the New note modal. Not yet seen: an empty or idle tracker, the maps page, the Import modal, the remaining Settings tabs.
