# Expanded world and living residents

## Playable regions

The world now has three separate large-scale region surfaces beyond Home Reach:

- **Veiled Peaks**: high-altitude ridge terrain, Cloud-Ring Monastery, Silver Falls and Three-Crowned Overlook.
- **Capital Valley**: rolling river plain, pagoda landmarks, Imperial Plaza, Riverfront Quarter and Nine-Arch Bridge.
- **Primordial Forest**: dense canopy, the World Tree, Moonfall Cascade and Root Sanctuary.

The surfaces are generated from deterministic region definitions. Collision uses the same analytic height function as the rendered terrain, and the region edge is clamped so the player cannot fall into an undefined world surface. The world atlas is an overview and fast-travel interface; physical gates are also placed in Home Reach and at each region.

## Residents and conversation

Meilin, Yue and Sylva are named residents with distinct form, robe palette, long-hair silhouette and ornaments. Interacting with one opens the dialogue panel.

The `mistral-npc` Supabase Edge Function:
- verifies the signed-in user from their JWT;
- looks up the resident profile from `public.npcs`;
- enforces a 24-call per-user daily cap using `public.llm_take`;
- retrieves only that user's saved memories for that resident;
- calls Mistral Small from the server;
- saves the exchange to `public.npc_memories`.

The Mistral key is never exposed in client code. Add it in Supabase Dashboard → Project Settings → Edge Functions → Secrets:

```text
MISTRAL_API_KEY=your_mistral_api_key
```

Until the secret is configured, the Edge Function returns a clear configuration error and the dialogue panel displays that the service is waiting for its key.

## Current visual scope

The continents and residents are playable procedural prototypes. The geometry is intentionally distinct by biome and landmark, but it is not a substitute for final scanned/hand-authored environment assets, rigged high-fidelity character models, facial performance capture, or a full schedule-driven NPC simulation. Those are subsequent art and simulation milestones.
