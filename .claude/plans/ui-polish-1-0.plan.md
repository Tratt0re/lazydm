# Plan: UI polish for 1.0 (impeccable critique)

Started 2026-10-26. Source: impeccable critique of the welcome, campaigns, overview, *New note* modal, Customize, Settings and
a note in dark. Not yet seen: encounters/tracker, maps, Tracker layouts editor, Compendium sheet, Review, Links panel (Phase 0).
One commit per phase. Update the status table and the log at the end of every phase.

Rules for every phase: read DESIGN_PRINCIPLES.md first; a phase that breaks a rule edits the rule first and gets agreement
(Phase 1 and 2); glossary §1b; ArcTechUI semantic tokens, both themes checked; i18n keys in all 7 languages (same line
count); no prettier reformat of existing files; local git only; build check `npx ng build --configuration development`;
ask before any new utility or dependency.

## Status

Scope revised 2026-10-26 after the user's answers: the look of the app stays. No change to fonts, the dot, the watermark or
the editor controls. Dropped: old Phases 1 (dot), 4 (editor controls) and the mono-to-sans change in 2.

| Phase | Scope | Command | Risk | Status | Commit |
| --- | --- | --- | --- | --- | --- |
| A | Split screen bugs: Back to campaigns, Settings sidebar | none | low | code done, not checked live | |
| 0 | Review the screens not yet seen, richer fixture, **and the split screen** | `/impeccable:critique` | none | mostly done (see Phase 0 findings) | |
| 2 | Campaign sidebar: collapse empty sections, counts (fonts stay) | `/impeccable:normalize` | low | pending | |
| 3 | Creation flow: *New...*, fewer steps | `/impeccable:clarify` | medium | pending | |
| 5 | Light theme and control states, **reversible** | `/impeccable:audit` then `/impeccable:colorize` | medium | pending | |
| 6 | Copy and small fixes (watermark stays) | `/impeccable:clarify` | low | pending | |
| 8 | Setting: open the last opened campaign at start | none | low | pending | |
| 7 | Final pass, both themes, 7 languages, narrow window | `/impeccable:polish` | none | pending | |

## Phase A. Split screen bugs

Cause: `urlKeepingSplit` (my fix from last session) added the second pane to every URL naming only the first pane. It
did so for `/campaigns` (Back to campaigns) and it dropped the other outlets of the URL, so `(overlay:settings/editor)`
was lost and a Settings sidebar entry could not be selected.

- [x] A1 `urlKeepingSplit` leaves URLs outside the open campaign alone, and keeps other outlets (`overlay`) beside `split`
- [x] A2 Specs: URL outside the campaign, URL with the settings outlet (47 tests pass)
- [ ] A3 Check live with the split open: Back to campaigns, each Settings entry, Compendium sheet, a Settings link from a note.
      The router cannot be driven from the console; click through it in `npm start` with the mock and two panes
- [ ] A4 Commit

## Phase 5 (revised): reversible colour changes

- [ ] 5.0 Do the colour work on its own branch `polish/light-theme`, and keep it as one commit per change, so `git revert` or
      deleting the branch undoes it. Merge only after the user has seen it in the app
- [ ] 5.0b All changes are token edits in `src/styles.css` (light block only) plus the switch and disabled-button variants, so
      the dark theme is untouched and the old values are kept in the commit message
- [ ] 5.0c Ask the user before merging; do not merge on a build pass alone

## Phase 8. Open the last campaign at start

Settings → General gets a switch: *Open the last campaign at start*. Off by default, device-local (§3: preferences like theme
and language are per device and never stored in the Codex).

- [x] 8.1 Answered by the user (2026-10-26): the last campaign opened, restored through `getEntryUrl` with its tabs and split;
      a deleted campaign (or another Codex) falls back to the list; it applies **at launch only**, never when the window reopens
- [ ] 8.2 `LocalPreferencesService`: a boolean and the last campaign slug. **Ask before adding the preference key** (new
      key with no similar counterpart? check the existing keys first; it is likely the same pattern as other settings)
