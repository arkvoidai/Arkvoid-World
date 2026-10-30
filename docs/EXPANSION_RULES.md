1. Preserve behaviour and tests; extend modules, keep public APIs, migrate callers when replacing internals.
2. UI honesty: no explanatory text on screen, no roadmap or "coming soon", unbuilt features have no UI, at most the Orb plus one contextual pill plus the touch joystick as persistent controls.
3. Engine rules: React never renders per frame; no allocations in the frame loop; every resource owner has dispose(); deterministic generation from seeds; analytic collision stays the collision model; mobile is first class.
4. Every spec ships: unit tests in the repository's existing test runner; a dev-only inspection tool behind a query flag; a budget table; an update to docs/STATE.md; a PR description with screenshots and measured numbers.
5. Honesty: no invented metrics; measured numbers only; every third-party asset is recorded in docs/ASSET_LICENSES.md with source and licence.
6. Performance budgets (unless a spec states stricter): desktop 60 fps, phones stable 30 or more; p95 frame time at most 25 ms desktop and 40 ms phone; draw calls at most 220 desktop and 140 phone; non-streaming JS heap growth zero over 10 minutes of play; no frame hitch above 50 ms caused by loading.
7. No spec may print other specs' names, numbers or plans in the UI or console.
