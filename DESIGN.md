# Design System — Harness

**Direction:** Editorial Workbench. A long-form magazine/journal aesthetic applied to live engineering observability. Each cycle is a story being written by six agents; the dashboard is the editor's desk.

## Product Context

- **What this is:** Observability dashboard for a six-agent AI engineering team that autonomously builds software on a target project.
- **Who it's for:** Solo builders and small teams using Claude Code to run autonomous agents on a game/app.
- **Space / industry:** AI agent developer tools. 2026 category trend: "harnesses" — supervision layers for autonomous coding agents.
- **Peers:** Linear, Vercel, LangSmith, Raycast, Anthropic Console, GitHub, Arc.
- **Project type:** Web dashboard (Next.js 15 + Tailwind + shadcn/ui primitives).

## Aesthetic Direction

- **Direction:** Editorial Workbench
- **Decoration level:** Intentional — typographic rules, pull-quotes, kickers, bylines. No gradients, no blobs, no stickers.
- **Mood:** A well-run workshop where each cycle reads like a feature article. Warm paper under warm light. Considered. Calm. A little literary. Not toy-like, not brutalist, not SaaS-generic.
- **Reference sites:** [Linear 2026 refresh](https://linear.app/now/behind-the-latest-design-refresh) (calmer, warmer gray), [LangSmith](https://smith.langchain.com/) (serious editorial typography), The Economist, The New Yorker, Pentagram project pages.

## Typography

Loaded from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

### Roles

| Role | Font | Weights | Rationale |
|---|---|---|---|
| Display (hero, page titles, cycle names, card titles) | **Fraunces** (variable, optical sizing) | 400, 500, 600 | High-contrast variable serif with soft axis. Gives harness literary weight without being stiff. Italic is deliberately used for accent phrases. |
| Body (paragraphs, UI labels, buttons) | **Instrument Sans** | 400, 500, 600 | Clean humanist sans that pairs with Fraunces. Narrow counters, neutral without being generic. |
| Data (IDs, timestamps, file paths, cost, code) | **JetBrains Mono** | 400, 500, 600 | Tabular-nums support is mandatory for cost/duration columns. Already widely used in dev tools. |

### Scale (px)

| Token | Size | Line-height | Use |
|---|---|---|---|
| `text-hero` | 56px / 3.5rem | 1.05 | Landing hero only |
| `text-display-1` | 40-44px | 1.1 | Page titles, lead article titles |
| `text-display-2` | 32px | 1.15 | Section heads, large card titles |
| `text-display-3` | 22px | 1.25 | Subsections |
| `text-body-lg` | 16px | 1.55 | Long-form prose (rare) |
| `text-body` | 14px | 1.55 | Default body + UI |
| `text-sm` | 13px | 1.5 | Dense tables, drawers |
| `text-xs` | 12px | 1.4 | Helper text |
| `text-meta` | 11px | 1.4 | Bylines, kickers (uppercase, tracking-wide) |
| `text-tiny` | 10px | 1.3 | Labels in forms, table headers (uppercase) |

**Tracking rules:**
- Display ≥ 32px: `letter-spacing: -0.02em` (tighten)
- Display 18-32px: `letter-spacing: -0.01em`
- Uppercase meta text: `letter-spacing: 0.08em to 0.12em` (loosen)
- Body: `letter-spacing: 0`

**Italic rule:** Use Fraunces italic deliberately for emphasis in titles (e.g., "Mutations & *Evolution*"). Never set long runs in italic.

## Color

- **Approach:** Restrained. Light mode default (warm paper + deep ink), dark mode derived. One burgundy accent, one forest accent, earthy semantic colors. Zero gradients. Zero neon.

### Light mode (default)

| Token | oklch | Hex (approx) | Use |
|---|---|---|---|
| `--paper` | `oklch(0.97 0.01 80)` | #F7F3EB | Page background |
| `--surface` | `oklch(0.99 0.005 80)` | #FCFAF5 | Cards, inputs |
| `--surface-alt` | `oklch(0.93 0.01 80)` | #EEEADF | Hover states, subtle fills |
| `--ink` | `oklch(0.18 0.02 50)` | #1F1810 | Primary text |
| `--ink-2` | `oklch(0.28 0.02 50)` | #3D342A | Secondary text |
| `--muted` | `oklch(0.45 0.015 60)` | #7A6F63 | Meta text, table headers |
| `--muted-2` | `oklch(0.62 0.01 60)` | #A89D90 | De-emphasized |
| `--rule` | `oklch(0.90 0.008 80)` | #E3DED1 | Subtle dividers |
| `--rule-strong` | `oklch(0.82 0.01 80)` | #C9C1B0 | Card borders, input borders |
| `--burgundy` | `oklch(0.40 0.15 20)` | #8B2E1A | Primary accent — links, active state, primary buttons |
| `--burgundy-2` | `oklch(0.47 0.16 20)` | #A3412B | Primary button hover |
| `--forest` | `oklch(0.40 0.08 150)` | #2E5B3D | Success, completed, merged |
| `--forest-2` | `oklch(0.48 0.09 150)` | #3E7550 | Success hover |
| `--mustard` | `oklch(0.70 0.15 75)` | #B8830C | Warning, proposed |
| `--oxblood` | `oklch(0.50 0.15 30)` | #A63D20 | Destructive, rejected, blocked |
| `--gold` | `oklch(0.72 0.11 85)` | #C89F4A | Reserved — optional secondary (avoid overuse) |

### Dark mode

Invert lightness carefully; keep the warm undertone. Do not simply flip — redesign surfaces to reduce saturation by ~15%.

| Token | oklch | Hex (approx) |
|---|---|---|
| `--paper` | `oklch(0.14 0.01 60)` | #121008 |
| `--surface` | `oklch(0.18 0.01 55)` | #1A1712 |
| `--surface-alt` | `oklch(0.22 0.012 55)` | #241F18 |
| `--ink` | `oklch(0.93 0.01 80)` | #F3EDE0 |
| `--ink-2` | `oklch(0.82 0.008 75)` | #CFC6B4 |
| `--muted` | `oklch(0.58 0.012 65)` | #8D8270 |
| `--rule` | `oklch(0.28 0.008 60)` | #2A2419 |
| `--rule-strong` | `oklch(0.38 0.01 55)` | #3D3425 |
| `--burgundy` | `oklch(0.68 0.16 30)` | #D9674A |
| `--forest` | `oklch(0.72 0.11 150)` | #7FB390 |
| `--mustard` | `oklch(0.78 0.15 80)` | #E5B34B |
| `--oxblood` | `oklch(0.68 0.16 35)` | #D9684B |

### Semantic mapping

- **Link / primary CTA / active state** → burgundy
- **Success / merged / completed** → forest
- **Warning / proposed / pending** → mustard
- **Destructive / rejected / blocked** → oxblood
- **Info / focus ring** → burgundy (re-use, do not invent blue)

## Spacing

- **Base unit:** 4px
- **Density:** Comfortable — between SaaS-spacious and Bloomberg-tight. Text columns breathe; data tables stay tight.
- **Scale:** `2xs(2) xs(4) sm(8) md(12) lg(16) xl(24) 2xl(32) 3xl(48) 4xl(64) 5xl(96)`

## Layout

- **Approach:** Hybrid — editorial for Home and Cycle detail (asymmetric hierarchy, pull-quotes, bylines), grid-disciplined for data-dense pages (Cycles list, Milestones, Inbox, Rooms).
- **Home Bento:** 12-col grid, auto-rows 110-120px. Tiles have deliberate size variance (lead = 6x2, support = 4x2, etc.) like a magazine cover, not uniform squares.
- **Max content width:** 1280px (dashboard pages), 960px (long-form article layouts like Cycle detail).
- **Responsive breakpoints:** match Tailwind defaults (sm 640, md 768, lg 1024, xl 1280).

## Border Radius

- **Inputs / buttons:** 3px — editorial-sharp, not pillowy
- **Cards / tiles:** 4-6px
- **Avatars / agent cards:** 4px
- **Pills / badges:** 9999px (full) — the only round things on screen
- **Modals / sheets:** 6-8px

## Motion

- **Approach:** Intentional — motion only when it carries meaning. No decorative animation.
- **Easing:** enter `ease-out`, exit `ease-in`, move `ease-in-out`
- **Duration:** micro 80ms (hover/focus color), short 160ms (popups, modals), medium 240ms (page transitions, accordion)
- **Pulse:** 2s breath animation on `.pill.dot` elements and `.agent-card.running` elements only. Signals liveness.
- **Never:** fade-in scroll animations, gradient sweeps, particle effects, decorative parallax.

## Editorial elements (distinctive)

These are the touches that make Harness feel editorial rather than generic SaaS:

- **Kickers:** `font-mono 10px uppercase tracking-[0.12em]` labels above titles (`§4 · MOCKUP`, `BY CODER AGENT`, `CYCLE M8-C1`). Use constantly on section heads, card heads, table captions.
- **Bylines:** meta strip between title and body (`BY ORCHESTRATOR · STARTED 42 MIN AGO · $2.40 / $5.00 BUDGET`). Use on Cycle detail header.
- **Pull-quotes:** `border-left: 3px solid burgundy; padding-left: 16px; italic Fraunces`. Use when surfacing a key decision spec or a notable quote from an agent's context feedback.
- **Drop-caps:** `::first-letter` 52px Fraunces burgundy on the first paragraph of Cycle detail articles.
- **Rule lines:** 1px `--rule` dividers between sections. Use liberally — they're the magazine look.
- **Small-caps meta:** labels like `BY`, `IN`, `FROM`, `ON` in bylines use `font-variant: small-caps` or plain uppercase tracking-wide.
- **Footnote markers:** spec references in agent reasoning appear as `<sup>1</sup>` links with burgundy color.

## Component conventions

- **Buttons:** 3px radius, 8px 16px padding, 13px Instrument Sans 500. Four variants: `primary` (burgundy fill), `secondary` (surface with rule border), `ghost` (transparent, hover fills surface-alt), `danger` (oxblood border + text, hover fills).
- **Pills:** 3px 10px, full radius, 10px uppercase tracking-wide, colored border + 6-10% tint fill. Variants match semantic colors (active, success, warning, danger, muted). `.dot` prefix adds animated indicator.
- **Alerts:** No full-background fills. Left-border 3px in semantic color + surface bg. Uppercase kicker (`MERGED`, `PROPOSED`, `PENDING`, `BLOCKED`) + body text.
- **Inputs:** 3px radius, 1px rule-strong border, burgundy focus border (no ring halo). Uppercase tracking-wide label above.
- **Cards:** `surface` bg, 4-6px radius, 1px rule-strong border, 20px padding. Optional `card-head` with kicker + title and bottom rule divider.
- **Tables (editorial):** No alternating row fills. Rule-strong header bottom border, rule row borders. Monospaced tabular-nums columns for IDs and numbers. Subtle surface-alt row hover.
- **Tiles (Bento):** Minimum `tile-kicker` (uppercase meta label) at top with bottom rule, then tile body. Grid-column span in 12-col system.
- **Navigation:** Top masthead + horizontal section nav. Nav items are `uppercase 12px tracking-[0.08em]`. Active state = burgundy color + 4px underline offset.

## Anti-patterns (never use)

- Purple/violet gradients as accent (AI slop)
- 3-column icon-in-colored-circle feature grids
- Centered everything with uniform spacing
- Uniform bubbly border-radius on all elements (harness uses hierarchical radius — pills round, everything else near-sharp)
- Gradient buttons
- Generic stock-photo hero sections
- Emoji in production UI (outside explicit empty-state moments like "Inbox zero 🎉")
- Overused fonts: Inter, Roboto, Arial, Poppins, Montserrat, Helvetica
- Blacklisted fonts: Papyrus, Comic Sans, Lobster, Impact, Courier New (body)
- Fade-in-on-scroll page loads
- Full-bleed card-background semantic color (use left-border + surface instead)

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-21 | Initial design system created via `/design-consultation` | From-scratch Editorial Workbench direction, informed by category research (Linear 2026 refresh, LangSmith, Vercel, Raycast). Light-mode-default, burgundy+forest accents, Fraunces+Instrument Sans+JetBrains Mono. |
| 2026-04-21 | Light mode default (contra category norm) | Dev tools default to dark. Harness defaults to light because long-form content (PR diffs, specs, agent reasoning) is more comfortable in light, and the editorial metaphor requires paper. Dark mode supported via `.dark` class. |
| 2026-04-21 | Burgundy accent instead of blue/purple | Every dev tool uses blue or purple. Harness uses burgundy because it's instantly distinctive and pairs with forest green for a wine-label / literary palette that matches the editorial direction. |
| 2026-04-21 | Fraunces serif as display font | Dev tools use sans-serif exclusively (Inter/Geist). Fraunces signals this is a crafted tool with literary intent, not a boilerplate dashboard. Variable optical sizing means it reads well at both hero scale and 16px. |
