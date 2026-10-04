# Coach Presentation Mode — Phase 04

Choose **Present** in Coach Board or Situation Builder. This is a teaching view over the current play, including unsaved drafts. It does not publish, save, or convert a Board. Staff access follows the existing Board/Builder authorization.

## Teaching controls

The field occupies the browser viewport with authoring/navigation chrome hidden. Presentation does not depend on browser fullscreen. The same responsive field, token sizing/styling, batted ball, and throw renderer remain in use. No movement arrows or editing controls are added.

Previous Step and Next Step seek shared engine event boundaries. The label describes the events at that snapshot: fielding, an actor's completed movement, numbered throw start/receipt, and final state. Events that happen simultaneously share one snapshot and label. Starting alignment and contact share time zero. Stepping pauses continuous playback; Play resumes from that snapshot.

Play/Pause freezes/resumes the same playback controller. Replay pauses and restores the authored initial state; choose Play to run again. Normal teaching playback runs at one quarter of the previous speed in both Watch Solution and Coach Board. Slow/Normal/Fast apply 0.5×/1×/2× to this teaching baseline. Defensive position labels are always visible; the visibility toggle and hiding logic were removed. Offensive chip numbers remain consistent with gameplay. Playback state is not persisted.

Controls are at least 56 pixels high. Left/Right arrows step, R resets, and Escape exits. Space toggles playback when focus is on the field/page; focused buttons, checkboxes, and the speed selector retain their normal keyboard behavior. Focus moves to Exit on entry and returns to Present on Board exit.

Reduced motion uses the established final-snapshot fallback for Play, while Replay and event stepping remain usable. Incomplete Boards can present their valid structured contents without Situation conversion/validation. Invalid Board geometry/event dependencies still produce actionable errors before entry.

## Exit and source preservation

Entering from Coach Board hides its refined sidebar; exit restores the prior authoring mode and segment selection. It leaves title, geometry, metadata, save identities/revisions, outcomes, and dirty state unchanged. Save as Situation keeps its existing focused form; Present is hidden while that form is active.

Entering from Situation Builder uses the existing per-user, per-tab draft handoff with destination `present`. Exiting transfers the original Situation draft/baseline/rationale back to its originating Details editor. Presenting a legacy Situation does not add persisted animation metadata, create another record, or mark it published. The ordinary browser unload warning still protects pending drafts.

## Implementation and verification

The Board page reuses the same field and its `compilePlay`/`createPlayback` controller. There is only one active controller; authoring preview is disposed on presentation entry and presentation is disposed on exit. `src/lib/plays/presentation.js` only formats shared event snapshots. It introduces no new timing, animation schema, or database representation. The legacy/direct, recorded-path, and segmented fallbacks remain those documented in `play-animation-contract.md` and `situation-authoring-contract.md`.

Changed files for this phase: `src/routes/coach-board/+page.svelte`, `src/admin/admin-tools.js`, `index.html`, new `src/lib/plays/presentation.js`, new `scripts/presentation.test.mjs`, new `tests/presentation.spec.js`, the converted-Board loop in `tests/coach-board.spec.js`, and documentation. No migration is needed.

The script suite passes 58 tests; type checking is clean. Focused browser runs pass Presentation, existing Board, and unified authoring cases. Tests check deterministic curved/segmented snapshots, concurrent actors, throw-only arrows, mixed stepping/playback, pause freezing, reset, always-visible labels, read-only field dragging, storage nonmutation, incomplete content, legacy Builder return, reduced motion, actual touch taps, and tablet/phone fit. Tablet and phone screenshots were inspected. The build passes through the browser harness with the existing large-chunk warning.

Run broader regression locally:

```sh
npx playwright test tests/presentation.spec.js tests/coach-board.spec.js tests/situation-authoring.spec.js tests/app.spec.js
```

## Usage checkpoint before the next feature phase

The follow-up [coaching usage checkpoint](coaching-usage-checkpoint.md) records three additional passing integration scenarios, concrete preparation gaps, and the remaining hands-on coaching check before selecting Phase 05 or 06.

The automated Create → Animate → Integrate → Present loop now includes Board recording, playback, saving, Situation conversion, event stepping in Presentation, exit, and existing field loading. A segmented ground-ball/SS → 2B → 1B demonstration, legacy Situation playback, and incomplete Board teaching were exercised. These are automated coaching scenarios, not evidence of a live team teaching session.

Observed during implementation:

- Several events can coincide, such as a backup movement ending while another movement ends. Presenting only the last event would hide useful context; the mode displays the grouped events instead.
- Long names can crowd phone exit controls. The heading now wraps and the field/controls fit the viewport; touch controls keep their minimum height.
- Presentation from Situation Builder must restore its exact draft rather than round-trip the derived Board projection. Returning the original draft prevents adding animation metadata just by presenting a legacy play.
- The user previously encountered identical Untitled Board names in the library; owner-scoped name checks and distinguishable legacy entries already address that observed issue.

Before choosing Phase 05 or 06, use a small set of actual team plays: a ground-ball double play with backup, an outfield hit with cutoff and runner advance, and a caught fly with tag-up outcomes. Check whether segment/event authoring slows preparation, or whether finding/reusing plays is the larger obstacle. Record concrete examples and choose animation refinements (05) or library management (06) from that experience; Phase 05 does not automatically have to come first.

Intentional limits: no annotations, freehand, remote controls, audience synchronization, manual timeline, or browser fullscreen button. Portrait displays leave some vertical space because the field retains its native aspect ratio. Presentation does not add future ghost-target/focus visualization features.

## Library entry

Selecting a library card opens Presentation paused at its starting alignment. Back to Library returns to selection; the card’s Edit action opens the Board/Situation tools. Presentation from an existing editor retains its Exit Presentation behavior; Situation Builder handoffs still restore their originating draft. See [library navigation](play-library.md).
