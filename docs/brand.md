# Brand — Kaidera Design System

OpenKai uses the Kaidera neomorphic rounded design system: solid surfaces,
mint accent, graphite/paper text, and a single brand colour palette.

## Colour palette

| Colour | Hex | Use |
|---|---|---|
| **Mint** | `#B0E1CD` | Brand accent, primary action, success |
| **Mint hover** | `#93D9BB` | Hovered action, deliberate highlight |
| **Mint ink** | `#26352F` | Text on mint |
| **Graphite** | `#303234` | Primary text, monochrome identity |
| **Paper** | `#F1F1ED` | Dark-theme text, reverse identity |
| **Steel** | `#858A88` | Secondary structure, borders |
| **Cream** | `#E6E5E0` | Quiet inset regions |
| **Light canvas** | `#EFEFEF` | Light-theme material field |
| **Dark canvas** | `#3D3D3D` | Dark-theme material field |

The brand reads as **black/white first, mint second, steel/cream third**.
Mint is not a highlighter for every heading — use it for the mark, primary
actions, selected states, and restrained graphic anchors.

## The mark

The Kaidera hex-node mark: an outer hexagon holding a triangle of connected
nodes. The knowledge-graph motif — nodes connected by lines, forming a
network.

**Splash** (15-line): thin-box-drawing hexagon with 9 nodes (6 perimeter +
3 internal triangle) and circuit traces. Rendered in the brand gradient
(graphite → steel → mint → mint-hover → paper) with a paper-white shine
traversal.

**Boot mark** (8-line): `KAIDERA_MARK_COMPACT` — sharp variant of the same
triangle motif for the boot card.

**Status bar glyph**: `⬣` hex Unicode character, mint gradient colour.

## Neomorphic depth

Solid surfaces. Depth comes from a consistent upper-left light source and
lower-right cast shadow. No gradients, no translucent panels, no glow.

| Level | Recipe | Use |
|---|---|---|
| Compact | paired `5px 5px 10px` / `-5px -5px 10px` | Icon wells, compact controls |
| Control | paired `8px 8px 16px` / `-8px -8px 16px` | Buttons, tabs, switches |
| Card | paired `18px 18px 36px` / `-18px -18px 36px` | Independent cards |
| Hero | paired `24px 24px 48px` / `-24px -24px 48px` | One focal surface per view |
| Inset | paired inset `7px 7px 14px` / `-7px -7px 14px` | Fields, pressed controls |

Rounded geometry: hero `30px`, card `24px`, control `16px`, compact `14px`,
pill `999px`.

## Theme system

Themes are token-driven. The only colour source is the theme module —
no ad-hoc literals.

### Theme files

- `dark.json` — dark canvas, graphite text, mint accent
- `light.json` — light canvas, paper text, mint accent
- `kaidera-dark.json` — Kaidera brand dark theme
- `kaidera-light.json` — Kaidera brand light theme

### Theme detection

At boot, OpenKai detects the terminal background:

1. **OSC 11 query** — asks the terminal for its background colour (kitty,
   ghostty, iTerm2, wezterm). 150ms timeout.
2. **COLORFGBG** — fallback env var (bg ≥ 7 = light, else dark)
3. **macOS fallback** — appearance fallback for Zellij
4. **Dark default** — if nothing else answers

The theme is fixed at spawn — a pinned theme survives terminal appearance
flips.

### Theme switching

```bash
# Explicit theme
openkai --theme dark
openkai --theme light
openkai --theme kaidera-dark

# Auto-detect (default)
openkai --theme auto

# Toggle in TUI
Ctrl+T cycles: auto → dark → light → kaidera-dark → kaidera-light
```

## Typography

**Space Grotesk** — the Kaidera typeface. Weights 300–700. Used for the
brand wordmark, headers, and UI chrome. Not the terminal font — the
terminal font is your monospace font.

## Splash animation

The splash plays **every launch**:

1. 15-line hexagon with 9 nodes renders in the brand gradient
2. Paper-white shine band traverses three times (cubic ease-out)
3. Settles to a static gradient frame
4. ~2.6 seconds total, any key skips

The splash is the brand moment — the persistent boot card carries the
compact mark ever after.

## Status bar

Two-sided footer:

- **LEFT**: brand glyph (`⬣` mint) + agent pill + provider + git branch +
  persist mode + session id + state chip
- **RIGHT**: tokens + context % + model

Chips are configurable via `~/.openkai/config.json` (`statusline.chips`):

```json
{
  "statusline": {
    "chips": ["brand", "agent", "provider", "git", "persist", "session", "state", "ctx", "tokens", "model"]
  }
}
```

Presets: `default` (all chips), `minimal` (brand + state + model),
`compact` (brand + provider + state + tokens + model), `full` (every chip).

## Brand rules

1. **One material** — canvas and raised surfaces share the same base colour
2. **One brand accent** — mint identifies Kaidera and primary action
3. **Depth with purpose** — relief communicates hierarchy or state, never
   noise
4. **No gradients** — solid surfaces, mint accent, graphite/paper text
5. **No translucent panels** — opaque overlays, surface background
6. **No glow** — neomorphic depth, not electric bloom
7. **Rounded geometry** — no sharp corners in the design system
8. **Space Grotesk** — no competing display face
