# Coach Board v1

Implemented on `coach-white-board`. The supplied file 00 is the roadmap, not a separate implementation phase. This feature implements its first core phase (file 01). Phase 02 is now implemented as described below; Phases 03–07 remain out of scope.

## Use

Sign in as a coach or administrator and choose **Coach Board** in the header. The `/coach-board` route and Board API require an authenticated staff account with no pending password change.

- **Setup:** drag defenders and choose runners/outs. Dragging only edits starts; changing a token’s start clears its old route so it can be recorded again.
- **Movement:** drag the actual route. A curved drag stays curved. Select a token to see whether movement is recorded; drag again to replace it or use Clear Movement.
- **Ball:** choose ground ball, line drive, fly ball, or pop fly, then tap the destination.
- **Throws:** tap defensive position buttons or field tokens in order, for example `SS → 2B → 1B`. Undo Last Throw and Clear Throws correct the sequence. An optional secondary sequence is retained.
- **Playback:** Play/Pause/Restart, event-boundary Previous/Next Step, and 0.5×/1×/2× speed. Movement routes are hidden; arrows mean throws only.

Save incomplete Boards independently of Situations. Saved Boards belong to their author, including administrator Boards. Load Situation creates an independent Board without modifying its source. Legacy Situations receive direct paths from starting positions to correct targets and inferred batted-ball types; structured runner outcomes provide base-running paths when available.

Save as Situation is available with the existing publishing permission. Choose and confirm play/runner outcomes first. Missing ball/throw data blocks conversion. The existing Situation repository performs final outcome validation (including forced runners, occupied bases, and outs). Conversion creates a new Situation; final defender coordinates become correctness targets, while animation paths remain optional teaching metadata. Existing Player Mode continues using target tolerance and throw sequence verification.

## Data and animation boundaries

`src/lib/plays/board.js` contains the version-1 in-memory model, validation, bounded pointer sampling with gentle smoothing, and Situation adapters. Geometry uses the existing 3200 × 2133 native field space. A movement is an array with one `{path: [{x,y}, …]}` segment per token, leaving a non-destructive extension point for future multiple segments. Coordinates contain no timestamps.

`src/lib/plays/animation.js` compiles the Board into independent movement tracks, batted-ball duration, throw legs, and inferred step boundaries. All defender/runner tracks start at contact concurrently with the ball. Throws begin once the ball and movement tracks finish. The engine has no component or D1 dependency. It exposes pure time-indexed frames plus a reusable requestAnimationFrame controller with pause, reset, seek, speed, and disposal. Authored state is cloned and stays separate from current render state.

`field.js` supplies the original field coordinates to both legacy gameplay and Coach Board. `throws.js` shares the existing trimmed strategy-arrow geometry with both consumers; the Board also uses the existing strategy-arrow CSS and defender chip styling. Existing normal Situation animation remains in place.

`/api/boards` persists JSON with an explicit schema version and optimistic revisions. Staff authorization and same-origin write checks use existing server helpers. Every read/update is scoped to the current owner. Invalid coordinates, unknown tokens/types, oversize paths, and malformed sequences are rejected; incomplete Boards remain valid. The UI does not bind directly to D1 rows. The existing small-screen gameplay gate is scoped to pages containing that gate; Coach Board remains available on phones.

## Migration

New migration: `migrations/0029_coach_boards.sql` (Board table and owner/update index).

```sh
npm run db:migrate:local
npm run db:migrate:preview
npm run db:migrate:production
```

Apply to the selected environment before using the feature there. Preview/production commands affect remote databases and are not executed as part of local feature testing. The Playwright harness applies migrations automatically to its isolated test database.

## Validation

Script tests cover model validation, legacy import, curved geometry, concurrent tracks, all hit-type durations, reset invariants, and conversion metadata. Playwright tests cover storage/authentication/revisions, owner isolation, desktop authoring/reload/conversion, opening the converted Situation in the existing field, and Chromium touch runner authoring in a 390px viewport. The existing suite checks legacy field, verification, throws, accounts, and Situation behavior.

## Intentional v1 limits

