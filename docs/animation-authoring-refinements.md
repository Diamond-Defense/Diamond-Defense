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


## S01 / S02 routine-single re-review

Reference #1 remains BD-01 / S01, Single to LF; reference #2 remains BD-02 / S02, Single to CF on the 2B side. Both have bases empty and zero outs, explicit ground fielding after a line-drive bounce, and a single with the batter stopping at first. Second is the two-bases-ahead target. Existing defensive geometry, cutoff assignments, route endpoints, contact triggers, bounce settings, and outcomes remain intact.

Both teaching notes now use the agreed instruction: “Throw through the cutoff toward the target; redirect or hold when the play changes.” Receiving infielders direct through/cut/hold calls, cutoffs distinguish letting a throw through from intercepting it, and first-base notes describe maintaining coverage while watching the touch rather than implying a movement trigger absent from the animation. The fixed relay sequence demonstrates the intercepted-relay branch; the note explains that the cutoff need not intercept every throw.

Migration 0044 updates only the two global records and snapshots their new revisions and structured metadata. Independent library copies and earlier revisions are preserved. Seed data carries the same wording. No runtime animation behavior changed.


## Ground-fielding catalog cleanup

All existing reference situations and the five audited scoped/variation records now explicitly specify ground fielding and their opening outfielder. Legacy records gain only version-2 animation metadata with an empty movement override map, preserving their generated routes. Existing authored movements, bounce settings, hit geometry, throwing sequences, outcomes, and library names are preserved. Airborne line-drive flight is still permitted; ground fielding means possession occurs after landing, not that the hit becomes a ground ball.

Migration 0045 applies this assumption only to the audited keys, creates revision snapshots with normalized outcome/category metadata, and archives reviewed global overlap without deleting records. S30 is the older S01-derived variation. An LF single with only a runner on second in the BD-10 family is consolidated into BD-07 only when outs, hit type, and structured runner/batter outcomes agree. First-and-second and bases-loaded entries are retained. Active practice assignments prevent archival. The seed scripts apply the same guarded cleanup after normalizing outcomes; seed and local display-code/starting-state differences are not assumed to be interchangeable.

Verified locally: Global Library decreased from 23 to 21 active situations (S12 and S30 archived); 25 active situations across all scopes explicitly specify ground fielding; every active situation has its current revision snapshot. All existing outcomes and defensive geometry remain unchanged. No additional outs-based situations were created. S06/S14 batter advancement and the remaining individual alignments still require the planned situation-by-situation review; this migration does not invent missing coaching exceptions. Automated tests and visual playback were not run.


## Board Library filter alignment

The Board & Situation Library now uses the Playbook's main filter row: Search, Category, Difficulty, Filters, and Clear filters. The expandable panel contains Hit outcome and Runners (including any runners on), with the existing exact base combinations, Outs, Batted ball, Ball location, Content type, and Sort plays controls retained. The toggle reports active secondary filters; Clear filters resets visible and hidden values and restores the default difficulty/runners/outs ordering. Filter changes reset pagination. Responsive grids keep controls usable on narrower screens.

The API validates difficulty/outcome values, applies filters before counting and pagination, and searches teaching category labels as well as identifiers. The shared card model classifies hit outcome for both library views and reads available Board teaching metadata; private Board ownership and Global Situation visibility restrictions remain unchanged. Existing regression coverage was updated for the visible labels and expandable controls, with combined difficulty/category/outcome and runners-on API assertions. Static Svelte/TypeScript diagnostics and syntax checks pass; automated tests and visual browser checks were not run.


## Board Library overlays the application shell

The header's Coach Board entry now opens PlayLibrary over the mounted field/Training/Design/Organization view, retaining the visible shell and current view until a library action is chosen. Closing or cancelling the native modal restores focus to its trigger without reloading the page. A direct /coach-board request without edit/design intent redirects to /?boardLibrary=1, giving bookmarks the same shell-backed entry. Staff authorization is checked before that redirect.

New, Edit, Present, and Duplicate navigate to the existing Coach Board editor; selected records are fetched through the existing owner/scoped library endpoint. Import validates the portable Board first and transfers its draft through a short-lived, user-bound sessionStorage entry, consumed on editor entry. Existing staged Design links and in-editor browsing/unsaved-change protection remain in place. Regression assertions cover preserved header identity, unchanged URL during modal opening, visible field background, and focus restoration. Svelte/TypeScript and JavaScript syntax checks pass. Automated test suites and browser visual verification were not run.


