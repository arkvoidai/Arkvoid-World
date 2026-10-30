# Visible experience rework

This change set targets the problems that are visible in the actual running world, not another layer of world metadata.

## Entry and re-entry

A first-time visitor sees the live Home Reach behind the gate overlay. Starting a new guest journey gives the landscape a short arrival rail before character creation. Existing guest/member sessions without a saved character return to the gate on a browser reopen; the Begin action reuses that session. A saved character still follows the arrival rail into the world. Skipping the new-character arrival rail opens character creation instead of incorrectly entering the world.

## Movement

The third-person camera used to recenter behind the character after two seconds of movement without look input. Because movement was interpreted relative to camera yaw, that recentering changed the direction basis underneath a held joystick. The player could trace a curved path while holding one direction. Camera recentering now occurs only after movement is released, and is smoothed to avoid a sudden snap.

## Character appearance

The default Wanderer now has visible facial structure: eyes with irises and pupils, brow lines, a nose, cheeks, ears and a mouth, plus a dark hairline and side locks. The default Traveller no longer hides the whole face behind a gauze cylinder. The face is assembled from merged procedural meshes to control draw-call growth. Character cloth colours now use jade, slate, warm porcelain, muted brass and candlelight rather than the former high-saturation combination.

These models are still procedural geometry. They are not being represented as final photorealistic character assets.

## Foliage and landscape

The leaf atlas has been redrawn with species-specific veined leaf silhouettes and a predominantly natural green palette. Broadleaf cards are smaller and more numerous to reduce the paper-cutout appearance. Falling leaves use fewer, muted leaves and a tapered shader silhouette. Four mountain silhouette bands and the distant falls are positioned much closer to Home Reach to make the starting island feel framed by a landscape.

## Verification

The PR includes tests for camera stability while movement is held, straight-line camera-relative movement, guest re-entry routing, face meshes on each avatar form, natural foliage tint range and the presence of nearby mountain geometry.

The CI job is expected to run typecheck, tests and a production build. The PR will report the actual result; screenshots, visual captures at the requested world times, and real phone/desktop frame-time measurements are not claimed by source-code tests.
