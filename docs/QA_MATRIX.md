# Responsive QA matrix

## Viewports

Every cell is **NOT RUN** in this branch because no browser automation session was available during repository changes. This matrix is the required evidence checklist; do not mark cells PASS without attached screenshots and a recorded run.

| Viewport | Gate | Awakening | World | Sheet | Dialogue | Overflow / target / overlap / detents |
|---|---|---|---|---|---|---|
| 360×640 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 390×844 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 412×915 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 844×390 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 768×1024 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 1024×768 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 1366×768 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 1440×900 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 1920×1080 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 2560×1440 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |

## Required screenshots per viewport

- Gate / poster fallback
- Awakening / preview character
- World / normal HUD and movement
- Sheet / all detents reachable
- Dialogue / focused text input with keyboard visible

Store screenshots and Playwright traces as CI artifacts named with viewport and state, for example `390x844-gate.png` and `390x844-dialogue.png`.

## Automated assertions still required

- Document has no horizontal overflow.
- All interactive targets are at least 44 CSS px.
- Text is at least 12 CSS px unless it is a non-essential decorative label.
- Orb, contextual pill and joystick avoid safe-area insets and thumb zones.
- Sheet detents can each be reached and can be closed.
- Focusing an input pauses the engine; blur resumes it.
- Hiding the tab pauses the engine; showing the tab resumes it.
- Reduced motion disables non-essential motion.
- Console errors and warnings fail the test; any allowlist must be narrow, documented and tied to a specific browser/WebGL limitation.

## Coverage notes

The repository's existing unit/invariant test command is now glob-based for `src/**/*.test.ts`. This file does not claim a Playwright suite exists: browser automation dependency, cross-browser WebGL test harness, screenshot capture and artifact upload still need to be added and executed.
