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
| 1 | Tracker rows: compact default + density setting | pending | |
| 2 | Encounters section page | pending | |
| 3 | Note page chrome and toolbar, collapsible properties | pending | |
| 4 | Alignment, overview alert, Review page | pending | |
| 5 | Ornament and typography | pending | |
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

- 2026-10-24: plan written; decisions above agreed. The critique covered the welcome and vault steps, the campaign list,
  the overview, a note, the tracker (running state only), the Encounters section page, Review, Settings → General and
  the New note modal. Not yet seen: an empty or idle tracker, the maps page, the Import modal, the remaining Settings tabs.