One continuous route per token; no route control-point editor, event authoring, hold/wait, live sharing, generic drawing, 3D flight, or manual timeline. Fly balls and pop flies use restrained scale/hang-time cues. Playback steps use inferred contact/fielded/throw-received boundaries. Runners are selected by starting base (plus optional batter), not by roster identity. Setup movement invalidates the affected route. Conversion uses the standard default tolerance for newly authored defenders and retains source tolerance on imported Situations. Unsaved edits are not autosaved; save before switching Boards or leaving the page.

## Verification results

- `npm run check`: zero errors/warnings.
- `npm run test:scripts`: 38 passed.
- `npx playwright test`: 72 passed, four failed. All four failures also reproduce in a separate untouched checkout of the starting commit: coach-review discard-button visibility (`app.spec.js`), season member creation (`database-api.spec.js`), inactive-assignment deletion (`situation-deletion-api.spec.js`), and retired staff-label identity (`situation-identity.spec.ts`).
- All four Coach Board integration tests passed in the full run, including real Chromium touch input and owner isolation.
- The production build completed through the Playwright harness; its existing large-chunk warning remains.
- Local migration status is current; the `coach_boards` table and migration record were verified. Remote databases were not modified.

Changed files: `src/routes/coach-board/+page.svelte`, `src/routes/coach-board/+page.server.ts`, `src/routes/api/boards/+server.ts`, `src/lib/plays/{board,animation,field,throws}.js`, `src/lib/legacy/loadRuntime.ts`, `src/features/player-coach.js`, `src/game/engine.js`, `src/styles/app.css`, `migrations/0029_coach_boards.sql`, `scripts/coach-board.test.mjs`, `tests/coach-board.spec.js`, and this document.

## Token appearance alignment

Coach Board and gameplay now share the current defender/offense CSS, rather than the historical role-color styles. The Board ball uses the same CSS white dot/black outline as gameplay. `token-presentation.js` supplies shared field-relative chip/ball sizing, fielding numbers, and unique two-digit offense numbers to both renderers. Board offense numbers persist with a saved Board; older saved Boards receive numbers when loaded. Board runners retain pointer interaction for editing.

The appearance update passed `npm run check` and the script suite. Browser verification is delegated to the user with `npx playwright test tests/coach-board.spec.js`; the full regression suite was not rerun for this appearance update.

## Workspace usability update

Desktop tools now occupy one right-side panel, with playback controls pinned near its top. The field and panel stay alongside each other; library loading and Situation conversion are collapsible sections. On narrow screens the same panel appears above the field. Throw sequences are authored with position buttons or defender taps, eliminating text parsing; coaches can switch primary/secondary sequences, undo the last step, or clear the sequence.

The Coach Board entry uses a standard navigation button. Entry and Back to field use full document navigation because gameplay is a classic-script runtime with document-level declarations and listeners. This prevents client-side route remounts from attempting to initialize the runtime again in the same document. The browser regression test now exercises these actual navigation controls and checks restored account/header state.

For this update, browser verification is delegated to the user: `npx playwright test tests/coach-board.spec.js`.

## Focused Situation saving

The redundant Playback authoring tab has been removed; playback controls remain available while editing. Save as Situation is now a mode button immediately below the Board save actions. It pauses playback and replaces playback, authoring, and library controls with the conversion form. Back to Board Tools restores the editing panel without discarding the Board or entered outcomes. Create Situation publishes through the same validated conversion/API flow.


## Phase 02: segmented movement and shared playback

Movement mode now provides a numbered segment selector, Add Movement, Delete Movement, and a baseball-event start choice. Drag to record or replace the selected segment. Each segment starts at the preceding endpoint. Re-recording or deletion reconnects later initial points while retaining their remaining curves; the status message asks the coach to inspect the result. Clear Movement removes the actor's entire route.

Start choices are contact, after previous movement, ball fielded, and the start/receipt of a numbered throw. Primary then secondary sequences define throw numbering. Removing a referenced throw requires updating its movement events before saving. Circular event dependencies are rejected with an actionable message.

Boards and Situation animation metadata now use version 2. Version-1 Boards are upgraded in memory; reads do not rewrite stored JSON. All segments survive Board/Situation conversion. Correctness targets use the final segment endpoint. If the existing Situation Builder subsequently edits a target, that target remains authoritative when loading its instructional animation.

Coach Board, normal Watch Solution, and verified sequence throws now consume `compilePlay`/`frameAt`/`createPlayback`. Rich Situation solution review includes authored movement, ball flight, and throws. Legacy phase-one solution review retains its hit/position demonstration; verified throws use the shared engine separately. The interactive quiz's initial hit/outcome presentation remains part of its existing training flow. Scoring, attempts, target tolerances, and sequence verification have not been changed.

