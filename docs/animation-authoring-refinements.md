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

## S01 reference pilot

Reference image #1 maps to `BD-01` / `S01`, locally named “Line Drive to LF — Bases Empty”. Its authored line drive is explicitly fielded on the ground by LF, followed by LF → SS → 2B. Coverage and backups begin at contact. The batter stops at first. Spatial scoring targets and animation route endpoints were reconciled for this pilot only.

An optional `battedBall.bounce` object controls the landing hop with `durationMs` (100–2000 animation milliseconds), `distance` (1–400 native field units), and `height` (1–100 native field units). Without it, existing bounce defaults remain unchanged. Ground possession waits until the authored bounce finishes, plus a short gathering interval, and until the fielder arrives. This metadata survives Board transfer and situation saves; it currently has no dedicated sidebar controls. S01 uses 350 ms, 150 units, and 26 units respectively. These are teaching timings and a selected routine-single branch, not timing measurements from the source photo.

Migration `0042_s01_ground_fielding_animation.sql` updates the global record and snapshots its new revision. Existing versions, assigned revision snapshots, and independently edited library copies remain preserved. Fresh seed files carry the same animation.

## S02 reference follow-up

Reference image #2 maps to `BD-02` / `S02`, locally named “Line Drive to CF — Bases Empty”. The selected routine single is on the second baseman’s side: CF fields the ball on the ground after the landing hop, 2B cuts/relays, and SS covers second. The sequence is CF → 2B → SS. The source’s alternative, where SS cuts and 2B covers for a ball on the SS side, remains explained in the position notes rather than mixed into the selected animation.

All defensive routes start at contact; LF and RF move to backup positions on either side behind CF, P backs up second, C follows toward first, and the corner infielders stay near their bags. CF arrives after the landing hop and before releasing the throw. The batter stops at first. This uses the same authored bounce settings as S01; no shared animation behavior changes are needed. The timing and precise field coordinates illustrate the selected branch rather than measured movements from the photo.

Migration `0043_s02_ground_fielding_animation.sql` publishes and snapshots only the global S02 revision. Seed files carry the same situation; earlier revisions and independent library copies remain preserved.

## Library details and reviewable outcome suggestions

Library cards show the situation code, short title, geometric ball placement, fielding method, starting runners/outs, and any staff variation label. Placement and fielding share one nonwrapping row with icons. Cards show “Fielded on the ground” when space allows, shortening to “Fielded” on smaller cards; the full label remains accessible and available on hover. Placement uses the Designer’s nearest-anchor classification, including for the library location filter. Missing or contradictory fielding metadata is labeled “Unconfirmed”; no records are silently repaired.

In a Situation’s Play outcomes, choose **Review suggested outcomes**. The panel previews batter and runner destinations, tag-ups, a defensive target, and coaching guidance. Its teaching setups are the selected result, a routine single, a ball past the outfielder, or a caught ball. Applying edits the draft only. It leaves authored defensive routes and throw sequences in place and protects custom runner routes; incompatible result changes require switching those routes to automatic running first. Legacy generated base routes are distinguished from authored routes.

Routine singles use a target two bases ahead of the relevant starting runner: second with no threatened runner ahead of the batter, third with a runner on first, home with a runner on second. A runner already scoring from third does not wrap the target around to first. The teaching note is: “Throw through the cutoff toward the target; redirect or hold when the play changes.” The target is guidance, not an automatic replacement of the defensive alignment.

A ball past the outfielder suggests a double, with two-base runner advances and a target of third or home if a runner starts on first. First-to-home remains a coach decision. A deep caught ball with a runner on third and fewer than two outs suggests a sacrifice fly and tag-up; other runners hold. A catch with two outs suggests the inning ends with no scoring. Tag-up routes begin at the fielding/catch event, not contact. Changing depth alone never rewrites saved outcomes. These are coaching suggestions, not a speed/arm-strength simulation. Existing library records and revisions are preserved.

