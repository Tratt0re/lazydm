# NORDIC RELIC — Visual Identity & UI Design System
**Version:** 0.3.3 · **Status:** Approved component showcase and modal language · **Theme:** Dark and Light

## 1. Identity
**Name:** Nordic Relic  
**Tagline:** Forged in iron. Written in ash.  
**Design thesis:** Cold Nordic dark fantasy translated into the visual grammar of a functional industrial interface. The experience evokes engraved artifacts, weathered steel, stone inscriptions and tactical command panels without depending on generic medieval embellishment.

### Three defining choices
1. **Industrial typography:** condensed, commanding display faces; legible contemporary sans-serif for common UI; monospace for numeric registers and metadata.
2. **Moderate decoration:** geometric Nordic-inspired linework, corner marks, serials and carefully placed sigils. Decoration must communicate section or identity, not obstruct content.
3. **Comfortable density:** controlled information richness with substantial hit targets, deliberate spacing and layered hierarchy.

### Personality
Disciplined; austere; atmospheric; legible; mechanical; grounded. Not whimsical, glossy, neon-cyberpunk, skeuomorphic medieval, or ornament-first.

## 2. Color system
All values below are foundations for implementation, not a completed contrast audit. Use semantic design tokens rather than component-specific hardcoded colors.

| Token | Dark | Light | Role |
|---|---|---|---|
| canvas | `#101114` | `#DFE0DE` | App background |
| recessed | `#15171A` | `#D7D8D6` | Inset tracks and wells |
| surface | `#1A1C1F` | `#F1F0EB` | Regular panels |
| elevated | `#23262A` | `#F8F7F2` | Raised panels |
| hover | `#30343A` | `#E2E4E2` | Hovered surfaces |
| border-subtle | `#34383D` | `#B9BEBC` | Quiet separator |
| border | `#4F555B` | `#92979B` | Control boundaries |
| border-strong | `#71777A` | `#676E71` | Featured panel boundary |
| text-strong | `#F0ECE3` | `#202428` | Headlines, large numeric values |
| text | `#D6D1C6` | `#30363A` | Standard copy |
| text-secondary | `#B6B2A9` | `#4C5356` | Supporting copy |
| text-muted | `#9C988F` | `#62696B` | Metadata |
| bronze | `#B9A27A` | `#766043` | Primary interactive accent |
| bronze-highlight | `#D0BD98` | `#8B724E` | Focus and highlights |
| bronze-pressed | `#8F7B58` | `#59482F` | Pressed accent |
| danger / health | `#A85046` | `#93473D` | Health and destructive actions |
| success / stamina | `#819574` | `#4E7355` | Positive status, stamina |
| mana | `#7799B4` | `#426C89` | Mana, temporary HP |
| arcane | `#9B88B6` | `#71598C` | Magic and concentration |
| warning | `#C2A063` | `#886724` | Alerts, quest markers |
| info / frost | `#6F8991` | `#426875` | Informational accent |

### Color hierarchy
- 75–85% neutral surfaces and text; 10–20% border/secondary; 5% or less bronze accent in normal dashboards.
- Bronze is active/selected, not default decoration on every edge.
- Red is reserved for health, damage and destructive meaning. Green for positive state; blue for mana/temporary health; violet for spell/magic.
- Semantic states use words/icons with color, never color alone.

## 3. Typography
**Display:** Barlow Condensed, fallback `Arial Narrow`, sans-serif. Weight 700–800. Use for section heads, character names, and strategic numbers.  
**Interface:** IBM Plex Sans, fallback system sans-serif. Weight 400–600. Use for labels, buttons and long text.  
**Technical:** IBM Plex Mono, fallback monospace. Weight 400–600. Use for serials, statuses, resource counters and tiny category labels.

Suggested hierarchy:
| Name | Size / line-height | Use |
|---|---|---|
| Display XL | 48–64 / 0.95–1.02 | Hero heading |
| Display L | 32–40 / 1.0 | Main section |
| Heading M | 22–28 / 1.1 | Cards |
| Body | 14–16 / 1.5 | Normal information |
| UI | 13–14 / 1.3 | Actions and fields |
| Technical | 10–11 / 1.4 | Metadata only, not primary content |

All-caps and expanded tracking belong to short interface labels, not paragraph copy. Provide comfortable readable text sizes on mobile.

## 4. Spacing and layout
- Base spacing increment: **4px**. Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Comfortable card padding: 20–24px desktop, 16px mobile.
- Panel gaps: 12–20px. Major dashboard sections: 24–32px.
- Action hit targets: aim for 44px minimum in touch contexts.
- Content width: approximately 1440px for dashboard workspaces, with adaptable layout; sidebar 216–248px.
- Mobile layouts: collapse side navigation, stack resource blocks, preserve priorities, avoid horizontal scrolling for basic actions.

