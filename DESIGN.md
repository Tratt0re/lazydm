---
name: LazyDM
description: A campaign note brought to life in the app's bronze-on-mineral visual system.
colors:
  bronze-dark: "#b9a27a"
  bronze-light: "#6d5a3e"
  mineral-canvas: "#101114"
  mineral-card: "#1a1c1f"
  parchment-text: "#f0ece3"
  paper-canvas: "#e9eae7"
  paper-card: "#faf9f6"
  ink-text: "#202428"
  steel-dark: "#71777a"
  steel-light: "#676e71"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3.5rem, 15vw, 6rem)"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.75rem, 9vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
rounded:
  square: "0"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "32px"
components:
  button-primary:
    backgroundColor: "{colors.bronze-dark}"
    textColor: "{colors.mineral-canvas}"
    rounded: "{rounded.square}"
    padding: "0 24px"
    height: "44px"
  card-dark:
    backgroundColor: "{colors.mineral-card}"
    textColor: "{colors.parchment-text}"
    rounded: "{rounded.square}"
    padding: "24px"
---

# Design System: LazyDM

## Overview

**Creative North Star: "The Living Campaign Note"**

The website inherits the desktop app's ArcTechUI world and presents the entire landing page as one campaign note in Live preview. It feels practical, authored and quietly arcane: mineral surfaces, steel rules, a single bronze accent, and interface details that belong at a DM's desk rather than on a generic SaaS page.

The system is dense enough to feel like a working tool but keeps a readable central column. Decoration comes from the product's own language: Markdown-like structure, Properties, Info boxes, path labels, corner brackets, ornamental rules and the code map.

**Key Characteristics:**
- Square, bordered surfaces with no soft-card styling.
- One restrained bronze accent across both light and dark themes.
- Condensed display headings, plain body copy and monospace interface labels.
- App-derived details used as structure, never as costume.

## Colors

The palette pairs warm bronze with cool mineral and paper neutrals. Dark and light modes are equal first-class expressions of the same system.

### Primary
- **Dark-mode bronze:** the primary action, title dot, focus and ornamental accent on mineral surfaces.
- **Light-mode umber bronze:** a darker counterpart that preserves contrast on paper surfaces.

### Neutral
- **Mineral canvas and card:** near-black cool surfaces for the dark theme.
- **Paper canvas and card:** warm off-whites for the light theme.
- **Steel borders:** restrained rules that describe structure without creating soft elevation.
- **Parchment and ink:** high-contrast text colors tuned to their respective themes.

**The One-Bronze Rule.** Bronze is the sole decorative accent. Status colors carry meaning and never compete with it.

## Typography

**Display Font:** Barlow Condensed  
**Body Font:** IBM Plex Sans  
**Label/Mono Font:** IBM Plex Mono

**Character:** Condensed headings feel like chapter titles and app panels. The body stays calm and readable, while monospace is reserved for paths, properties, statuses and controls.

### Hierarchy
- **Display** (700, up to 6rem, 0.9): product name only.
- **Headline** (700, up to 3.75rem, 1): page-section claims ending in a bronze dot.
- **Title** (700, 1.75rem, 1.1): compact subsection labels.
- **Body** (400, 1.0625rem, 1.65): readable prose kept near a 38rem measure.
- **Label** (500, 0.8125rem): compact interface metadata and navigation.

**The Three-Voices Rule.** Barlow speaks for the campaign, IBM Plex Sans explains it, and IBM Plex Mono labels the interface.

## Layout

The page is one centered note with a 40rem text column and 16px minimum gutters. Product demonstrations can break out to a 64rem wide stage. At 1180px, a fixed code map occupies the right edge; on smaller screens it disappears without changing the reading order. Alternating screenshot rows collapse into a single vertical flow below 900px.

Spacing follows an 8px base rhythm. Sections breathe generously, while controls and metadata remain compact like the app.

## Elevation & Depth

The system is flat by default. Depth comes from tonal layers and steel borders; a single overlay shadow is reserved for the theme popover, where actual floating elevation is required.

**The Structural Depth Rule.** Use a border or a tonal change for in-page surfaces. Reserve a shadow for UI that truly floats above the document.

## Shapes

All corners are square. One-pixel borders establish ordinary structure; two-pixel strong borders and short bronze corner brackets frame product screenshots and special app-derived panels. Diamonds and engraved rules separate chapters of the note.

## Components

### Buttons
- **Shape:** square with a 1px border and 44px large height.
- **Primary:** solid bronze with high-contrast foreground and uppercase compact type.
- **Hover / Focus:** a tonal bronze shift; focus uses a 2px theme-colored outline.
- **Ghost:** transparent until hover, then takes the theme accent surface.

### Cards / Containers
- **Corner Style:** strictly square.
- **Background:** card or recessed theme tokens.
- **Shadow Strategy:** none in the document flow.
- **Border:** subtle steel for ordinary containers; strong steel for screenshot frames.
- **Internal Padding:** generally 16–32px according to visual weight.

### Navigation

The sticky top bar behaves like the app header: a breadcrumb and path at left, compact monospace links at right, and a bordered theme control. On phones, the main links become a horizontally scrollable jump row.

### Campaign-note details

Properties, Info boxes, check lists, ornamental rules, screenshot path bars and the code map reuse the desktop app's visual language. They should explain structure or provenance, not decorate empty space.

## Do's and Don'ts

### Do:
- **Do** preserve equal-quality light and dark themes.
- **Do** use bronze sparingly for actions, focus, headings and meaningful ornaments.
- **Do** keep long-form text inside the readable note column.
- **Do** prefer semantic HTML and visible content that works without JavaScript.

### Don't:
- **Don't** introduce rounded cards, pills, gradients or glass effects.
- **Don't** substitute generic SaaS icon-card grids for the campaign-note structure.
- **Don't** use monospace for ordinary prose.
- **Don't** add visual claims that are not grounded in the product.
