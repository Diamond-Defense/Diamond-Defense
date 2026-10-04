# Shared play-animation contract — version 2

This is the Phase 02 stability checkpoint for Phase 03. The contract lives in `src/lib/plays/{board,segments,animation,field,throws}.js`. It contains structured baseball data, pure compilation/snapshots, and a playback controller. Editor selection, DOM elements, database rows, and account state are not part of it.

## Persisted representation

A Board has `version: 2`, nine defender starts, optional runner starts keyed by `batter`, `first`, `second`, or `third`, `movements`, an optional batted ball, and primary/secondary defensive position sequences. Coordinates use the shared 3200 × 2133 native field space.

`movements[actor]` is an ordered array of segments:

```js
[
  { path: [{x: 1300, y: 1100}, {x: 1400, y: 900}], start: {event: 'contact'} },
  { path: [{x: 1400, y: 900}, {x: 1550, y: 850}], start: {event: 'throw_received', throwIndex: 1} }
]
```

A segment contains geometry and a start condition, never raw timestamps. Supported conditions are `contact`, `previous_movement`, `ball_fielded`, `throw_started`, and `throw_received`. The last two require a 1-based `throwIndex`. Primary legs precede secondary legs in the numbering. Missing start conditions default to contact for segment zero and previous movement for later segments.

Each path starts at the actor's initial position or preceding segment endpoint. Validation rejects discontinuity, unavailable throw references, unsupported versions, invalid coordinates, and excessive data. `reconcileSegments` explicitly replaces later initial coordinates while retaining the remainder of each curve. Actors have at most 12 segments; paths have 2–512 points and a Board has at most 20,000 points.

Optional `Situation.boardAnimation` stores `{version: 2, movements, battedBall}`. Situation starts, final targets/tolerances, outcomes, and expected throw sequences remain the training contract. Animation routes never participate in correctness checks.

## Compatibility and adapters

`upgradeBoard` clones version-1/2 input and returns a version-2 runtime Board. Legacy single paths receive contact conditions and consistent starts. Loading does not rewrite persisted Boards; explicit saving writes the current version.

`fromSituation` applies these fallbacks: legacy starts/targets produce direct paths; version-1 animation uses recorded single paths; version-2 animation retains all recorded segments and their events. Runner paths are inferred from structured outcomes when animation metadata is absent. Imported starts are reconciled, and the last defender endpoint follows the current correctness target so later target edits remain authoritative.

`toSituation` retains all animation segments, writes version-2 optional metadata, and derives defender targets only from final endpoints. Outcomes still pass through existing Situation validation. Existing tolerance values are retained on imports, with the normal default for newly authored defenders. Invalid instructional metadata encountered in normal playback falls back to direct paths; new server writes reject invalid metadata.

## Compilation, events, and concurrency

`compilePlay(board)` clones/upgrades, validates, measures paths once, and resolves a dependency graph. Its result contains `board`, `tracks`, `throws`, `events`, `steps`, `ballDuration`, and `duration`. It has no DOM or storage dependencies.

Contact is time zero. Batted-ball duration is inferred from type: ground ball 1400 ms, line drive 900 ms, fly ball 2300 ms, pop fly 3000 ms. No ball means fielding at time zero. Movement duration uses native path length × 1.5, clamped to 500–2400 ms; stationary movement has zero duration. These are rendering defaults, not persisted timing fields.

Every actor's segments are ordered. A segment waits for both its preceding segment and its selected event. Separate actors run independently and can overlap with ball flight and throws. Throws wait for fielding/preceding receipt and the sender/receiver movements triggered by earlier events. Movements triggered by that same throw can overlap its 700 ms flight. Missing references and dependency cycles fail compilation.

Throw origins are sampled at throw start; receivers are sampled at receipt. Arrow geometry trims around chips and offsets repeated routes. Only throws emit visible arrows. Path interpolation uses cached lengths and retains recorded curves.

Compiled events include initial, contact, ball fielded, movement complete, numbered throw start/receipt, and play complete. Events sort by time, then contact, fielded, movement complete, receipt, start, complete; initial precedes other time-zero events. Events at the same time share one step boundary. Event labels are presentation details; event IDs/types are reusable data.

## Runtime and snapshots

`frameAt(compiledPlay, time)` clamps time and returns `{time, positions, ball, scale, arrows, events}`. It samples every begun track, retains starts for future tracks, and includes occurred events. Sampling does not mutate authored or compiled data. The same time yields the same snapshot regardless of playback history. UI consumers own coordinate conversion and rendering; `paintThrowFrame` only renders shared arrow snapshots.

`createPlayback(play, onFrame, onState, options)` exposes play, pause, restart, seek, previous/next step via `step(direction)`, global speed, and dispose. Restart pauses and renders time zero. Play at completion starts again from zero. Seeking/stepping pauses and samples the requested boundary. Speed scales the whole play; there is no per-segment timing UI.

Options can inject clock/request/cancel functions, completion callback, and reduced motion. Reduced motion renders the final snapshot immediately; restart and event stepping remain available. The classic gameplay adapter injects its existing guide-aware clock. Disposal cancels the controller's scheduled frame. Playback never writes D1 or changes source Situation scoring data.

## Consumers and Phase 03 constraints

Coach Board uses this contract for previews and authoring validation. Normal Watch Solution imports current Situation data and uses the same tracks, events, ball, and throws; legacy review retains its phase-one hit/position flow. Verified sequence playback compiles current defender positions into shared throw tracks. Existing interactive quiz presentation still owns its initial hit/outcome workflow.

Phase 03 should unify authoring around these persisted structures and adapters. It should retain the shared token appearance, right-side responsive tools, position-based throw authoring, dedicated Save as Situation mode, and full-document navigation required by the classic gameplay runtime. It must not promote component state or render frames to persisted animation metadata.

Pure script tests verify loading, concurrency, runner segments, dependency validation, continuity, conversion, target authority, deterministic snapshots, controller speed/pause/reset/steps/reduced motion, and duplicate routes. Browser regression commands and verification status are recorded in `coach-board.md`.
