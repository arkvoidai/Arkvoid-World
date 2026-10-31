# Performance audit — progressive boot hardening

## Scope and method

This audit distinguishes repository/source findings from browser measurements. No physical Android, iOS, tablet, laptop, desktop, or 4K device was attached to this execution. No Lighthouse, Playwright, WebKit, Firefox, five-minute heap, or on-device frame-time run was available through the repository connector. Therefore runtime values below are **NOT MEASURED**; no pass is claimed.

The branch adds User Timing marks and a development performance snapshot so the same measurements can be collected in a browser. Marks are available under these names:

- `arkvoid:navigation-start`
- `arkvoid:first-paint`
- `arkvoid:boot-ui-visible`
- `arkvoid:react-mounted`
- `arkvoid:engine-chunk-loaded`
- `arkvoid:first-world-frame`
- `arkvoid:interactive`

In Chromium development builds, `window.__ARKVOID_PERF_AUDIT__` records boot marks, long tasks occurring after the first world frame, and (where `performance.memory` is available) a heap sample after five minutes. `window.__ARKVOID_WEB_VITALS__` records the observed LCP/INP/CLS snapshot. INP is a browser Event Timing approximation and must be checked against the official Web Vitals library before treating it as field INP.

## Before measurements

| Profile | First paint | LCP | Can move | Initial JS gzip | Engine JS gzip | p95 frame | Long tasks after frame | Heap at 5 min |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mid Android phone · simulated 4G / 4× CPU | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| iPhone-class mobile | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Tablet | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Laptop · 1366×768 | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Desktop · 1920×1080 | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |
| Desktop · 3840×2160 (4K) | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED |

## Source audit — highest-risk loading costs

These are source-level findings, **not a measured runtime ranking**:

1. **WorldHost eagerly imported the engine graph.** Engine, presenter, quality governor, ShowcaseWorldSystem and diagnostic modules were top-level imports even while the Gate was displayed. The branch moves those imports behind a memoized dynamic loader and starts ordinary-tier devices at idle; low-tier / data-saver devices wait for Begin.
2. **ShowcaseWorldSystem builds a large world synchronously.** Its current `init()` constructs the sky, cloud sea, distant ranges, four island landforms, regions, architecture, water, vegetation, effects and residents before the first interactive world frame. The requested P0–P4 time-sliced build has not yet been implemented.
3. **AssetStore creates nine procedural 512×512 fallback material sets synchronously.** Each set computes diffuse, normal and ARM pixels. This can be CPU-heavy before the renderer's first usable world frame. It remains unchanged in this branch.
4. **TextureCatalog used an eager glob for texture URLs.** It now uses a lazy `import.meta.glob` map of URL-only module loaders and resolves the catalog asynchronously; image bytes continue to decode with `createImageBitmap` and GPU uploads remain queued one texture per frame.
5. **The first route included non-Gate feature modules and shared libraries.** The branch introduces named UI, Gate, Awakening, HUD, Supabase, Three.js, engine-core, world-content, vegetation, actors and FX chunk groups. Actual chunk sizes and whether all groups remain out of the initial static import closure must be read from a production build.

No source-level candidate above is represented as a proven top-five runtime bottleneck until measured traces support that conclusion.

## After changes — measurement status

| Profile | First paint | LCP | Can move | Initial JS gzip | Engine JS gzip | p95 frame | Long tasks after frame | Heap at 5 min |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mid Android phone · simulated 4G / 4× CPU | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| iPhone-class mobile | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Tablet | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Laptop · 1366×768 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Desktop · 1920×1080 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| Desktop · 3840×2160 (4K) | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

## Budgets and acceptance

The production bundle checker now computes gzip bytes from Vite's manifest and enforces:

| Budget | Limit |
|---|---:|
| Initial static JavaScript (entry plus recursive static imports) | ≤170 KB gzip |
| Three.js and engine-core chunks | ≤260 KB gzip per emitted chunk |
| Every other emitted JavaScript chunk | ≤350 KB gzip per emitted chunk |
| Desktop p95 frame time | ≤25 ms |
| Phone p95 frame time | ≤40 ms |
| Phone frame rate | stable ≥30 FPS |

Chunk limits are checked by CI after a real production build. A green check is evidence for the generated bundle in that runner, not for every physical device. The world build still needs its own frame-time and interaction traces.

The poster-first Gate uses a procedural CSS fallback because no real hero WebP files have been supplied yet. The empty `public/posters/manifest.json` intentionally prevents requests for missing images. The eight founder exports are documented in `public/posters/README.md`.

## Reproducible collection protocol

1. Build with the frozen Bun lockfile and run `bun run check:budget`.
2. Run Lighthouse mobile emulation with simulated 4G and 4× CPU slowdown on the poster phase. Record LCP, CLS, TBT and performance score in this file.
3. Collect Playwright Chromium traces and screenshots for all dimensions in `docs/QA_MATRIX.md`; also run WebKit and Firefox only where WebGL is supported.
4. On a physical mid-range Android device, cold-load over 4G, record paint marks, wait until the first world frame, measure movement readiness, then repeat as a warm load.
5. Keep the world open for at least five minutes, capture heap and post-frame long-task counts, walk/interact through the world, and record p95 frame time and renderer draw calls.
6. Repeat for each listed profile; record device, browser, OS, connection mode, date, commit SHA and raw trace location with every measurement.

## Known outstanding measurements / engineering

- P0–P4 asynchronous world build, per-frame work slices, shader compile warmup and texture upload timing remain pending.
- IndexedDB generated-mesh cache and optional `npm run bake` / Bun equivalent remain pending.
- Actual eight WebP hero images and per-image size verification remain pending.
- Playwright smoke suite, cross-browser checks and screenshot artifacts remain pending.
- Real Android Chrome and iOS Safari keyboard/visualViewport verification remains pending.
- Vercel response-header verification for Brotli and production package-manager build-log confirmation remain pending.
