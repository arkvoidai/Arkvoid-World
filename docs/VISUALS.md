# ARKVOID VISUAL LAW & RENDERING SPECIFICATION

## 1. QUALITY TIERS

| Setting | Ultra (Desktop-High) | Balanced (Mid/High-Phone) | Performance (Mid-Phone) | Lite (Low-End/SW) |
| :--- | :--- | :--- | :--- | :--- |
| **DPR Cap** | 2.0 | 1.75 (Phone: 1.5) | 1.25 | 1.0 |
| **Render Scale** | 1.0 | 1.0 | 0.80 (0.70–0.90) | 0.65 |
| **MSAA Samples** | 4 | 4 (Phone: 2) | 2 or 0 | 0 (Off) |
| **Shadows** | CSM 3 cascades x 2048 | 1 x 2048 (Phone: 1024) | None (AO decals only) | None |
| **Ambient Occlusion** | GTAO (Enabled) | None | None | None |
| **Bloom** | Half-res, 0.35 strength | Quarter-res, 0.20 (Desktop) | None (Glow sprites) | None |
| **Bloom Threshold** | 1.0 (Linear HDR) | 1.0 (Linear HDR) | N/A | N/A |
| **Sun Shafts** | Screen-space radial (24s) | Geometry beams | None | None |
| **Grass Blades** | 120,000 | 70,000 (Phone: 28,000) | 14,000 | 0 (None) |
| **Leaf Cards** | 100% | 70% | 40% | 0% (Proxies only) |
| **Textures** | 1024 (2048 if _2k) | 1024 | 512 | 256 (Procedural) |
| **Cloud Light March** | 4 steps | 2 steps | 0 (Off) | 0 (Off) |
| **PMREM Refresh** | 45 s | 60 s | None | None |
| **Particles** | 1.0 (Full) | 0.70 | 0.40 | 0.10 |
| **Film Grain** | 0.012 (Desktop only) | 0.008 (Desktop only) | 0.0 | 0.0 |

---

## 2. COMPOSITE PASS PIPELINE & GPU BUDGET

Pipeline executes in Linear HDR prior to display output:

```
[3D Scene MSAA HalfFloat Target]
         │
         ▼
[Optional GTAO Screen Pass] (Ultra only: ~0.8 ms desktop)
         │
         ▼
[Bloom Pass: Extract >1.0 HDR + Separable 9-tap Gaussian Blur] (Ultra: ~0.7 ms, Balanced: ~0.3 ms)
         │
         ▼
[Screen-Space Sun Shafts: 24-sample radial march toward sun] (~0.5 ms desktop, only when sun is in view)
         │
         ▼
[Composite Pass: Additive Bloom + Sun Shafts + Lens Glare + Breathing Exposure (±2%)]
         │
         ▼
[AgX Filmic Tone Mapping]
         │
         ▼
[Colour Grade: Split-Tone (Shadow #5B49C9, Highlight #FF9B4A) + S-Curve (0.12) + Vibrance (0.15)]
         │
         ▼
[Lens Vignette (0.75 radius, 0.22 strength) + Film Grain (0.012) + Dither (1/255) -> sRGB Output]
```

Total post-processing frame cost:
- Desktop Ultra: ~2.4 ms
- Desktop Balanced: ~1.2 ms
- Phone: ~0.4 ms (direct composite with split-tone & AgX tone mapping)

---

## 3. SKY STATE & ATMOSPHERE LAW

| Hour | Phase | Sky Zenith / Horizon | Sun Direction / Elev | Fog Color | Fog Near / Far | Exposure |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **06.5** | Dawn | `#FF8C42` / `#FFE6D5` | Heading 65°, Elev +14° | `#FFE4D4` | 35 m / 420 m | 1.15 |
| **09.5** | Morning | `#8CB8FF` / `#EDF4FF` | Heading 115°, Elev +42° | `#EAF2FF` | 55 m / 650 m | 1.02 |
| **12.0** | Noon (Pearl) | `#B4D4FF` / `#FBFAF7` | Heading 180°, Elev +68° | `#F4F1EA` | 65 m / 780 m | 0.96 |
| **16.5** | Late Day | `#FFB07A` / `#FFF2E8` | Heading 245°, Elev +34° | `#FFEAD9` | 50 m / 580 m | 1.08 |
| **18.3** | Dusk | `#7C5CFF` / `#FF8A4A` | Heading 285°, Elev +4° | `#C9A8E2` | 30 m / 360 m | 1.28 |
| **23.0** | Night | `#141026` / `#382A54` | Sun below horizon (-38°) | `#201838` | 24 m / 290 m | 1.45 |

---

## 4. COLOUR LAW: "PEARL" LIGHT THEME

- **Base World Tone**: White, airy, expensive porcelain (`#FBFAF7`, `#F4F1EA`, `#ECE8F4`).
- **Typography**: Deep ink (`#17141F`, `#4A4658`, `#8A8598`), hairline borders (`rgba(23,20,31,0.10)`).
- **Light as Identity**:
  - Dawn / Qi / Sunlight: Radiant warm orange (`#FF7A1A`, `#FF9B4A`, `#FFA040`).
  - Dusk / Spirit / Shadow: Radiant purple & violet (`#7C5CFF`, `#5B49C9`, `#B9A6FF`).
  - Gold Accents: Sacred trim and bell ornamentation (`#D8A24A`).
- **Anti-Slop Discipline**:
  - No flat neon fills.
  - No chromatic aberration or heavy dirty lens textures.
  - Breathing exposure oscillation: $\pm 2\%$ over a 20-second sine period for organic life.

---

## 5. VISUAL REVIEW SHOT CATALOG (?shots=1)

1. `wide-bridge-to-plaza`: Wide scenic vantage from arched stone bridge toward the central courtyard.
2. `plaza-pavilion-close`: Close-up framing of the octagonal pavilion and terrace stonework.
3. `pavilion-roof-lanterns`: Hip-and-gable roof detail, dougong bracket clusters, and hanging bronze lanterns.
4. `gate-veil-head-on`: Head-on perspective of the outer sect gate and spirit veil boundary.
5. `breath-pool-motes`: Floating spirit motes and quiet water ripples across Island S Breath Pool.
6. `lantern-path-low`: Ground-level perspective along the carved stone lantern path.
7. `cloud-sea-island-edge`: Dramatic overlook of the tumbling cloud-sea and porcelain cliff overhangs.
8. `island-underside-up`: Upward view of the floating root-like porcelain spires suspended in mist.
9. `bridge-hero-golden`: Arched bridge hero angle framed against dawn and dusk horizon glow.
10. `low-cloud-sea-horizon`: Low cloud-sea vantage with atmospheric horizon layering.
11. `hall-interior-altar`: Inside the Main Hall with central incense brazier, spirit flame, and timber columns.
12. `waterfall-base-wisteria`: Base of the roaring waterfall and arched stone bridge seen from below.
