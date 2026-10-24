# Plan: UI smoothing review (MVP polish)

Started 2026-10-24. Source: impeccable critique + live look at the real screens (light and dark, Italian).
Update the status table and the log below at the end of every step. One commit per phase.

## Decisions (agreed with the user)

| Topic | Decision |
| --- | --- |
| Entity | **Combattant** (display term; confirm exact spelling per language in Phase B) |
| Battle rule | **Tracker layout** |
| Vault | **Codex** (display term only: code, files, `vault.json`, `.lazydm/` keep their names) |
| Title bar | Templates and Battle rules (Tracker layouts) move into one **Customize** menu |
| New campaign | Hide empty sections on the overview (check impeccable onboarding suggestions) |
| Phase order | A → B → C → D → E → F |

Rules for every phase: read DESIGN_PRINCIPLES.md first, ask before new utilities or dependencies, i18n keys in all 7
languages (same line count in each file), no prettier reformat of existing files, local git only, verify both themes.
Before each phase, ask the user the open questions of that phase and record the answers here.

## Status

| Phase | Scope | Status | Commit |
| --- | --- | --- | --- |
| A | Bug fixes | done | see git log |
| B | Glossary | pending | |
| C | Visible actions | pending | |
| D | Empty states and first run | pending | |
| E | Voice | pending | |
| F | Design rules | pending | |

Status values: pending, questions, in-progress, done.

## Phase A. Bug fixes

- [x] A1 Whitespace before the primary dot in `secondary-sidebar.component.html` (`GENERALI .`, `VAULT .`); grep the app for the same pattern
- [x] A2 `Select an option` hard-coded in `select.component.ts`: now `common.selectPlaceholder` (7 languages); toolbar selects pass `aria-label` to the host, so the battle rule and template selects have real names. Other selects (settings, welcome) already had labels
- [x] A3 `Generic` rule name: library page shows `battleRules.builtInName` ("Default", 7 languages); the stored name in `battle-rule.model.js` is unchanged. The copy made by *Customize* is named "<Default> copy"
- [x] A4 Campaign card footer shows the note count (`campaigns.list.noteCount`); `campaigns:list` now returns `noteCount` (card excluded, null while the index is not open)
- [x] A5 Sidebar "go to home" tooltip: it was already on the right of the arrow, so moving it would not help; it now waits 600 ms before showing (deviates from the answer "tooltip to the side", see log)
- [x] A6 Long section names in the sidebar get the full name as a `title` tooltip
- [x] A7 Not a bug: the real built-in rule uses `encounters.fields.statuses` and is translated; the English word came from my test mock. Nothing changed

## Phase B. Glossary

Display text only. Key names, folders, file formats and code identifiers stay.

- [ ] B1 Entity → Combattant (check each language)
- [ ] B2 Battle rule → Tracker layout
- [ ] B3 Vault → Codex (copy in all languages, setup flow, settings, DESIGN_PRINCIPLES.md and CLAUDE.md wording)
- [ ] B4 One term for Links / Linked files / Linked notes
- [ ] B5 One term for Broken links / Review (nav key is still `broken-links`)
- [ ] B6 One phrase for Delete permanently / Delete forever
- [ ] B7 One term for Info box / callout
- [ ] B8 Update DESIGN_PRINCIPLES.md vocabulary and add a short glossary section

## Phase C. Visible actions

- [ ] C1 Section toolbar: *New note* stays the labelled primary; import, new folder, edit, delete go into a "More" menu; delete never sits beside the primary
- [ ] C2 Campaign overview toolbar: same treatment (delete campaign always visible next to edit)
- [ ] C3 Title bar: Compendium and Settings stay; Templates and Tracker layouts go under **Customize**; decide where Shortcuts goes
- [ ] C4 Right-click-only actions get a visible `…` button on rows and campaign cards
- [ ] C5 Template choice: one home (section toolbar); decide what Settings → Templates becomes (touches DESIGN_PRINCIPLES §6c)
- [ ] C6 Encounter page: consistent battle bar labels; no disabled *Roll initiative* mid-battle without a reason; label the toolbar icons
- [ ] C7 Links panel: collapsed or thin when empty

## Phase D. Empty states and first run

- [ ] D1 Section empty state: DM voice and a *New note* button, no folder path (`campaign-section-page.html:281`)
- [ ] D2 Empty encounter points to *Add party* / *Add combattant*
- [ ] D3 New campaign overview: hide empty sections (apply impeccable onboarding suggestions); decide how to reach hidden ones
- [ ] D4 Review alert: plain wording instead of "cose da rivedere"

## Phase E. Voice

- [ ] E1 Cut filler from Settings descriptions
- [ ] E2 Errors say the likely cause and what to do (save, rename, delete, move first)
- [ ] E3 Status syntax moves from the input placeholder to a persistent hint
- [ ] E4 English first, then the 6 other languages in one batch

## Phase F. Design rules

- [ ] F1 DESIGN_PRINCIPLES §9: the ornament rule is shapes, not text; fix the contradiction with "no decorative glyphs"
- [ ] F2 Reduce ornament density where it competes with content (Welcome panel)
- [ ] F3 Re-check every changed screen in both themes and in English and Italian
- [ ] F4 Add this review to DESIGN_PRINCIPLES §11 roadmap

## Phase A answers (2026-10-24)

- A2: translate the fallback in 7 languages and require a label on every select (battle rule and template selects first)
- A3: built-in tracker layout is shown as **Default** (translated display name; the stored name stays stable)
- A4: campaign card footer shows the **note count**
- A5 + A6: tooltip moves to the side of the arrow button, and long section names get the full name in a tooltip

## Log

- 2026-10-24: plan written, decisions recorded. No code touched yet.
- 2026-10-24: Phase A done. Build green, 57 electron tests pass (`npm test` finds no Angular specs, pre-existing). Checked in the browser with a mocked `electronAPI`: A1, A2, A3, A4. A5 and A6 are not checked visually. A5 changed the delay instead of the position because the tooltip was already on the right.
