# Asset Licenses and Provenance

Only assets with explicit permission for Arkvoid's intended commercial use may enter the production asset manifest. "Free download" is not a licence.

## Approved source policy

| Source | Default policy | Permitted use in this repository |
| :--- | :--- | :--- |
| [Poly Haven](https://polyhaven.com/) | CC0 | Use CC0 assets; retain the asset page and exact file provenance. |
| [ambientCG](https://ambientcg.com/) | CC0 | Use CC0 assets; retain the asset page and exact file provenance. |
| [Quaternius](https://quaternius.com/) | Pack-specific terms | Accept only after verifying the exact pack licence and commercial-use rights. |
| [Kenney](https://kenney.nl/assets) | Pack-specific terms | Accept only after verifying the exact pack licence and attribution requirements. |
| [Blender](https://www.blender.org/) | GPL software | Blender is a creation tool, not an asset licence. Imported content keeps its own licence. |

Do not assume a marketplace-wide licence. Reject NC, ND, editorial-only, unclear or missing licences, scraped/ripped game assets and assets whose redistribution terms are incompatible with web delivery.

## Required record for every production asset

| Field | Required value |
| :--- | :--- |
| Asset ID | Stable unique ID used by the manifest |
| Runtime path | Exact path committed to the repository or served by the asset CDN |
| Asset name / creator | Original title and creator |
| Source page | Direct page for the specific asset, not just the marketplace homepage |
| Licence | Exact licence name and version |
| Licence URL | Direct licence text or terms |
| Commercial use | Explicit yes, with evidence |
| Attribution | Exact required attribution, or "None required" |
| Modifications | Whether the asset was modified |
| Acquired | Date acquired |
| Original hash | SHA-256 of downloaded original |
| Runtime export | GLB/texture/audio format, compression and resolution |
| Intended use | Environment, architecture, vegetation, character, creature, material or audio |

## Current inventory

No individual downloaded model, character, vegetation or audio asset is approved by this document alone. The previous entries below identify texture categories and a possible source, but do not identify exact files or prove which files are currently present in the repository. Verify every file against the required record before release.

| Category / slot | Candidate source | Approval status |
| :--- | :--- | :--- |
| bark | Poly Haven | Source category only; exact asset record required |
| grass | Poly Haven | Source category only; exact asset record required |
| moss | Poly Haven | Source category only; exact asset record required |
| path | Poly Haven | Source category only; exact asset record required |
| plaster | Poly Haven | Source category only; exact asset record required |
| rock | Poly Haven | Source category only; exact asset record required |
| roof | Poly Haven | Source category only; exact asset record required |
| stone | Poly Haven | Source category only; exact asset record required |
| timber | Poly Haven | Source category only; exact asset record required |

## Review checklist

- [ ] Exact source page recorded.
- [ ] Exact licence/version and licence URL recorded.
- [ ] Commercial use and web redistribution verified.
- [ ] Attribution requirements recorded and included where required.
- [ ] Original file hash recorded.
- [ ] Runtime export optimised and visually inspected.
- [ ] No hidden dependencies, missing textures or external hotlinks.
- [ ] Asset appears in the typed manifest and passes asset validation.