See [the stable animation contract](play-animation-contract.md) before Phase 03. This supersedes the v1 one-path/timing descriptions above. No additional D1 migration is required: optional animation metadata remains in existing Situation JSON and Boards remain in the Phase 01 table.

Limits: 12 segments per actor, 512 points per segment, 20,000 points per Board, and a 1 MB Board request limit. Timings are inferred; no manual timeline, explicit hold duration, or path-point editing is provided. Step boundaries include ball fielding, movement completion, throw start/receipt, and play completion; simultaneous events share a snapshot. Reduced motion displays the final state immediately and keeps step/restart controls usable.

Phase 02 validation: `npm run check` passes with zero errors/warnings; `npm run test:scripts` passes all 46 tests; the production build passes (existing large-chunk warning remains). Script tests cover legacy loading, event dependencies, concurrency, runners, route continuity, conversion, reset/steps/speed/reduced motion, and repeated throw arrows. Browser verification is delegated to the user with:

```sh
npx playwright test tests/coach-board.spec.js tests/app.spec.js
```

The new browser cases cover multi-segment authoring, re-recording, deletion, event persistence, version-1 storage compatibility, invalid throw references, segmented normal solution review, and reduced motion. Existing app cases exercise solution review and verified throws. The full suite's previously established four baseline failures are recorded above; Phase 02 browser results are pending.

## Phase 02 reported-failure follow-up

The focused browser run for the three user-reported failures now passes (3/3). Segmented authoring uses the combobox's accessible name rather than an exact enclosing-label lookup. The normal solution test waits for the classic runtime's loaded marker before awaiting initialization. Returning from Player Preview now restores the coach's proposal editor pane and preserves its dirty state/baseline, fixing the previously recorded coach-review discard visibility failure. The remaining historical full-suite baseline failures have not been rerun in this follow-up. All 46 script tests pass; the type check is clean.

## Phase 03: unified Situation authoring

Situation Builder offers Edit in Coach Board, carrying the same unsaved Situation draft and preserving key, revision, metadata, target notes/tolerances, outcomes, secondary throws, and animation. The Board editor no longer includes a Situation Details shortcut. The refined right-side panel and focused Save as Situation form remain. Edit Situation links to a published record; Load Situation continues to create an independent Board. Conversion creates one new Situation, then joins the unified editing workflow.

Linked publication updates the same record with an optimistic revision. New Builder drafts create their first record only on explicit publication. Coaches without publishing permission submit a proposal through the existing review flow. Successful approval retains animation/secondary sequences. Dirty navigation guards protect replacement/exit, and per-user session storage carries drafts between full-document navigations without intermediate records.

Server publication and submission share validation. Shared play validation is used by the Builder and Board; target coaching notes are optional warnings, while geometry/tolerances/outcomes remain validated. Recurring sequence positions are supported as meaningful baseball throws. Unsupported animation versions and stale revisions are rejected.

See [the canonical authoring contract](situation-authoring-contract.md) before Phase 04. Phase 03 adds no migration. New core files are `src/lib/plays/authoring.js`, `scripts/situation-authoring.test.mjs`, and `tests/situation-authoring.spec.js`; adapters, legacy/editor integration, repository validation/proposal fields, and the Board page are updated.

Validation: all 52 script tests and the type check pass. All 11 focused Board/authoring browser tests pass; the existing coach preview/proposal regression also passed in a separate focused run. The harness also completes the production build; the existing large-chunk warning remains. The broader app/database suite is delegated to the user:

```sh
npx playwright test tests/situation-authoring.spec.js tests/coach-board.spec.js tests/app.spec.js
# Optional full regression suite:
npx playwright test
```

## Board name uniqueness

The Board API rejects new duplicate names and conflicting renames within the same owner's library (409), ignoring capitalization and surrounding spaces through SQLite's name comparison. The check is part of each atomic write, so concurrent requests cannot create duplicate names. Saving a loaded Board under its current name still updates that Board using its revision. Different owners can use the same name.

Existing duplicates are preserved; their library labels include a short Board ID so each can be loaded and renamed. Existing duplicate records can still be updated without renaming. No migration or destructive cleanup is required. Validation: the three focused storage/owner/name API tests pass, all 52 script tests pass, the type check is clean, and the browser harness production build passes.

