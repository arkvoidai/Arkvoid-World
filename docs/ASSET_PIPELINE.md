# Arkvoid World asset pipeline (free-first)

The current procedural scene is a playable prototype, not photorealistic. This plan defines how to replace placeholders with real, licensed assets without sacrificing phone performance.

## Free asset sources

| Need | Source | Use |
|---|---|---|
| Rigged humanoid bases and hairstyles | [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) | Six humanoid bases, male/female proportions, 20 hairstyles, glTF, CC0, about 13k triangles per model. |
| Fantasy outfits | [Quaternius Modular Character Outfits - Fantasy](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) | Modular outfits, humanoid rig compatibility, three texture variants, glTF, CC0. |
| Animated fantasy NPCs | [Quaternius RPG Character Pack](https://quaternius.com/packs/rpgcharacters.html) | Six rigged, animated, textured fantasy characters, glTF/FBX/OBJ/Blend, CC0. |
| Realistic materials, HDRIs, rocks, vegetation | [Poly Haven](https://polyhaven.com/) | CC0 PBR textures, HDRIs and selected models. Download 1K/2K for phones and 2K/4K for desktop. |
| Authoring, rigging, baking and LODs | [Blender](https://www.blender.org/download/) | Free/open-source 3D pipeline; export optimized GLB/glTF. |

Keep the licence file from every downloaded pack next to the imported assets. Check the source pack's licence before shipping. Do not copy preview renders or logos.

## What belongs where

### GitHub / Vercel
Commit optimized runtime assets under `public/assets/`:
- `characters/<id>/model.glb`
- `world/<region-id>/environment.glb`
- `world/<region-id>/textures/*.ktx2`
- `licenses/<pack>/LICENSE.txt`

Keep raw archives and working .blend files outside the production bundle. Commit only selected runtime files. Vercel documents a 100 MB static upload limit on Hobby deployments, so keep the deployed repository well below that.

### Supabase
Keep Supabase for mutable structured/user data: region and area metadata, discovery state, character saves, NPC persona/schedules, dialogue and user-scoped memories. Do not put binary models in Postgres. Avoid serving shared high-volume world textures through Supabase Storage; static models and textures are cacheable deploy assets and Supabase Free has finite storage/egress.

### APIs and secrets
- Mistral: keep `MISTRAL_API_KEY` only in Supabase Edge Function secrets. Never expose it in `VITE_*` variables, browser code, GitHub or a public manifest. Mistral Studio's Free mode allows API evaluation without a credit card, but has limited usage and rate limits.
- No API key is needed to load committed GLB/KTX2 files from the same Vercel origin.
- Poly Haven's public API is optional for an internal asset browser; production worlds should use pinned, downloaded assets rather than unpredictable runtime downloads.

## Runtime quality and performance rules

1. Load Home Reach and the selected destination first; lazy-load other regions only when selected. Dispose previous-region GPU resources after the transition.
2. Use GLB/glTF, meshopt geometry compression where supported, KTX2/Basis textures, atlases and shared materials.
3. Instance repeated trees, rocks, lanterns, roof details and crowds. Avoid one draw call per leaf or stone.
4. Author LODs and far impostors. Default to 1K textures on mobile, 2K on desktop; reserve 4K for hero close-ups on capable desktops.
5. Keep only nearby hero NPCs on full animation rigs. Reduce animation frequency and use lower LODs for distant residents.
6. Respect reduced-motion settings, device pixel ratio and QualityGovernor. Never force desktop shadows/post-processing on phones.
7. Measure real devices before raising defaults: target stable 30 FPS on mid-range phones and 60 FPS on desktop. Cap pixel ratio, shadow-map size, visible foliage and simultaneous animated NPCs per device tier.
8. Provide loading UI and fallback materials when optional assets fail; do not block world boot on distant assets.

## Phone-first handoff

A phone can review PRs, manage issues, upload small GLBs and test the preview. Blender rigging, texture baking and large asset-pack inspection need a desktop/laptop. If working phone-only:
1. Download only selected GLB files and their licence files.
2. Upload individual optimized files through GitHub mobile/web; do not upload entire archives.
3. Keep each model small and include its licence.
4. Let GitHub Actions validate code and build.
5. Test the actual preview on the phone; desktop emulation is not a substitute for a phone GPU test.

## Integration sequence

- **A:** Import one female and one male rigged GLB; verify scale, skeleton, materials and clips in an isolated scene.
- **B:** Build Meilin, Yue and Sylva from different base meshes, hairstyles and outfit combinations—not colour swaps of one procedural body.
- **C:** Replace one landmark per region with authored architecture and blend PBR materials per biome.
- **D:** Add region streaming, LODs, texture compression and adaptive quality presets.
- **E:** Expand the asset set only after desktop and real-phone visual/performance captures pass.

Free licences do not guarantee a coherent art direction. Curate one visual style before adding large numbers of props.