Validation: static Svelte/TypeScript checks; automated and browser tests intentionally not run at the user’s request.


## Shared Playbook and Coach Board cards

Both views now use `library-card.js` for classification, card models, and DOM content, plus `library-cards.css` for layout. The Coach Board library retains its Edit/Duplicate/Import actions; Playbook retains selection/start behavior. Card titles reserve two lines, descriptions reserve two lines, and shared row sizing aligns runners/outs across cards. Difficulty badges use green, blue, and purple for Foundational, Intermediate, and Advanced respectively. Missing or contradictory fielding methods display “Unconfirmed”.

The library endpoint first restricts records in SQL to the current owner's Boards and active global situations, then classifies, filters, counts, sorts, and paginates that visible set. This replaces the expanded nearest-anchor SQL expression. Playbook still renders and searches only its existing server-authorized situation catalog, including its existing team/library visibility restrictions; it never queries private Boards through this shared renderer. Presentation reuse does not broaden access or change situation data.

Validation for this follow-up: static checks report zero errors/warnings, and the replacement read-only library SQL succeeds against the persistent local database (23 visible records for the local admin, including nine LF search source records). Automated tests and browser checks were not run.


## Compact cards and baseball ordering

Removed fixed card-content tracks and inline-size containment on the clickable Playbook card; content now remains in normal flow. Title height is natural (up to two visible lines), optional staff variation labels appear only when supplied, and long coaching descriptions stay in the opened situation. Shared spacing and ordinary grid-row stretching align cards within each row without forcing all rows to match the tallest card. A per-card width observer switches the fielding label between full and short wording without intrinsic layout containment.

Both views default to runner-state groups: empty, first, second, third, first+second, first+third, second+third, loaded. Each group is ordered by 0, 1, then 2 outs, followed by title and situation code. Headings identify each runner/outs combination; groups with no results are omitted. Coach Board retains recent-update, recent-creation and name sorting. Filtering and eligibility still precede sorting/grouping; no situation payloads are changed.


## Expandable card details

Removed visible runner/outs group headings while retaining the existing baseball sort order. Difficulty now sits directly to the left of the Situation/Board badge in a wrapping badge pair. The selected Playbook situation retains its Current marker.

Each shared card keeps title, ball placement/fielding, a short variation label when present, and starting runners/outs visible. A separate native Details disclosure below runners/outs reveals category, the full variation label, coaching context, and sequence teaching notes. Empty fields and empty disclosures are omitted. The disclosure is a sibling of the card's main button, so expanding it never starts or selects the situation. Its chevron sits beside Details, the label becomes Hide details while open, and hover/focus treatments are quiet and accessible. Disclosure state survives model refresh for the same card; opening one does not toggle the others. No situation data or visibility rules are changed.


## Final compact browsing cards

Removed the Details disclosure entirely from both libraries. Category, coaching context, and teaching notes are not rendered on cards; source situation data and Designer/solution-review access remain unchanged. The shared presentation model no longer includes teaching notes.

Cards show code/difficulty/content type, an optional variation line above the short title, the placement/fielding row, and runners/outs. Recognized trailing variation and generated runner-state suffixes are removed only from the displayed title; saved titles are unchanged. The Coach Board endpoint resolves the same reserved variation tags as the situation repository, so an authoritative “Variation C” replaces an embedded legacy variation suffix instead of showing both. Staff labels remain on the variation line when present.

Both grids are capped at three columns, reducing to two and one on narrower screens. Runners/outs ordering and existing scope/visibility rules remain unchanged. No situation records or historical revisions are rewritten.


Default browsing order now compares difficulty first (Foundational, Intermediate, Advanced), then the existing runner-state order and outs, followed by title and situation code. Legacy Beginner maps to Foundational. Boards without a difficulty sort after the defined levels. Both libraries use the same comparator; explicit coach sorting alternatives remain available.