- [ ] 8.3 Start-up redirect where `/` goes to `/campaigns` today (route or guard in `app.routes.ts`); only on the first
      navigation of a launch, so *Back to campaigns* still reaches the list
- [ ] 8.4 Settings → General switch with its description, 7 languages; update DESIGN_PRINCIPLES §3 and §8
- Validate: build; deleted campaign falls back; Back to campaigns still shows the list; split screen restored with the campaign

## Phase 0. Review what the critique did not see

The mock in `.claude/plans/mock-electron.js` returns `campaigns.list` as a bare array (the service expects `{ rows }`) and uses
a section type (`npc`) the app has no label for, so it shows raw keys. Both are mock bugs, not app bugs.

- [ ] 0.1 Fix the mock: `campaigns.list` returns `{ rows }`; use real section types (`character`, `enemy`, `scene`…)
- [ ] 0.2 Add fixtures: an encounter `.json` with 4 combatants (one dead, statuses, a linked note), a map `.json` with pins and a path,
      a note with a broken link, a campaign root note (for Review)
- [ ] 0.3 Critique, light and dark, at 1360 px and at ~900 px: encounter page and battle bar, cemetery, map page and tool palette,
      Tracker layouts sheet, Compendium sheet, Review page, Links panel, split screen
- [ ] 0.4 Append findings to this file as new phase items; re-order if something outranks Phase 1

## Phase 1. The dot is overused

Today the primary dot is in 24 files: page titles, settings sub-headings, sidebar rows, overview tiles. The critique judged it
no longer marks anything and the Settings page repeats title and description (sidebar row and page heading).

- [ ] 1.1 **Propose the rule change first** (DESIGN_PRINCIPLES §9 "Titles of pages, routes and cards end with a dot", CLAUDE.md
      Conventions): dot on page, sheet and dialog titles only. Not on sidebar rows, overview tiles, in-page sub-headings. Get agreement.
- [ ] 1.2 Remove it from: `secondary-sidebar.component.html:169` (child and group rows; keep the active-row title at line 20),
      `general-section.component.html:43,64,93` and the other sub-headings in `vault-section`, `sections-section`, overview tiles
- [ ] 1.3 Settings: the page heading and description repeat the sidebar entry (`settings-section-header.component.ts`).
      Keep the sidebar entry as a plain label, keep the heading, drop the repeated description from the sidebar row
- [ ] 1.4 Update DESIGN_PRINCIPLES §9 and CLAUDE.md to the new rule; both themes checked
- Validate: build; grep that no sidebar row or sub-heading still carries the span; screenshots of Settings, overview, a note

### Phase 0 findings (2026-10-26)

Seen with `mock-electron-rich.js` (campaign with a map, a running encounter, Review data), light theme, 1360 px:
encounter page, map page, map with a split side, Review, Tracker layouts sheet (empty state).
Not seen: Tracker layouts editor with a layout open, Compendium sheet, Links panel, dark theme of these pages, ~900 px.
The browser actions timed out at the end; finish these in the next step.

- [x] 0.1 Fixture: `.claude/plans/mock-electron-rich.js`. Gaps found while using it were fixture gaps, not app bugs
      (`documents.brokenLinks` was missing; the dev server answers 404 to a path ending in `.json`)
- [x] 0.2 Verified: *Open to the side* on a pin with a linked note opens the second side with that note, no console error
- [ ] 0.3 Finish: Tracker layouts editor, Compendium sheet, Links panel, dark theme, ~900 px, Cemetery, a narrow split

Findings, most important first:

1. **Sidebar repeats "Empty folder" under every section** on every page (already Phase 2). With 5 sections it fills the
   column with five identical lines and pushes the real content down.
2. **Split screen: both panes show the full campaign sidebar and the sidebar eats ~360 px.** At 1360 px each pane gets
   about 400 px, which cuts the map toolbar and the note's code map. The sidebar toggle exists, but the split does not
   offer to collapse it. *Question for the user: collapse the sidebar automatically when the second side opens?*