## 5. Geometry and material
- Corners: strictly square (`0px`) across panels, buttons, inputs, selects, dialogs, badges and navigation. Do not round controls.
- Panel borders: 1px steel, optional 2px for priority or active states. Avoid frequent drop shadows.
- Inset treatments and surface layering suggest iron plates and recessed control wells.
- Use engraved diamond dividers, registration marks and Nordic-inspired geometric patterns. Barcode graphics and horizontal barcode-like stripes are prohibited.
- Decorative linework should occupy margins, headers or empty gutters; never cover content.
- Stone/metal grain is optional and must be faint and absent behind dense text.

## 6. Motion and interaction
- Hover / press transitions: 120–180ms, restrained opacity/background/border changes.
- Modal entrance: subtle fade and slight translation; no theatrical fantasy animation.
- Visible focus indicator: 2px high-contrast bronze-highlight ring, with offset, keyboard accessible.
- Selected elements need explicit shape/border/text treatment beyond color alone.
- Support reduced motion (`prefers-reduced-motion`).

## 7. Component principles
### Foundation components (framework-agnostic intent)
`nr-button`, `nr-icon-button`, `nr-panel`, `nr-badge`, `nr-input`, `nr-select`, `nr-dialog`, `nr-tabs`, `nr-progress`, `nr-divider`, `nr-stat`, `nr-table`, `nr-tooltip`.

### RPG extension components
`nr-character-card`, `nr-health-bar`, `nr-resource-meter`, `nr-initiative-order`, `nr-condition-chip`, `nr-attribute-tile`, `nr-encounter-log`.

#### Examples
**Button:** primary = filled bronze, dark label; secondary = outlined steel, normal label; tertiary = quiet plain text; destructive = restrained crimson outline/fill as appropriate. Disabled variants must not look selected.

**Panel:** optional serial eyebrow, title, right-aligned command/status, single strong divider. Keep one dominant ornamental feature maximum.

**Badge:** concise status text, optional point icon; contrast and semantics retained without relying on color.

**Resource:** labeled value plus solid rectilinear bar; include numeric status; blue temporary HP shown distinctly and legibly; rules handled by app logic.

**Form:** persistent field labels; keyboard/focus/validation states; labels never replaced by placeholders alone.

**Dialog:** compact framed command window, descriptive heading, primary action placed consistently, Escape-to-close where appropriate.

## 8. Information architecture for the showcase
Visual identity dashboard presents brand signature, theme switcher, color foundations, typographic specimen, live character card, resource visualization, controls and form fields, encounter feed, Nordic ornament samples, and token legend.

## 9. Accessibility and quality gates
- Audit text and UI contrast against WCAG 2.2 AA: 4.5:1 normal text, 3:1 large text and non-text visual boundaries where applicable.
- Use keyboard operable interactions, labeled controls, visible focus, semantic headings, logical tab order.
- Honor `prefers-reduced-motion` and system contrast preferences where feasible.
- Test at 320px mobile viewport, tablet, desktop, and 200% text zoom.
- Check both themes for color meaning, truncation and legibility.
- This v0.2 proposal is not certified accessibility compliant; contrast and interaction testing remain implementation tasks.

## 10. Earlier scope note (superseded in v0.3)
The v0.2 proposal reserved modal geometry and ornamentation; v0.3 now implements square frames and engraved dividers.

## 11. Explicitly deferred future refinement
**Still deferred after v0.3:** bespoke component silhouettes, a dedicated rune/icon family, typographic fine tuning, deeper material textures and advanced motion grammar. These are candidates for **v0.4**, not assumed finished here.

## 11. Handoff / implementation
Treat `tokens.css` as the color source of truth and `index.html` as an executable identity showcase, not a production-ready component framework. A later Angular library can implement these foundations with component inputs, outputs, testing, accessibility primitives and storybook-like previews.


## 12. v0.3 design decisions — approved
The user approved all eight families: **Buttons & Actions**, **Form Controls**, **Navigation**, **Panels & Overlays**, **Feedback & Status**, **Data Display**, **Resource Tracking**, and **Combat & Character Components**. The approved modal variations are **Edit Record**, **Confirmation**, **Manage Resources**, and **Detail View**. They are demonstrated in `index.html` as identity specimens; production framework implementations remain future work.

### Geometry (mandatory)
- All controls and containers use **0px border radius**, including dropdowns, checkboxes where practical, popovers, banners, dialog frames, tabs and stat tiles.
- Steel outlines are generally 1px, with 2px frames for featured dialogs and destructive confirmations.
- No barcode decoration of any kind. Earlier techno-industrial barcode motifs are obsolete and intentionally removed.
- One prominent **engraved Nordic diamond divider** is permitted in featured headers. Use lightweight CSS/SVG geometry rather than ornamental icon libraries.