## Shared library header actions and situation creation

Both library headers now use Close with the same ghost button styling, height, spacing, typography, and focus behavior. Board Library keeps New Board and Import Board as secondary actions. A shared NewSituationAction component exposes New Situation as the primary action only after /api/design confirms at least one workspace with canDesign access. The Playbook mounts the same component for staff, and refreshes it on account changes; players do not receive it. Failed permission loading leaves the action unavailable.

With one editable library, creation opens its existing scoped Coach Board draft route directly. Multiple destinations expose a chooser naming each permitted library and scope; the editor's server loader rechecks Designer access. In-editor creation honors the existing unsaved-change confirmation. Merely opening a draft does not publish a record. Existing regressions were updated for Close, and coverage added for both headers, permission restrictions, and creation without publishing. Static checks pass; automated tests and browser visual verification were not run.


## One browser for Playbook and staff management

PlayLibrary now owns both browsing modes: one modal, header, filter panel, result renderer, pagination footer, responsive layout, focus lifecycle, and view-state handling. Both use 20-item pages, the same full category list, difficulty, hit outcome, exact runner combinations and runners-on, outs, ball type/location, and sorting options. The management API and client-side Playbook share library-browser.js filtering/ordering. Search and filter changes reset pagination; returning to a view restores its page, filters, sort, and scroll, stored separately by user, mode, and team scope. Invalid or unavailable session storage does not prevent browsing.

Playbook receives only the existing authorized /api/situations?catalog=playbook response; private Boards and management catalog results are never fetched by Playbook mode. Timestamp metadata for created/updated sorts is attached after authorization, only to keys in that selected catalog. The existing engine retains team loading, practice-access checks, situation selection, and current-state updates, communicating with the shared browser through open/update/close events. Loading failures now remain in the modal with Retry. Native modal behavior replaces the retired bespoke Playbook focus handling and browser renderer.

Playbook-only controls are Current and Random from results (sampling all filtered matches across pages). Management-only controls are New Board, Import Board, Content type, and Edit/Duplicate/Present actions. Permission-checked New Situation remains shared. The legacy Playbook-only stylesheet is no longer imported. Regression updates cover pagination, restoration, filter resets, and random selection beyond the first page. Static checks pass; automated suites were not run. A manual Safari inspection was attempted but the UI tool timed out before visual verification could be completed.


## Situation Library terminology

The player-facing browser and navigation label are now Situation Library. The rename also covers accessible preview labels, player help and assigned-practice guidance, empty/error states, team-library headings, publication/submission usage and impact text, archive/publish confirmations, and recovery guidance. Team Playbooks are described as Team Situation Libraries in user-facing text. The coach management view remains Board & Situation Library. The product descriptor now says Interactive Situation Trainer. Existing selectors, event names, API paths/query values, database names, audit identifiers, and saved records remain unchanged. Existing regression names and text expectations follow the new visible terminology.


### S01 recording review: ground pickup and relay timing

- Lowered and extended S01's landing bounce (220 ms, 220 native units, height 18), keeping the ball visible in front of LF. LF completes the contact-triggered approach after the bounce settles.
- Added optional validated throw timings by defensive pair, preserved through situation editing and Board import/export. Unconfigured situations retain their original timings. S01 uses a 90 ms LF transfer / 220 ms throw, then a 70 ms SS transfer / 180 ms throw. These are engine times; teaching playback scales them.
- The main app's sequence demonstration uses the same configured timings and teaching playback rate. Positioning-only playback still omits the relay intentionally.
- Migration 0046 updates only global BD-01's animation and snapshots its new revision and metadata. Seed payloads match; prior revision snapshots remain intact.
- Added a regression check for bounce-before-pickup, ball/fielder separation during the bounce, transfer ordering, faster short relay, validation, and metadata round trips. Tests are left for the user to run.


### Provisional reusable timing baseline

- Added the opt-in `distance-v1` profile. Throw flight interpolates continuously over native field distance; receivers moving on release are sampled iteratively at reception. Existing plays retain old defaults, and authored per-pair timings take priority.
- Designer Review now reports Normal teaching seconds from contact for both engine projections, separates flight from dependency waits, and flags sampled ball/chip overlap for visual review. Named JSON snapshots can be downloaded and compared without changing the draft. Saved the S01 ground-pickup v1 reference in `docs/timing-baselines/`. This remains provisional pending visual review of updated S01, S02 and a longer outfield play.
- Ground fielding offers an optional landing/pickup marker preview and explicit Apply action. It respects an assigned fielder and authored routes; only a missing approach is generated. No catalog records were changed by this baseline work.
- Throw timing controls use Normal teaching seconds, with a return-to-default action. Timing profiles survive situation synchronization and Board import/export. Added regression coverage; tests are left for the user to run.