3. **Split screen: the note in the second pane keeps its view row, code map and properties button at full size** while
   the pane is narrow; the code map takes about a third of the editor width.
4. **Split screen: tab bar controls (back, forward, +) repeat on both sides** and the active tab of the unfocused side
   is drawn grey, which reads as disabled rather than "inactive". The brief asks for a neutral underline, so the
   behaviour is as designed; the grey on the Save button of the unfocused note is the part that looks disabled.
5. **Map**: the tool palette sits on the image with no label; Pin, Path, Note and Select are icons only. The "On this
   map" panel lists the same items as the map, which is useful, but its header is mono and small next to a large title.
6. **Review**: the first group is "Broken links" with a mono count line ("Broken links: 1 · notes: 1") that repeats the
   group title. The delete (trash) button on each row has no label and sits beside *Move to…* with the same weight.
7. **Encounter page**: strong. The battle bar, round counter and turn marker read well. The rows are dense but
   consistent; the heart (manage HP) button and the note icon have no visible label.
8. **Tracker layouts sheet**: when nothing is picked it shows only "Pick a tracker layout on the left, or create one."
   in a very large empty panel; the one built-in layout could be preselected.

## Phase 2. The campaign sidebar reads as an IDE

- [ ] 2.1 **Propose the change first** (§9 "Fonts": mono for "nav items"). Section names and the Overview row go to `font-sans`
      like note names already do; mono stays for counts, the CAMPAIGN label and metadata
- [ ] 2.2 Explorer: sections with no files start collapsed and do not render the "Empty folder" row (`en.json:991`);
      show a file count on the row instead (mono, muted). A section with files keeps its remembered open state
- [ ] 2.3 Keep **+** on hover/focus and ↗ as they are (§8)
- Files: `src/app/components/explorer-tree/explorer-tree.component.html`, `explorer-tree.component.ts`, `layout/sidebar/sidebar.html`
- Validate: build; keyboard expand/collapse still works; empty campaign, one-section campaign, 20-section campaign

## Phase 3. Creation flow

`campaigns.newAnything.button` says *New note* but the picker covers notes, encounters and maps; the modal holds one select, a
*Next* button and a filler line. §8 already calls the button *New…*.

- [ ] 3.1 Rename the button and modal title to *New…* (7 languages). Check the glossary: no new word is needed
- [ ] 3.2 Inside a section page the section is already known: *New note / New encounter / New map* keeps skipping the picker
- [ ] 3.3 In the picker, replace the select with a list of choices (icon + label), one click goes to the form; remove "Any section works as a
      starting point." Keep it one wizard modal with *Back* (`AppDialogFormService.openWizard`, §8)
- [ ] 3.4 Update §8 "Campaign overview" if the wording of the button changes
- Files: `campaign-home-page.ts`, `file-actions.service.ts`, `public/i18n/*.json` (`campaigns.newAnything.*`)
- Validate: build; keyboard (arrows + Enter in the list); overview with 1 and with 12 sections

## Phase 4. Note editor controls

Four controls with no visible label around the editor; a ~60 px band above them; the code map takes ~170 px on a five-line note.

- [ ] 4.1 **Questions for the user before coding:** (a) label the view toggle ("Edit" / "Read") or keep icons; (b) group the code map,
      properties and reference buttons into a "View" menu or keep them in the row?
- [ ] 4.2 Apply the answers; keep §8 rules (three view buttons in a row, *Unsaved changes* at the right end, reference is an *info* icon)
- [ ] 4.3 Remove the dead band above the editor row
- [ ] 4.4 Default `codeMapHideShort` (Settings → Editor, `en.json:250`) to on. This is a default change: existing devices keep their choice
- Files: `document-page`, `components/code-editor`, `components/code-map`, `settings` editor section
- Validate: build; `npm test` (editor specs: image-frame, table-edit); live, source (if enabled) and reading; short and long notes

## Phase 5. Light theme and control states

The light canvas is mid grey with cream cards (`--background: #DFE0DE`, `--card: #F1F0EB`); the dark theme looks designed first. The
Settings switch is hard to read as on or off; a disabled Save looks like a muted fill.

