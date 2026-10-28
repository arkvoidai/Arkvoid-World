# Arkvoid Asset Checklist (Step 8B · Real Textures from Repository)

This document specifies the discovery, slot assignments, file format conventions, and override mechanism for real CC0 PBR texture sets from Poly Haven integrated into the Arkvoid engine.

## 1. Storage Location & Build Discovery
- **Location**: `src/assets/textures/` (repository-only; Supabase Storage is no longer used for textures).
- **Discovery**: Automatically discovered at build time via Vite's `import.meta.glob('/src/assets/textures/**/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' })`.
- **Supported Formats**: `.jpg`, `.jpeg`, `.png`, `.webp` (case-insensitive). Files with `.exr`, `.zip`, `.tif` are safely ignored.
- **Graceful Fallback**: If `src/assets/textures/` is empty or missing files, the engine instantly provisions procedural canvas fallbacks with Sobel normals. The engine never crashes or stalls.

## 2. Slot Status & Assigned Sets

Every slot is assigned dynamically based on Poly Haven keyword matching, or falling back to procedural generation if no matching texture set is present.

| Slot | Status | Assigned Set Key | Maps Present | UV Scale | Normal Scale | Nominal Roughness | Target Mean Luminance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **roof** | repo (`roof`) | `roof` | diff, nor | 2.0 m | 1.2 | 0.55 | 0.30 |
| **bark** | repo (`bark`) | `bark` | diff, nor | 1.2 m | 1.5 | 0.90 | 0.33 |
| **moss** | repo (`moss`) | `moss` | diff, nor | 2.0 m | 1.1 | 0.95 | 0.30 |
| **timber** | repo (`timber`) | `timber` | diff, nor | 1.5 m | 1.0 | 0.65 | 0.27 |
| **plaster** | repo (`plaster`) | `plaster` | diff, nor | 3.0 m | 0.7 | 0.90 | 0.80 |
| **path** | repo (`path`) | `path` | diff, nor | 2.5 m | 1.2 | 0.80 | 0.60 |
| **stone** | repo (`stone`) | `stone` | diff, nor | 2.0 m | 1.2 | 0.80 | 0.62 |
| **rock** | repo (`rock`) | `rock` | diff, nor | 4.0 m | 1.4 | 0.85 | 0.52 |
| **grass** | repo (`grass`) | `grass` | diff, nor | 3.0 m | 1.0 | 0.90 | 0.38 |

*(Note: If any slot has no file in the repo, its status is marked `fallback` and procedural textures are used).*

## 3. Adding New Sets & Overriding Assignments
To add more Poly Haven texture sets:
1. Download CC0 texture sets from [Poly Haven](https://polyhaven.com).
2. Drop the unrenamed files into `src/assets/textures/` or any subfolder (e.g. `src/assets/textures/forest_ground_04/forest_ground_04_diff_1k.jpg`).
3. Poly Haven tokens are detected automatically:
   - **Maps**: `diff`/`diffuse`/`col`/`color`/`albedo` -> diffuse; `nor_gl`/`normal_gl`/`nor` -> OpenGL normal; `nor_dx`/`normal_dx` -> DirectX normal (flip green channel); `arm` -> AO (R) + Roughness (G) + Metalness (B); `rough`/`roughness` -> roughness; `ao` -> ambient occlusion; `disp`/`displacement`/`height` -> displacement (reserved).
   - **Resolutions**: `512`, `1k`, `2k`, `4k`, `8k`.
4. **Overrides**: To force a slot to use a specific set key regardless of keyword scoring, open `src/config/textureOverrides.ts` and set:
   ```typescript
   export const TEXTURE_OVERRIDES: Partial<Record<TextureSlot, string>> = {
     grass: 'forest_ground_04',
     stone: 'castle_brick_02',
   };
   ```
   Overrides in this file always take precedence over automatic keyword scoring.

## 4. Tiling & Scale Configuration
All UV scales, normal strengths, and nominal roughness values are centralized in `src/config/textureTuning.ts`. Adjustments there immediately affect `MaterialLibrary`, `TerrainMaterial`, and all world shaders.

## 5. Dev Inspection Tools
- `?assets=1`: Displays diagnostic table with assigned sets, maps, resolution, file size, normal convention (GL/DX), albedo gain, 64px thumbnails, memory usage, and budget warnings.
- `?tex=0`: Forces procedural fallback textures only, allowing instant A/B visual comparison.
