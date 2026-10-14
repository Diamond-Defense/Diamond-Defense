# Phase 05: Timing and undo

Implemented 2026-10-13 as a focused refinement of the existing sidebar. Presentation controls and the focused Save as Situation form retain their established behavior.

## Movement timing

Select a token and movement in **Movement**, then choose **Automatic** or **Custom duration** under Movement timing. Automatic uses the existing route-distance timing. Custom duration is displayed in seconds at **Normal playback speed**, including the four-times-slower teaching clock. The allowed range is 1–120 seconds at Normal speed (250–30000 animation milliseconds). Slow and Fast still scale the entire play consistently.

Durations are saved as the existing optional `durationMs` field and survive Board save/load and JSON transfer. Re-recording a segment preserves its chosen timing and start event. Switching back to Automatic removes the override. All curves and endpoints remain unchanged when timing changes. No timeline or new presentation buttons are introduced.

## Fielding timing

In **Ball**, the optional Ball fielder selection identifies who receives the batted ball. Automatic uses the first throw's origin, or a nearby movement endpoint when there are no throws. The Coach Board fielding event waits for both the ball's minimum flight time and the fielder's eligible pre-fielding route. The hit animation spans that interval, and fielded-triggered movements and throws follow the resulting event.

Routes beginning at ball-fielded or later are excluded from arrival dependencies, preventing a circular fielding schedule. A route whose endpoint is away from the ball, a fielder with only post-fielding movements, or an explicit fielder that differs from the first throw origin produces guidance in Ball tools. These are teaching warnings rather than restrictions on saving incomplete Boards. A Board with no identifiable fielder retains its ball-type flight timing.

This is a teaching animation, not a collision/physics simulation. Coaches should place the receiving route endpoint at the ball destination. Endpoint proximity allows 100 native field units for chip/ball overlap. Normal app solution playback retains its existing fielding and distance-based timing.

## Undo and redo

Undo and Redo appear in the editing sidebar and restore local Board data and outcome-form values. History includes starting positions, runner occupancy, movements, timing/start events, ball settings, throws, automatic-running overrides, title and outcome edits. Pointer drags are one change; cancelled drags restore the prior draft. Text entry is grouped until leaving the field.

History retains up to 50 snapshots. An edit after Undo clears the abandoned redo branch. Opening another Board, importing a new draft, or publishing a Situation starts fresh history. Playback, focus, tool selection and presentation do not create edits. Undo pauses playback when necessary. Normal browser text undo continues to work inside text controls; outside form controls use Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z or Ctrl+Y.

Save Board does not reset local history or roll back persisted records: undoing a saved edit makes the local draft dirty, and Save Board updates that same record using its current server revision. Deleting a saved record, archiving a Situation and publishing are server actions, not undoable local edits. History is not autosave and does not survive a reload.

## Verification

`npm run check`: no errors or warnings. `npm run test:scripts`: 81 passing tests. Focused browser checks: 12 passing tests covering timing persistence/fielding, undo/redo/deletion/drag grouping/server revisions, presentation, running and JSON transfer. The browser harness also completes the production build; its existing chunk-size warning remains.

```sh
npx playwright test tests/board-refinements.spec.js tests/presentation.spec.js tests/board-transfer.spec.js
```

For the broader local coaching regression:

```sh
npx playwright test tests/coach-board.spec.js tests/coaching-checkpoint.spec.js tests/situation-authoring.spec.js tests/play-library.spec.js
```

## Throw fluidity

Coach Board throws now use steady flight over 350 animation milliseconds (1.4 seconds at Normal teaching speed), instead of 700 milliseconds with a prolonged ease-out. Player movement and pitch/hit timings remain unchanged. Throw-dependent movements and subsequent relays follow the updated receipt events. Normal app throw timing and easing remain unchanged.