- [ ] 5.1 `/impeccable:audit` on the light theme: contrast of text, borders and the switch track and thumb against `src/styles.css`
- [ ] 5.2 **Questions for the user:** how far to move the canvas; keep the grey and lift the cards, or lighten the canvas
- [ ] 5.3 Switch (`shared/components/switch/switch.variants.ts`): a clear on state (bronze fill plus a mark), not colour alone (§9)
- [ ] 5.4 Disabled buttons: outline and muted text instead of a dimmed fill, for primary and icon buttons (`button.variants.ts`)
- [ ] 5.5 Token changes only in `src/styles.css`; no raw colours in components. Re-check the dark theme did not move
- Validate: build; screenshot every screen from Phase 0 and the ones above in light; WCAG contrast numbers recorded in the log

## Phase 6. Copy and small fixes

- [ ] 6.1 Generic copy: `common.empty` "Nothing here", `compendium.system.emptyTitle`, `maps.panel.empty`, `vault.setup.errors.genericTitle`
      "Something went wrong". Each gets a sentence that names the next step (voice: product-identity)
- [ ] 6.2 Campaign card (`.arc-campaign-card`): decide on the faded book watermark (`--card-icon-size`, `styles.css:531`); the "…" button
      sits on top of it. **Question for the user:** drop it, or replace it with the campaign's `cover` when there is one
- [ ] 6.3 Campaigns page when there is one card: consider a "last opened" line; do not invent content
- [ ] 6.4 Title-bar icons: Compendium and Customize (a wrench) say little. **Question for the user:** keep icons with better ones, or
      show labels in the title bar. Glossary words stay (*Compendium*, *Customize*, *Tracker layouts*)
- [ ] 6.5 Skip link: `root-layout.html:2` is `href="#main-content"`. **Verify** in the packaged build (`npm run build:prod`, load the
      built `index.html`) that it focuses the main area and does not reload. Fix only if it fails
- [ ] 6.6 Settings header tooltip covers the close button after opening Settings (seen once): reproduce, then fix or drop
- [ ] 6.7 CLAUDE.md Gotchas: the line about missing `en.json` keys (`common.skipToContent`, `sidebar.expand`) is stale, both exist. Remove it
- Validate: build; all 7 language files same line count

## Phase 7. Final pass

- [ ] 7.1 `/impeccable:polish` on every changed screen: alignment, spacing, focus rings, hover states
- [ ] 7.2 Both themes, English plus one long language (German) plus one other script (Chinese); window at 1360 px and ~900 px
- [ ] 7.3 Split screen still works with the changed sidebar and editor row
- [ ] 7.4 `npm test` (45 specs expected), `npx ng build --configuration development`, `npm run build:prod`
- [ ] 7.5 Add a roadmap row (17.2 or 18.1) to DESIGN_PRINCIPLES §11; update this status table

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Rule changes (dot, mono nav) contradict the written design | certain | Phases 1 and 2 edit DESIGN_PRINCIPLES first and wait for agreement |
| Theme changes ripple through every screen | medium | Phase 5 last of the big ones; tokens only; screenshot all screens before and after |
| Seven-language drift | medium | Edit all seven files together; check equal line counts and long German strings |
| Phase 0 finds bigger problems in encounters or maps | medium | Reorder: tracker and map screens are the core use at the table |
| Changing a default (code map) surprises existing users | low | New default only; stored choices are kept |
| A claim in the critique was wrong (the skip link) | low | 6.5 verifies before changing anything |

## Acceptance

- [ ] Every phase builds clean (only the 3 known `NG8113` warnings) and is committed on its own
- [ ] Both themes and all 7 languages checked for each changed screen
- [ ] DESIGN_PRINCIPLES.md and CLAUDE.md match what shipped
- [ ] No new dependency, no new utility without asking

## Log

- 2026-10-26: plan written from the critique. No code touched.
- 2026-10-26: scope revised by the user (look stays). Phase A fix written in `workspace.service.ts`, 47 specs pass; not yet checked in the running app, not committed.