## Phase 04: Coach Presentation Mode

Present is available from the Board sidebar and Situation Builder toolbar. It opens a field-focused teaching view with large Play/Pause, Previous/Next Step, Replay, whole-play speed controls, with labels always visible. Authoring chrome and field edits are disabled; the same engine, native coordinates, token appearance, and throw-only arrows remain in use. Exit restores the Board's authoring mode/segment selection or returns to the originating Situation Builder draft. Existing Save as Situation layout and workflow remain intact.

Presentation supports incomplete Boards and legacy/recorded/segmented Situations. Reduced motion displays the final snapshot immediately through Play while keeping step/reset controls. Simultaneous events share a deterministic snapshot and descriptive label. Presentation makes no database writes and adds no migration.

All 55 script tests pass and the type check is clean. Presentation plus existing Board tests passed (11/11), and the final touch/phone/read-only checks plus unified authoring tests passed (7/7). The production build completed through the browser harness. The full application suite is delegated to the user. See [the presentation guide and usage checkpoint](coach-presentation.md) before choosing Phase 05 versus Phase 06.

## Phase 06 library

Use **Browse Library** for server-filtered search, baseball filters, sorting, independent copies and safe deletion/archive. Coach Board opens the card library first. Cards present paused by default; Edit opens authoring tools. New Board is available in the library header. Quick-load selectors were removed. See [Board & Situation Library](play-library.md) for permissions, draft-copy behavior and the local migration command.

Teaching playback now runs four times slower at Normal speed, with Slow/Fast available. Labels always remain visible. Ball paths are drawn from the authored start to destination (ground balls dashed). Create new Boards from the library header; the Board editor no longer includes New Board or a Situation Details shortcut.

## Board pitch and optional early movement

Coach Board playback includes a pitch from the pitcher’s position to the authored contact point before the batted ball travels outwards. The hit line appears at contact, not during the pitch. Existing movement defaults remain at contact.

In Movement, record a route and choose **Before the pitch** for a lead or defensive adjustment, or **During the pitch** for movement concurrent with the delivery. Both options work for defenders and runners. Add subsequent routes from the preceding endpoint; their start event may be during the pitch, at contact, or a later baseball event. The pitch waits for all pre-pitch routes to finish. A pre-pitch route cannot depend on a preceding route that starts at contact or later; preview reports that circular ordering.

Newly drawn routes receive two smoothing passes with exact endpoints retained. Saved routes are not rewritten. These phases and the pitch animation are enabled only by Coach Board’s compiler option; normal situation playback retains its contact-first timeline.

## Automatic running

The batter is always included in Coach Board. In **Running**, choose Single, Double, Triple, Home Run or Out; suggested advances are one, two, three or four bases. Each runner’s destination can be changed independently, including Hold. Out depicts an attempted advance, not a simulated putout. Changes provide starting suggestions in Save as Situation, whose outcomes still require explicit review.

Any custom post-contact route takes precedence over automatic running for that runner. **Use automatic running** removes that runner’s custom post-contact routes while retaining earlier lead/delivery routes. When only early routes exist, automatic running begins at the runner’s position at contact and interrupts any ongoing delivery movement without snapping back. Generated tracks are never written over authored movements. The full base-running route visits intervening bases.

Settings save with the Board. Imported Situations retain their authored routes and known runner destinations. Legacy Boards receive default single advances for runners without custom routes. Normal app playback does not generate these automatic routes.

## Portable Board files

Use **Import Board** in the library to open a `.board.json` file as a new unsaved draft. Review the name and routes, then **Save Board**. Imports never overwrite an existing Board or publish a Situation. Existing duplicate-name protections still apply at save. Malformed, oversized (over 1 MB), unsupported-version, invalid-route and circular-timing files are rejected without changing the current draft.

**Export Board** in editing tools downloads the current draft, including unsaved edits, running settings and outcome metadata. It does not mark the draft saved. Files use `format: "diamond-defence-coach-board"`, envelope `version: 1`, and a versioned `board` payload. Account/record identities, revisions and links to a source Situation are excluded. Only play fields are transferred.

See [wheel-play example](examples/wheel-play.md) and its [importable JSON](examples/wheel-play.board.json).
