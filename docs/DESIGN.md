# Arkvoid Design System ("Pearl")

## 1. Visual Principles
- **Surfaces**: Pearl (`#FBFAF7`), Porcelain (`#F4F1EA`), and Mist (`#ECE8F4`).
- **Text**: Deep Ink (`#17141F`), Ink-2 (`#4A4658`), and Ink-3 (`#8A8598`).
- **Light as Accent**: Orange (`#FF7A1A`) and Purple (`#7C5CFF`) appear strictly as light (rings, thin hairlines, glows, sky gradients), never as large flat fills.
- **Aurora Gradient**: `linear-gradient(135deg, #FF8A3D 0%, #FFB27A 28%, #C9B8FF 68%, #7C5CFF 100%)`. Restricted to the Orb outer ring, the primary `light` button, the 2 px field focus accent, and the 2 px progress hairline.

## 2. WCAG AA Contrast Verification
Computed via relative luminance $(L_1 + 0.05) / (L_2 + 0.05)$:

| Foreground | Background | Ratio | WCAG AA Normal ($\ge 4.5:1$) | WCAG AA Large / UI ($\ge 3.0:1$) | Allowed Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ink` (`#17141F`) | `pearl` (`#FBFAF7`) | **17.40:1** | PASS (AAA) | PASS (AAA) | Primary titles, body text, icons |
| `ink` (`#17141F`) | `porcelain` (`#F4F1EA`) | **16.10:1** | PASS (AAA) | PASS (AAA) | Card titles, body text, controls |
| `ink` (`#17141F`) | `mist` (`#ECE8F4`) | **15.06:1** | PASS (AAA) | PASS (AAA) | Elevated chips, subtle surfaces |
| `ink-2` (`#4A4658`) | `pearl` (`#FBFAF7`) | **8.72:1** | PASS (AAA) | PASS (AAA) | Secondary prose, mono labels, keycaps |
| `ink-2` (`#4A4658`) | `porcelain` (`#F4F1EA`) | **8.07:1** | PASS (AAA) | PASS (AAA) | Secondary prose & mono labels on cards |
| `ink-2` (`#4A4658`) | `mist` (`#ECE8F4`) | **7.55:1** | PASS (AAA) | PASS (AAA) | Secondary labels on mist |
| `pearl` (`#FBFAF7`) | `ink` (`#17141F`) | **17.40:1** | PASS (AAA) | PASS (AAA) | `ink` primary button text |
| `ink` (`#17141F`) | `orange-soft` (`#FFB27A`) | **10.74:1** | PASS (AAA) | PASS (AAA) | `light` button text over Aurora |
| `ink` (`#17141F`) | `lavender` (`#B9A6FF`) | **9.66:1** | PASS (AAA) | PASS (AAA) | `light` button text over Aurora |
| `danger` (`#C8553D`) | `pearl` (`#FBFAF7`) | **4.17:1** | Large/UI only | PASS (AA) | Error rings/icons (pair with `ink` text) |
| `ink-3` (`#8A8598`) | `pearl` (`#FBFAF7`) | **3.42:1** | Large/UI only | PASS (AA) | Orb centre 14 px glyph, graphical marks |

## 3. Spatial, Radius, Shadow & Z-Index Tokens
- **Spacing**: `4, 8, 12, 16, 20, 24, 32, 48, 64 px`.
- **Radii**: `14 px` (field), `22 px` (card), `28 px` (sheet and panel), `9999 px` (pills and orb).
- **Shadows**: Three-layer violet-grey shadows (`rgba(60, 40, 120, 0.04..0.10)`), never pure black.
- **Z-Index**: `world: 0`, `hud: 10`, `prompt: 20`, `sheet: 30`, `modal: 40`, `toast: 50`, `system: 60`.

## 4. Typography
- **UI Sans (`Geist Variable`)**: Titles weight `500` (`-0.02em` tracking); body weight `400` (`1.5` line-height).
- **Mono (`Geist Mono Variable`)**: Uppercase, `0.14em` tracking, `11–12 px`, strictly for compact labels (`ink-2` for AA text compliance).
- **Display Serif (`Instrument Serif` italic)**: Used strictly for area names, realm names, and resident names in dialogue.
- **Scale**:
  - `display`: `clamp(2.5rem, 5vw + 1rem, 4.5rem)` (`40–72 px`)
  - `title`: `clamp(1.5rem, 2.2vw + 0.8rem, 2.125rem)` (`24–34 px`)
  - `heading`: `clamp(1.125rem, 1vw + 0.85rem, 1.3125rem)` (`18–21 px`)
  - `body`: `1rem` (`16 px`)
  - `label`: `clamp(0.6875rem, 0.25vw + 0.625rem, 0.75rem)` (`11–12 px`)

## 5. Components (`src/ui`)
- **Glass & `useGlass()`**: Adapts automatically by GPU/device tier (`desktop-high`: `rgba(255,255,255,0.62)` + `blur(24px) saturate(1.4)`; `mobile-or-mid`: `rgba(255,255,255,0.90)` without blur).
- **Button**: Variants `ink`, `light`, `quiet`, `ghost`; sizes `lg` (`56 px`), `md` (`48 px`), `sm` (`40 px`, expanding to `48 px` on coarse pointers). `0.98` press scale in `90 ms`.
- **IconButton**: `48×48 px` glass circle.
- **Pill**: `54 px` height contextual action pill with pulsing `8 px` orange dot and fine-pointer keycap.
- **Sheet**: Bottom sheet on `< 1024 px` with `peek` (`30dvh`), `medium` (`58dvh`), and `full` (`92dvh`) detents, `36×4 px` grab handle, spring velocity snapping, and swipe-down-at-peek to close. At `>= 1024 px`, renders as a `400 px` floating right panel (`16 px` margin, `28 px` radius). Includes focus trap, `inert` background, `Escape` dismissal, and focus restoration.
- **Field, SegmentedControl, Chip, Toast, Tooltip, Skeleton, Divider, WorldLabel, Logo**: Complete typed primitives.
- **Orb (`src/ui/Orb.tsx`)**: `76 px` glass circle with `2.5 px` Aurora time-of-day ring, rotating `6 px` hour marker, concentric `3 px` Dawn (`#FF7A1A`) and Dusk (`#7C5CFF`) `stroke-dashoffset` arcs, and a `14 px` morphing centre phase glyph.
