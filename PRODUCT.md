# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dungeon Masters (DMs) of tabletop role-playing games, who prepare a campaign at their desk and run it at the table.
At the table the DM works on a laptop, at arm's length, usually in the app's split view next to a stat-block note.
A typical fight has 4 to 10 combatants; hordes of 10 to 25 happen. The DM is also talking, rolling and improvising,
so every glance at the tracker must be answered in about a second.

## Product Purpose

LazyDM is a desktop app (Electron + Angular) that keeps a campaign as plain Markdown files in a folder the user owns
(the Codex), and runs the session from the same app: initiative, HP, conditions, maps. Success is a DM who spends
less effort preparing and who never loses the thread of a fight.

## Positioning

Made by a DM for DMs, lazy by design: sensible defaults and short paths, notes that stay plain Markdown and
Obsidian-compatible, no account. The tracker reads a combatant's numbers from its stat-block note instead of asking
the DM to retype them.

## Operating Context

- Mode of use: preparation at the desk, then play at the table. The encounter tracker is the session-side surface.
- A combatant row is configured by a **tracker layout** (a 12-column grid, up to 4 rows) with built-in presets for
  Generic, D&D 5e and Pathfinder 2e, and user-made ones. Fields: initiative, number tiles (AC, saves), health bar,
  statuses, side, text, note link; the name and the initiative are in every layout.
- Values come from the combatant's linked note until the combatant has its own; edits go into the encounter, never
  the note.
- Theme (dark and light) and language (en, it, de, es, fr, uk, zh) are per-device settings.

## Capabilities and Constraints

- Angular 21 standalone components with signals, Tailwind 4, the in-house ArcTechUI library (`arc-*` selectors,
  semantic tokens, class-variance-authority variants). Square shapes (`--radius: 0`), bundled fonts (Barlow
  Condensed for titles and big numbers, IBM Plex Sans for UI, IBM Plex Mono for labels).
- Every user-facing string goes through i18n keys in all 7 languages. UI words follow the glossary in
  `docs/design-principles.md` §1b (Codex, Combatant, Tracker layout, Links, Review).
- All fields of a row are editable in place (Enter or leaving saves, Escape cancels, arrows move between rows).
- The tracker's density (Compact, Card, Expanded, plus a *Follow the turn* switch) is a per-device preference like
  the existing *Tracker rows* setting; it is never written into the encounter file.

## Brand Commitments

Names and terms from the glossary; ornament only with a job (engraved geometry, never fake codes, mottos or runes);
page, route and card titles end with a primary-coloured dot; the user's voice is a DM talking to DMs.

## Evidence on Hand

Real tracker layouts and screenshots in `docs/images/tracker-dark.webp` and `tracker-light.webp`; the current row in
`src/app/pages/encounter-page/encounter-page.html`; the built-in layouts in
`electron/models/battle-rule.model.js`. No player-facing (shared screen) mode exists and none is requested.

## Product Principles

1. Lazy by design: defaults and one-click paths before configuration.
2. Run the table first: what a DM needs mid-turn (whose turn, HP, defences, conditions) is visible without a click.
3. The note stays the source of truth; the encounter records this fight.
4. System-neutral: nothing in the battle code names a game; games are data (layouts and templates).
5. Both themes, every language, keyboard-first.

## Accessibility & Inclusion

State is never shown by colour alone (labels, shapes and text for screen readers); focus is a visible 2px ring;
reduced motion is respected; every inline value has an accessible name and says when it differs from its note.