### S02 deeper pickup and designer defaults

- Moved S02's CF pickup moderately deeper, repositioned 2B between CF and SS covering second, and updated LF/RF backup routes. Retained the single, runner result, throws and teaching guidance.
- S02 uses distance-v1, a lower 220 ms forward bounce and a CF arrival after ground travel. Its two relay flights are approximately 0.47 teaching seconds each, with 0.36 / 0.28 second gather/transfer intervals.
- Baseline-enabled playback now shares hit-flight duration, authored movement duration and throw interpolation across Coach Board and the main app; legacy plays keep their existing clocks.
- New designer drafts use the profile by default. Initial ground-ball placement fills missing fielder / bounce / approach data; existing authored routes and overrides stay intact. Added non-blocking relay-crowding and bounce-overlap suggestions.
- Saved S02 before/after baseline files and migration 0047 with revision metadata snapshots. Added regression coverage without running the tests.


### S01/S02 responsibility-based readiness

- Catcher and first-base routes now finish in 4.0 Normal seconds, ahead of the batter's approximately 4.4-second first-base arrival. S01 CF and S02 LF/RF reach pickup-backup positions at 3.2 seconds, ahead of the 3.4-second pickup. S01 RF already backs second in time and is unchanged.
- S01 opts into the shared timing profile while retaining explicit throw overrides, so these authored route times apply consistently in both views. No unrelated backup is added as a relay dependency.
- The baseline report and designer warnings now show inferred responsibility, arrival, needed-by time and readiness. Saved v2 snapshots for both situations; v1 files remain available for comparison. Migration 0048 preserves historical revisions.
- Added regression coverage for timely arrivals and late-backup warnings without slowing the relay. Tests remain for the user to run.


### Final S01/S02 trailing-catcher refinement

- Catcher settles at 4.6 teaching seconds, after the batter reaches first at approximately 4.4. Updated the routine backup checkpoint to permit a short trail while retaining real throw-to-first deadlines.
- Watch Solution exposes the next teaching action when primary movement is complete, with a short, non-receiving catcher tail continuing naturally. Cancellation settles that tail before replay/reset/phase changes; unusually late catcher movement is not hidden.
- Migration 0049 updates only catcher durations in S01/S02 with full revision snapshots. Saved provisional v3 baselines; added regression coverage without running tests.


### Reviewed positioning tolerance — S01/S02

Base coverage accepts the bag and nearby ready positions; first-base radius 145 includes the bag (120 native units from the unchanged ready-position center) plus a 25-unit edge allowance. Second/third coverage uses radius 90. Backup radii are broader than pickup radii: catcher 120, S01 CF 135 / RF 155 / pitcher 100, S02 LF/RF 165 / pitcher 120. Cutoffs retain their alignment with modest tolerance (S01 SS 82, S02 2B 77). Pickup radii, centers, movement paths, and timing are unchanged. These are native-coordinate teaching tolerances, not measurements in feet. Backup notes specify depth and alignment; circular acceptance remains an approximation and does not enforce a directional corridor. Migration 0050 updates global situations and preserves historical revisions.


### S03/S04 ground pickup and readiness v1

Migration 0051 aligns both viewpoints on distance-v1: landing 1.80 s, bounce ends 2.68 s, pickup 3.40 s, release 3.76 s. CF reaches a shorter, deeper supporting backup position at 3.20 s. S03 C trails first-base arrival at 4.60 s; S04 C stays near home in a circle that includes the plate. Base and backup tolerance varies by responsibility; cutoff centers align with the configured throw. S04 explicitly holds the lead runner at second while throwing through toward third. Saved JSON baselines capture both views. Runner-chip offsets near occupied bags are display-only and shared between views; the original runner coordinates and scoring remain intact. Watch Solution positions new runner elements before insertion to prevent an origin flash.

Browser verification additionally caught the missing absolute-positioning rule on movingRunner elements; shared CSS now positions all moving runners in field coordinates rather than document flow.
