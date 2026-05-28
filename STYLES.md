# STYLES.md — HumanTouch UI Style Guide

## Philosophy

Agentic UI. The interface feels like a live operating system, not a dashboard. Everything is purposeful, minimal, and reactive. The user should feel like they're commanding a system, not filling out a form.

---

## Core Principles

### 1. No Scrollbars
Every view is viewport-contained. Content fits within the screen. Use flex/grid layouts that distribute space rather than overflow it. If a list must scroll internally (e.g. message history), use `scrollbar-none` and let the content breathe — never show native scrollbars.

```css
/* Apply globally */
* {
  scrollbar-width: none;
}
*::-webkit-scrollbar {
  display: none;
}
```

### 2. Dark-First, High-Signal
Background: near-black (`#0a0a0f`). Surfaces: dark grays (`#111118`, `#16161f`). Text: off-white (`#e8e8f0`), secondary at 50% opacity. Accent: a single electric color — cool violet/indigo (`#7c5cfc`) or cyan (`#00d4ff`). No warm tones. No gradients except on active agent nodes.

### 3. Spatial Layout — No Overflow
The dashboard is a fixed viewport layout split into panels. Panels are sized with `flex` or `grid` using `h-screen` and `overflow-hidden` at the root. Panels never push content outside the viewport.

```
┌──────────────────────────────────────────────────────┐
│  Topbar (fixed height, ~48px)                        │
├────────────────┬─────────────────────────────────────┤
│                │                                     │
│  Agent Graph   │         Chat Panel                  │
│  (left 40%)    │         (right 60%)                 │
│                │                                     │
│                ├─────────────────────────────────────┤
│                │  Activity Log (collapsible, ~160px) │
└────────────────┴─────────────────────────────────────┘
```

### 4. Motion as Signal
Animation communicates system state, not decoration.
- Agent nodes pulse when active (subtle glow animation)
- Messages stream in token-by-token — no pop-in
- Panel transitions: opacity + slight Y translate, 150ms ease-out
- No bounces, no spring physics, no decorative loaders

### 5. Typography
- Font: `Inter` or `Geist` (system-ui fallback)
- Scale: tight. Body 13–14px. Labels 11–12px all-caps tracked. Headings sparse.
- Monospace (`JetBrains Mono` or `Fira Code`) for agent output, logs, and any streaming text
- Line height: 1.5 for prose, 1.3 for UI labels

### 6. Components Feel Like Terminals, Not Forms
- Inputs: borderless or single bottom-border, dark bg, no rounded pill shapes
- Buttons: text-only or icon+text, subtle hover bg, no drop shadows
- Cards/panels: thin `1px` border in `rgba(255,255,255,0.07)`, no border-radius above `8px`
- Focus rings: single-pixel accent color, no glow halos

---

## Color Tokens

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#0a0a0f` | Page background |
| `--bg-surface` | `#111118` | Cards, panels |
| `--bg-elevated` | `#16161f` | Dropdowns, tooltips |
| `--border` | `rgba(255,255,255,0.07)` | Panel borders |
| `--text-primary` | `#e8e8f0` | Body text |
| `--text-secondary` | `rgba(232,232,240,0.5)` | Labels, timestamps |
| `--text-muted` | `rgba(232,232,240,0.25)` | Placeholders |
| `--accent` | `#7c5cfc` | Active state, links, CTAs |
| `--accent-dim` | `rgba(124,92,252,0.15)` | Hover bg, subtle highlights |
| `--success` | `#22c55e` | Connected, online |
| `--warning` | `#f59e0b` | Pending, degraded |
| `--error` | `#ef4444` | Failed, disconnected |

---

## Agent Node Styles (Dashboard Graph)

- Idle: dark circle, dim border, muted label
- Active: accent border + soft outer glow (`box-shadow: 0 0 12px rgba(124,92,252,0.4)`), label brightens
- Main Agent node: slightly larger, always visible center node
- Sub Agent nodes: orbiting or grid-arranged around Main Agent
- Connecting lines: `rgba(255,255,255,0.08)` at rest, animate to accent color when data flows through them

---

## Chat Panel

- Message bubbles: no bubbles. Left-aligned text blocks separated by spacing.
- User messages: slightly indented, `--text-secondary` color
- Agent messages: full width, `--text-primary`, monospace font during streaming then switch to sans-serif on completion
- Timestamps: `--text-muted`, 11px, only shown on hover
- Input: pinned to bottom of panel, dark bg, no border except top separator line, send icon on right

---

## Activity Log

- Compact, fixed-height strip at the bottom of the dashboard
- Monospace font, 12px, `--text-secondary`
- New events slide in from bottom, old ones fade out — no scrollbar
- Format: `[timestamp]  AgentName → action description`

---

## Onboarding

- Full-screen, centered, single column
- Progress bar: thin `2px` line across the top, fills left-to-right in accent color
- Step content: large quiet heading, Reflexive Agent message in a contained box, user input below
- No cards with heavy borders — just whitespace and typography to create separation

---

## What to Avoid

- Scrollbars anywhere visible
- Rounded pills (`border-radius > 8px` on non-circular elements)
- Drop shadows (except agent node glows)
- Gradients except on active agent nodes
- Bright whites or light mode
- Modal dialogs — prefer inline or panel-based state
- Skeleton loaders — use streaming and progressive rendering instead
- Cluttered toolbars or icon-heavy navbars