### Typography and headers
- **No leading icon in modal headings.** Use a technical eyebrow (NR / ARCHIVE / DIALOG), followed by a large uppercase condensed heading.
- Use the engraved divider itself as the separation between header and body. Do not add an extra border or contrasting header strip.
- Close actions are utility controls at the upper-right, not a title ornament.

### Dialog shell
- Backdrop: near-black with approximately 80–82% opacity; preserve focus visibility.
- Width: 360px small, approximately 520px medium, and up to 720px large; responsive maximum width is viewport minus 32px.
- Internal spacing: 20–24px comfortable on desktop, 16–18px mobile.
- Header: same surface color as the body and footer, technical identifier, display title, engraved diamond rule. Do not create a separate header color band.
- Footer: same surface color as the rest of the dialog; actions aligned right, Cancel followed by emphasized primary/destructive action. A thin steel separator may be used above the footer, but the overall modal remains one continuous surface.
- Form dialog: persistent labels, squared inputs and selects; validate before applying in production.
- Confirmation: crimson 2px outer frame and a clearly stated irreversible outcome; no purely decorative icon.
- Resource: numeric current/max and temporary HP, semantic red/blue bar, amount input, damage/heal/replace-temp selection. Temporary HP absorbs damage first in demo.
- Detail: read-only structured stat tiles and a single Close button.
- Keyboard: focus trapped inside the dialog, Escape closes, focus returns to trigger, backdrop click closes only for non-critical flows as appropriate. Use Angular CDK Dialog/Overlay for production.

### Component inventory and purpose
| Family | Examples | Purpose |
|---|---|---|
| Buttons & actions | primary, secondary, tertiary, destructive, disabled | affordance / priority |
| Form controls | labeled input, select, checkbox, radio, numeric | data entry |
| Navigation | tabs, sidebar item, breadcrumbs | location and selection |
| Panels & overlays | section panel, disclosure, dialog | information grouping |
| Feedback & status | status chip, alert, inline feedback | response and state |
| Data display | striped/selected row, searchable table, stat tile | dense readable data |
| Resource tracking | HP bar, temp HP, stamina, mana, arcane meter | RPG extension |
| Combat & characters | character dossier, attribute tiles, initiative order | RPG extension |

### Interaction boundaries
- The showcase is **not** a reusable Angular component library and contains illustrative data. It demonstrates theme switching, HP updates, tab and panel selection, table filtering, modal opening, submission feedback and keyboard handling.
- Real application persistence, validation, full D&D rules and framework packaging are intentionally outside this release.

## 13. Roadmap reserved for a separate refinement
Do not silently introduce a complete bespoke rune/icon set, custom clipped silhouettes, textured material engine, advanced motion grammar or typographic redesign. These are candidate v0.4 explorations, after reviewing the v0.3 showcase.


## 13. v0.3.2 — Extended controls and navigation
Nine new interactive patterns are now part of the showcase. They retain square corners, steel outlines, cold mineral surfaces, bronze selection/focus, and restrained Nordic engraving. No barcode motifs.

| Component | Interaction contract | Accessibility / implementation notes |
|---|---|---|
| Segmented control | Select exactly one view or mode | Group labeled; exposed pressed state; 44px minimum targets |
| Page tabs | Switch active page subsection | Tablist with selected state, roving focus and arrow/Home/End navigation |
| Multiselect dropdown | Toggle multiple options, summarize selected labels | Trigger expanded state, visible checkbox choices; production Angular version should implement full listbox keyboard behavior and focus handling |
| Tooltip | Explain a control on hover and keyboard focus | Tooltip relationship via `aria-describedby`; does not contain interactive actions |
| Alert | Inline warning/error, change severity | Meaningful text and severity; do not rely on color alone |
| Notification banner | Announce transient system event; dismiss/reopen | Status region; explicit close control, nonblocking |
| Radio group | Choose a single mutually exclusive option | Native fieldset/legend and radio inputs |
| Contextual search | Filter records and choose an item | Combobox with suggestions, arrow/Enter/Escape navigation; production should additionally handle async loading, IME and full ARIA combobox test matrix |
| Sidebar tabs and cascading bars | Switch pages; expand/collapse nested branches | Active page indication, `aria-expanded` on branch; use semantic navigation and preserve nesting |

**Showcase scope:** controls demonstrate the desired appearance and core behavior, not a fully tested, publishable Angular library. Reuse Angular CDK primitives when implementing production overlays, keyboard management and accessibility.

## v0.3.3 packaging correction
The release archive must include `tokens.css` alongside `index.html`; the stylesheet defines all theme tokens required to render both the original showcase and extended components.
