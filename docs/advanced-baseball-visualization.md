# Phase 7: Advanced Baseball Visualization

Coach Board preview and Presentation Mode use Play/Pause, Previous/Next Step, and Restart/Replay to inspect the shared starting, event, and final snapshots. Separate Starting Position and Final Position shortcuts were removed to simplify the controls. No separate authored states or timing model are introduced.

Focus allows selecting multiple defensive positions with checkboxes, or resetting to All Players. Selected tokens receive outlines, while the other defenders remain visible with reduced emphasis. Labels always remain visible. Focus remains selected across movement segments and event steps; opening another play resets it.

Show Targets is off by default. Dashed, labeled ghost markers use the shared engine's final defender positions, including all movement segments. With player focus selected, only the selected players’ targets appear. Targets have no route arrows and do not change authored geometry or correctness rules.

These tools are available only in the staff Coach Board and Presentation views. Player Mode, scoring, tries, and answer-reveal behavior remain unchanged. Event stepping and restart require no animation, and Play retains the controller's reduced-motion behavior. Controls wrap on smaller screens, while focus and targets use outlines/dashes and text rather than color alone.

Responsibility overlays are deferred: authored movements and throws describe involvement, but do not consistently encode a defender's coaching responsibility. Additional event menus and ball-holder emphasis are also deferred; existing event steps, screen-reader event announcements, ball token, and active throw arrows already support that inspection without more field clutter. Batted-ball paths remain lines without arrowheads; arrows represent throws only.

Validation: `npm run check`, `npm run test:scripts`, and `npx playwright test tests/presentation.spec.js`. For broader local regression, run `npx playwright test tests/coach-board.spec.js tests/play-library.spec.js tests/situation-authoring.spec.js tests/coaching-checkpoint.spec.js`.

The batted-ball line is hidden in the starting state, appears once playback or event stepping advances, and disappears at the shared ball-fielded event. Stepping back into the hit restores it. Replay hides it again. Event descriptions are announced to screen readers but do not occupy visible layout, preventing long simultaneous-event lists from resizing the presentation field. The duplicate Animate button has been removed.

Show Movement Paths is optional and off by default. White dotted trails with dark shadow and no arrowheads show only movement already completed, clipped using the shared engine’s distance-based progress. Unstarted segments have no trail, and Replay clears trails. Completed trails remain for discussion; stepping backward shortens them. Focus filters the displayed paths; All Players displays all defender paths. This deliberately refines the original restriction on route traces based on coaching feedback. Player Mode remains unchanged. The displayed ball shifts slightly beside overlapping offensive tokens so their numbers remain readable; its shared animation coordinates and event timing are unchanged.
