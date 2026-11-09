# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain static HTML, CSS and JS: no framework, no npm dependencies, no build step. Hosted on GitHub Pages. English only
at first; strings stay separate from the layout so more languages can be added later. (User decision, 2026-11-09.)

## Users

Dungeon Masters (tabletop RPG game masters). They prepare campaigns away from the table and run sessions at it. The
site's visitor is a DM deciding whether to try LazyDM; many already keep notes in Obsidian or plain files.

## Product Purpose

LazyDM is a desktop app (Electron, macOS / Windows / Linux) built by a Dungeon Master for other DMs and lazy by
design: it saves the DM effort both when preparing and while running the session. The site exists to explain the app
and get a DM to follow it and, once releases exist, download it.

## Positioning

One app for preparing the campaign and running it at the table. The campaign is plain Markdown in a folder the user
owns (the *Codex*), stays Obsidian-compatible and is never locked into a database; the same app also holds the encounter
tracker, maps and links used during play. (Confirmed by the user, 2026-11-09.)

## Operating Context

Prep happens at a desk, the session at a table, often with the laptop beside books and dice. Campaigns may live in
iCloud, Dropbox, OneDrive, Box or Google Drive; LazyDM waits for placeholder files to download and handles sync
conflict copies, but the cloud app does the syncing. SQLite is only a local, rebuildable index.

## Capabilities and Constraints

Confirmed features (from README / DESIGN_PRINCIPLES): campaigns with per-campaign sections; a Markdown editor with
Live preview, Source and Reading; `[[wikilinks]]`, a Links panel, rename with link refactoring, Review (broken links);
templates; Compendium (shared systems copied to and from campaigns); assets (images, audio, PDF); encounter manager
(combatants, initiative, health bar with temporary HP, statuses with rounds, cemetery, party roster, Tracker layouts,
battle bar); interactive maps with pins linked to notes; tabs and split screen; dark and light themes; seven app
languages; an opt-in local MCP server for AI assistants on the same computer.

Terminology (DESIGN_PRINCIPLES §1b): say *Codex* (not vault), *Combatant*, *Tracker layout*, *Links*, *Review*,
*Info box*. *OpenAI Codex* is always written in full, never "Codex" alone. The app is heading to 1.0; it is not
released yet.

Price and licence (user, 2026-11-09): the app is basically free to use, and the user wants a public project whose
licence allows personal use but not commercialisation, because paid features may come later. Consequences for copy:
- "Free to use" is the user's intent, but not "free forever": paid features may be added later, so no "always free"
  or "free without limits" promise.
- A licence that forbids commercial use is **source-available**, not "open source" in the OSI sense. Do not write
  "open source" unless the user chooses an OSI licence. The licence itself is not chosen yet; `package.json` / README
  still say "Private project. All rights reserved". Choosing the licence is a separate task on the `main` branch.
- No licence name appears on the site until the licence file exists in the repository.

Other undecided facts, so the copy must not claim them:
- **Repository.** `package.json` `repository.url` is a placeholder. The real repo is
  `https://github.com/Tratt0re/lazydm`; whether it is public is unconfirmed.
- **Downloads.** No public releases exist. The primary call to action is "Coming soon" next to a GitHub link.
- **Hosting.** GitHub Pages (user decision). Asset paths must work from a sub-path (`/lazydm/`) or a custom domain.

## Brand Commitments

Name: **LazyDM** (written `LazyDM.` as a page title, with the primary-coloured dot). Mascot: Franco
(`src/assets/icon/Franco.svg` in the app repo). Voice: addresses a DM, stresses less work, few steps and quick access
at the table; no generic note-app wording. The site reuses the app's theme tokens and bundled fonts (Barlow Condensed,
IBM Plex Sans, IBM Plex Mono) and offers dark and light themes with a switch. The user asked for a landing page
similar in structure to obsidian.md.

## Evidence on Hand

- The app itself, README and DESIGN_PRINCIPLES.md in the `main` branch of the app repository.
- Real app screenshots: **to be supplied by the user**, in dark and light. None exist on this branch yet; do not
  fabricate screenshots, or imply the page shows the real app where it shows placeholders.
- Absent, and not to be invented: testimonials, user counts, customer logos, ratings, benchmarks, press, pricing
  figures, download counts, release dates.

## Product Principles

1. Your files, your folder: content is plain Markdown the DM owns; the app never holds it hostage.
2. Lazy by design: fewer steps, sensible defaults and one-click paths, both at the desk and at the table.
3. Made by a DM for DMs: speak the table's language, never generic productivity talk.
4. Honest about limits: sync is done by the cloud provider, the MCP server is opt-in, the app is pre-1.0.
5. Say only what is true today: no claims about licence, price or availability that are not settled.

## Accessibility & Inclusion

No product-specific standard was stated. Both themes must be readable, and the theme switch must work without a
pointer and respect the visitor's system preference and reduced-motion setting.
