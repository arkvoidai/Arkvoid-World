# Arkvoid hero posters

The Gate currently uses a procedural CSS poster until the founder exports the real images from the existing `?shots=1` review tool.

Export the following eight WebP files into this directory:

- `hero-dawn-landscape.webp` — 1600×900
- `hero-day-landscape.webp` — 1600×900
- `hero-dusk-landscape.webp` — 1600×900
- `hero-night-landscape.webp` — 1600×900
- `hero-dawn-portrait.webp` — 900×1600
- `hero-day-portrait.webp` — 900×1600
- `hero-dusk-portrait.webp` — 900×1600
- `hero-night-portrait.webp` — 900×1600

Keep each file at or below 90 KB. Once the corresponding files have been committed, add their root-relative paths to the `posters` array in `manifest.json`. The HTML bootstrap only preloads a declared poster; an empty manifest keeps the first visit on the CSS fallback without requesting missing files.
