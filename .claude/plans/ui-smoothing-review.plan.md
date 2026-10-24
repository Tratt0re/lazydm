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
| B | Glossary | done | see git log |
| C | Visible actions | done | see git log |
| D | Empty states and first run | done | see git log |
| E | Voice | done | see git log |
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

- [x] B1 Entity → Combattant (check each language)
- [x] B2 Battle rule → Tracker layout
- [x] B3 Vault → Codex (copy in all languages, setup flow, settings, DESIGN_PRINCIPLES.md and CLAUDE.md wording)
- [x] B4 One term for Links / Linked files / Linked notes
- [x] B5 One term for Broken links / Review (nav key is still `broken-links`)
- [x] B6 One phrase for Delete permanently / Delete forever
- [x] B7 One term for Info box / callout
- [x] B8 Update DESIGN_PRINCIPLES.md vocabulary and add a short glossary section

## Phase C. Visible actions

- [x] C1 Section toolbar: *New note* stays the labelled primary; import, new folder, edit, delete go into a "More" menu; delete never sits beside the primary
- [x] C2 Campaign overview toolbar: same treatment (delete campaign always visible next to edit)
- [x] C3 Title bar: Compendium and Settings stay; Templates and Tracker layouts go under **Customize**; decide where Shortcuts goes
- [x] C4 Right-click-only actions get a visible `…` button on rows and campaign cards
- [x] C5 Template choice: one home (section toolbar); decide what Settings → Templates becomes (touches DESIGN_PRINCIPLES §6c)
- [x] C6 Encounter page: consistent battle bar labels; no disabled *Roll initiative* mid-battle without a reason; label the toolbar icons
- [x] C7 Links panel: collapsed or thin when empty

## Phase D. Empty states and first run

- [x] D1 Section empty state: DM voice and a *New note* button, no folder path (`campaign-section-page.html:281`)
- [x] D2 Empty encounter points to *Add party* / *Add combattant*
- [x] D3 New campaign overview: hide empty sections (apply impeccable onboarding suggestions); decide how to reach hidden ones
- [x] D4 Review alert: plain wording instead of "cose da rivedere"

## Phase E. Voice

- [x] E1 Cut filler from Settings descriptions
- [x] E2 Errors say the likely cause and what to do (save, rename, delete, move first)
- [x] E3 Status syntax moves from the input placeholder to a persistent hint
- [x] E4 English first, then the 6 other languages in one batch

## Phase F. Design rules

- [x] F1 DESIGN_PRINCIPLES §9: the ornament rule is shapes, not text; fix the contradiction with "no decorative glyphs"
- [x] F2 Reduce ornament density where it competes with content (Welcome panel)
- [ ] F3 Re-check every changed screen in both themes and in English and Italian
- [x] F4 Add this review to DESIGN_PRINCIPLES §11 roadmap

## Phase A answers (2026-10-24)

- A2: translate the fallback in 7 languages and require a label on every select (battle rule and template selects first)
- A3: built-in tracker layout is shown as **Default** (translated display name; the stored name stays stable)
- A4: campaign card footer shows the **note count**
- A5 + A6: tooltip moves to the side of the arrow button, and long section names get the full name in a tooltip

## Phase B answers (2026-10-24)

- B1: natural word per language (Combatant, Combattente, Combattant, Kämpfer, Combatiente, Боєць, 战斗者)
- B3: **Codex** as one fixed word in every language
- B4: **Links** is the one term for the panel
- B5: **Review** everywhere; "Broken links" stays only as a group title inside the Review page
- B6: **Delete forever** (card, cemetery and confirmation)
- B7: **Info box**; "callout" survives only in the markdown syntax example (`> [!note]`)
- B2: Tracker layout is translated per language (exact words listed in the log before the files change)

## Phase C answers (2026-10-24)

- C1/C2: section pages and the campaign overview show the labelled primary, a visible Import, and a "..." menu with New folder, Edit and Delete (Delete is no longer one click away)
- C3: title bar keeps Compendium, **Customize** (menu: Templates, Tracker layouts) and Settings; Keyboard shortcuts move into Settings (the shortcut key keeps working)
- C4: a visible "..." button on each list row and campaign card, opening the same menu as right-click (replaces the three always-visible row icons)
- C5: Settings → Templates is removed; the template is chosen on the section page (DESIGN_PRINCIPLES §6c to update)
- C6: battle bar hides the roll controls (Roll initiative, Select all) while a battle runs; encounter toolbar keeps the Cemetery and the tracker layout select visible, Rename and Delete go into a "..." menu
- C7: the Links panel is closed by default and the Links button shows the link count; the open/closed choice is still remembered per device

## Phase D answers (2026-10-24)

