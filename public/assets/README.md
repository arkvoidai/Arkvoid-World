# Runtime assets

Place optimized, licensed runtime assets here. Keep source .blend files and raw pack archives out of the deployed bundle.

- `characters/<id>/model.glb`
- `world/<region-id>/environment.glb`
- `world/<region-id>/textures/*.ktx2`
- `licenses/<pack>/LICENSE.txt`

Retain the original licence for every imported pack and document it in `docs/ASSET_PIPELINE.md` or `docs/ASSET_CREDITS.md`. Prefer compressed GLB/KTX2 files, mobile LODs and shared materials. Never commit API keys or credentials.
