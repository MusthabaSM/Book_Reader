---
name: Universal Book Reader
description: A fully offline, premium digital library with universal format support.
colors:
  primary-light: "#991B1B"
  primary-dark: "#D97706"
  neutral-bg-light: "#F9F8F6"
  neutral-bg-dark: "#18181B"
  text-heading-light: "#1C1917"
  text-heading-dark: "#F4F4F5"
  text-body-light: "#44403C"
  text-body-dark: "#A1A1AA"
  border-light: "#E5E0D8"
  border-dark: "#27272A"
typography:
  headline:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontWeight: 500
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    lineHeight: "1.45"
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.65rem"
    letterSpacing: "0.05em"
rounded:
  md: "4px"
spacing:
  grid-gap: "3rem 1.5rem"
components:
  button-primary:
    backgroundColor: "var(--text-h)"
    textColor: "var(--bg)"
    rounded: "{rounded.md}"
    padding: "0.4rem 1rem"
---

# Design System: Universal Book Reader

## Overview

**Creative North Star: "The Premium Digital Bookshelf"**

Serene, sophisticated, and focused. It uses typography and spaciousness to create a quiet, literary atmosphere. The design mimics a physical library experience in a digital space, employing a stark but warm aesthetic that foregrounds book covers and reading materials.

**Key Characteristics:**
- High-contrast, typography-led visual hierarchy.
- Seamless Dark/Light mode support tailored to reading environments.
- Generous spacing around book components to emphasize individual works.
- Restrained use of accent colors to guide attention.

## Colors

The palette is rooted in classical reading materials, featuring warm parchments, sharp inks, and sophisticated accents that shift based on the color scheme.

### Primary
- **Oxblood (Light)** (#991B1B): The primary interactive and hover accent in light mode. Used sparingly for interactive states and focus rings.
- **Brass (Dark)** (#D97706): The corresponding primary accent in dark mode, providing a warm, legible glow against the charcoal background.

### Neutral
- **Parchment (Light BG)** (#F9F8F6): A warm, off-white background that reduces eye strain compared to pure white.
- **Charcoal (Dark BG)** (#18181B): A deep, muted dark background for low-light reading.
- **Ink (Light Text)** (#1C1917): Near-black text for primary headings and strong contrast elements.
- **Off-White (Dark Text)** (#F4F4F5): High-contrast text for dark mode headings.

### Named Rules
**The Editorial Accent Rule.** The primary accent (Oxblood or Brass) is strictly reserved for interactive states (hover, focus) and critical highlights. It must never be used for structural backgrounds or large surfaces.

## Typography

**Display Font:** Georgia, 'Times New Roman', serif
**Body Font:** system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
**Mono Font:** ui-monospace, Consolas, monospace

**Character:** A classic serif for headings lends literary authority, while a clean, modern sans-serif ensures ultimate legibility for interface elements and reading progress.

### Hierarchy
- **Headline** (500, up to 56px, -1.68px spacing): Used for top-level page titles and the library hero section.
- **Title** (500, 1rem, 1.25 line-height): Used for book titles in the library grid. Truncated at 2 lines.
- **Body** (400, 15px, 145% line-height): Used for general interface copy and descriptions.
- **Label / Meta** (400, 0.65rem, 0.05em spacing, uppercase): Used for book metadata (format, progress) and control labels. 

### Named Rules
**The Serif Authority Rule.** Serif fonts are exclusively used for titles and headings to evoke a printed book. All metadata, buttons, and UI controls must use the sans-serif font.

## Layout

The library employs a responsive CSS grid for the bookshelf, maximizing screen real estate while keeping book covers large and legible.

- **Grid:** `repeat(auto-fill, minmax(170px, 1fr))` with generous vertical breathing room (`3rem`) and tighter horizontal gaps (`1.5rem`).
- **Container:** Maximum width of 1600px with 2rem horizontal padding.
- **Responsive:** Fluid font sizing and layout adjustments below 1024px.

## Elevation & Depth

The system uses a hybrid approach: structural containers are flat by default, while interactive elements (like book covers) employ subtle shadows that intensify on hover to suggest tactility.

### Shadow Vocabulary
- **Card Rest** (`rgba(0, 0, 0, 0.08) 0 8px 16px -4px`): A subtle ambient shadow giving physical presence to book covers.
- **Card Hover** (`rgba(0, 0, 0, 0.15) 0 16px 24px -4px`): A sharper, lifted shadow when a book is hovered, accompanied by a slight `-4px` vertical translation.

### Named Rules
**The Tactile Book Rule.** Only book covers and primary modal dialogs receive elevation shadows. UI controls, buttons, and structural headers remain strictly flat.

## Shapes

Forms are generally sharp and rectangular, with very subtle rounding (`4px`) on buttons and minor UI elements to soften the interface without losing the editorial structure.

## Components

### Buttons
- **Shape:** 4px border radius.
- **Primary:** Inverts the theme colors (e.g., Ink background with Parchment text in light mode).
- **Ghost:** Transparent background with subtle opacity shifts on hover. Used for secondary actions (Edit, Remove) to reduce visual clutter.

### Book Cards
- **Corner Style:** Asymmetric rounding on the cover placeholder (`2px 4px 4px 2px`) to mimic a book spine.
- **Background:** Transparent for the card itself; the cover image carries the visual weight.
- **Shadow Strategy:** Elevated at rest, lifted on hover.
- **Internal Padding:** None on the card container; metadata sits below the cover image.
- **Behavior:** The card is a self-contained unit. Very long titles truncate at 2 lines (`-webkit-line-clamp: 2`).

### Metadata Edit Modal
- **Style:** A fixed, centered modal overlay with a blurred backdrop.
- **Behavior:** Sits entirely outside the grid flow to prevent layout shifts when editing book details.

## Do's and Don'ts

### Do:
- **Do** rely on generous whitespace and typography for visual hierarchy rather than dividing lines or background boxes.
- **Do** ensure every book card remains fully self-contained without text bleeding into neighboring columns.
- **Do** test all color assignments in both light and dark modes via CSS variables.

### Don't:
- **Don't** introduce new colors beyond the established Parchment/Ink/Oxblood (and their dark mode equivalents) palette.
- **Don't** use `position: absolute` for elements that replace grid items (e.g., forms), as it breaks the responsive grid flow.
- **Don't** use serif fonts for interactive UI controls.