- D1: an empty section shows its own description and a primary **New note** button; the folder path is gone
- D2: an empty encounter shows **Add combatant** and **Add party** buttons inside the empty state (Add party left out when the campaign has no party roster yet)
- D4: the Review alert says what is wrong in plain words, built from the real problems ("2 broken links, 1 note outside any section"), with an "Open Review" button
- D3: a new campaign's overview shows one **Start** card plus only the sections that have content; a quiet **More sections** row reaches the rest
- D3 start card: no fixed starting points. One generic **New…** button opens a form with a **section picker** listing every section that can take a new file (all note sections incl. custom ones, plus Encounters and Maps); picking Maps or Encounters switches to that section's own fields. No separate "import a map" link
- D3 reuse: the same generic **New…** becomes the primary button of the overview toolbar (the start card is its first-run version); *Add section* moves into the "…" menu
- D3 flow: **two steps**. *New…* opens a small modal with only the section picker; confirming opens that section's own existing form (note title, encounter name, or map name + image). The sidebar **+** skips the picker and goes straight to that section's form
- D3 sidebar: stays complete (nothing hides). Each creatable section row gets a **'+' shown on hover or focus** that opens the same New form for that section
- Open: delete `src/app/pages/settings-page/components/sections/templates-section/` (approved, but `git rm` was blocked by the permission classifier)

## Phase E answers (2026-10-24)

- E2: errors say the likely cause and what to do ("Couldn't save the note. The folder may be offline. Your text is still here."); save, rename, delete and move first
- E1: cut the filler lines of Settings entirely instead of rewriting them
- E3: the status syntax leaves the placeholder for a small persistent hint under the field, and it should also explain the idea, not only the syntax
- Extra (user): the Assets section's empty state needs a CTA button; the label *New…* loses its "…" (the user does not like them)

## Adjustments before Phase F (2026-10-24, from the user)

- [x] X1 Links badge is clipped at the top by the toolbar frame
- [x] X2 Remove the Tracker layout select from the encounter page (the one on the Encounters home stays), like notes have none
- [x] X3 Rename the generic *New* button to **New note**
- [x] X4 Assets: import in a modal (not the side sheet); sidebar **+** on Assets opens it; paste into the drop area; drop and paste also on the empty-state button
- [x] X5 New section modal: remove the *Note type* input (sections no longer carry a type)
- [x] X6 The *New note* picker and its form become one two-step modal (wizard) with a Back button, no close-and-reopen flash

## Log

- 2026-10-24: plan written, decisions recorded. No code touched yet.
- 2026-10-24: Phase A done. Build green, 57 electron tests pass (`npm test` finds no Angular specs, pre-existing). Checked in the browser with a mocked `electronAPI`: A1, A2, A3, A4. A5 and A6 are not checked visually. A5 changed the delay instead of the position because the tooltip was already on the right.
- 2026-10-24: Phase B done. Text-only change in the 7 locale files (same keys, 1494 lines each), plus the glossary in DESIGN_PRINCIPLES §1b and a pointer in CLAUDE.md. Details: Codex is a fixed word in every language; the combatant, tracker layout, info box and delete-forever wording follow the answers above. Links panel: toolbar button and panel heading say *Links*, groups inside are *Notes* and *Assets*. Review: the page keeps its title, 4 unused keys were removed (`nav.items.broken-links`, `links.broken.alertTitle`, `links.broken.review`, `links.broken.cardDescription`), and the panel link now reads "See all in Review". Delete forever: the Ukrainian and Chinese already meant "forever", so they were left as they were. Checked in the browser: Settings → Codex in Italian. Not checked visually: the other languages (JSON valid, keys identical to English).
- Left for later phases: the empty-state and alert wording ("cose da rivedere", Phase D), error wording (Phase E). The French `Coffre` and Spanish `Bóveda` for the old word are gone.
- 2026-10-24: Phase C in progress. Done: C1, C2, C3. The toolbar has a new item type `menu` (the "..." button, `ToolbarMenuItem` in `toolbar-context.service.ts`); section pages and the campaign overview use it for New folder / Edit / Delete (Delete after a separator, in red). Title bar: Compendium, **Customize** (wrench icon; menu with Templates and Tracker layouts) and Settings; the shortcuts button moved to Settings → General (Cmd+/ still works). Checked in the browser (Italian, light): title bar, Customize menu, section toolbar and its "..." menu. Next: C4, C5, C6, C7.
- 2026-10-24: Phase C done. C4: every row of a section list has one "..." button (same menu as right-click: copy, rename, move, reveal, delete), sub-folder rows and campaign cards have one too. C5: *Settings → Templates* is removed from the Settings navigation and page; the component files `templates-section.component.*` are still on disk, **unused, waiting for your OK to delete** (CLAUDE.md asks to list files before deleting). The keys `settings.sections.templates.*` and `settings.templates.rules.*` are still used or left for that cleanup. C6: roll controls (Roll initiative, Select all, row checkboxes) are hidden while a battle runs; encounter toolbar shows the layout select, a labelled *Cemetery* button and a "..." menu (Copy to, Rename, Delete forever-style delete last); the select now says "Default" like the library. C7: the Links panel starts closed (`documentLinksPanelOpen` default is `false`; devices that already chose keep their choice) and the toolbar button has a count badge (new `badge` field on toolbar actions). DESIGN_PRINCIPLES updated (§6c, §6d, §8). Checked in the browser (Italian, light): title bar and Customize menu, section toolbar and row menus, campaign cards, Links badge and closed panel, encounter battle bar idle and running. Not checked: dark theme and other languages for the new controls; dragging a row still works but I did not re-test it after adding the "..." button.
- 2026-10-24: Phase D part 1 done (D1, D2, D4). D1: an empty section shows its own description and a primary button (New note / New encounter / New map; none for Assets or a system); key `campaigns.sections.emptyDescription` removed. D2: an empty encounter shows *Add combatant* and *Add party* (the roster page only the first). D4: the Review alert reads "Needs a look: 3" with "2 broken links, 1 note outside any section" and an *Open Review* button (new `ReviewService.describe()`, keys `review.summary.*`, `review.alertDescription` removed); the same on the compendium system page. Checked in the browser (Italian, light): D1 and D4. Not checked: D2 (empty encounter) visually. Next: D3.
- 2026-10-24: Phase D done. D3: the overview toolbar's primary is **New…** (`FileActionsService.openCreateAnythingSheet`: a picker of every section that takes a new file, then `openCreateInSection` opens that section's own form); *Add section* is in the "…" menu. Tiles only for sections with files; a campaign with none shows the **Start** card (`campaigns.newAnything.*`) and a *More sections (N)* row that unfolds the empty ones. Sidebar rows of creatable sections (campaign scope only) show a **+** on hover or focus (`explorer.newIn`) that calls `openCreateInSection` directly. Checked in the browser (Italian, dark): Start card, More sections row, sidebar + (not on Assets), the picker, the note form and the map form. Not checked: the encounter form from the picker, a campaign with content on the overview, and the sidebar + in the light theme. DESIGN_PRINCIPLES §8 updated.
- Still open: deleting `src/app/pages/settings-page/components/sections/templates-section/` (approved by the user, but the permission classifier blocked `git rm`). Phase E (voice) comes next.
- 2026-10-24: Phase E done, plus the two extras. E1: the intro boxes of Settings → General and Editor and the theme and language descriptions are gone (keys removed in 7 languages). E2: the messages for saving a note, renaming a note, renaming or deleting a file, renaming or deleting a folder, moving a note, and saving an encounter or a map now say what to check ("Check that the Codex folder is available, then try again."); the note save message also says the text is still in the editor (true: a failed save leaves the editor untouched). The other ~50 "Couldn't X" messages are unchanged on purpose: for most of them the cause is not known, and a made-up cause would be worse than none. E3: the status field has a short placeholder ("Add a status…") and a persistent hint under it explaining rounds ("stunned 3" wears off after 3 of its turns; without a number it stays). Extras: the Assets empty state has an *Import from disk* button; *New…* is now *New* in every language. Checked in the browser (Italian, light): Assets empty state and the status hint. Not checked: the error messages in context (they only show on a real failure).
- Left over: other labels that end with "…" (Move to…, Rename…, Delete…, Create note…) follow the macOS convention for actions that open a dialog; only *New…* was changed, as asked.
- 2026-10-24: Adjustments X1–X6 done. X1 badge moved inside the button. X2 tracker select removed from the encounter page. X3 button is *New note*. X4 Import from disk is a modal (drop, paste, select), opened from the section toolbar, the empty-state button and the sidebar + on Assets; a paste anywhere on an Assets page saves the media. X5 type input removed. X6 `openWizard` makes the picker and the forms one modal with Back. Build green. Not checked visually: X1 badge, the Assets modal and paste.
- 2026-10-24: Phase F in progress. F1: the glyph rule now allows the ornamental symbols (◇ ✣ ◇) used sparingly and with a job, and bans fake codes, mottos, grids and runes with real-world meaning (DESIGN_PRINCIPLES §9, CLAUDE.md). F2: the three card dividers on the Welcome panel are removed (corner brackets, title rule and step marker stay); checked in the browser, light, Italian. F4: roadmap row 16.1 added. F3 (re-check every changed screen) is still open.
- 2026-10-24: Setup follow-up: the three card dividers of the Codex step are removed too; the setup panel (`SetupLayout`) eases between heights (200 ms, skipped with reduced motion) when its step grows, e.g. after the folder check. Checked in the browser (light, Italian): the dividers are gone, and adding 120 px of content made the panel animate 428 → 568 px.
