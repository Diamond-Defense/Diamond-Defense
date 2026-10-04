# Coaching usage checkpoint after Phase 04

## Scope and evidence

On 2026-10-04, exercised three representative baseball plays against the isolated local browser-test database. All three passed. This is a preparation/workflow checkpoint, not a live coaching session or validation of a particular team's defensive system.

The scenarios are defined in `tests/coaching-checkpoint.spec.js`. Routes are deliberately simple; Boards are constructed through the shared model and saved through the API, then loaded and operated through the actual sidebar. This checks integration and demonstration, but does not measure the effort of drawing every route by hand. Earlier Board tests cover pointer recording; that is not a substitute for a coach's usability feedback.

| Play | Authored actions | Observed result |
| --- | --- | --- |
| Ground-ball double play | SS fields; 2B covers second; 1B covers first; CF and P back up; batter and first-base runner move concurrently; SS → 2B → 1B | Board saved/loaded, double-play outcomes converted, every presentation event stepped, replay reset and sidebar restored |
| RF hit with cutoff | RF fields; 2B reaches cutoff and stays there through receipt/relay; 3B covers third; first-base runner has two segments; RF → 2B → 3B; 2B moves again after throw 2 receipt | Existing event dependencies express the hold without an explicit wait segment; single/runner-to-third outcomes persisted; presentation and return passed |
| Caught fly with tag-up | RF catches; CF backs up; runner on third stays at third until ball-fielded event, then advances home; RF → C | Sacrifice-fly, batter-out and tagged-up runner outcomes persisted; presentation and return passed |

For every scenario, the focused Save as Situation form hid the authoring modes, conversion retained animation version 2, presentation followed shared engine event snapshots, Replay restored starting alignment, and Exit restored the tools. Existing production code, refined sidebar, and Save as Situation workflow were preserved. No migration or production data change was made.

## Concrete preparation findings

1. **Outcome detail requires another editor.** The Board form offers result, batter result, outs recorded, runner result and tag-up. It does not offer out type or order. `outcomeMetadata()` defaults newly authored outs to `other`; existing linked out details are preserved. A force-out double play can therefore be published with its broad outcomes but without explicit force/batter-at-first classifications and order. Use Situation Details to complete those details before relying on nuanced scoring. This is an integration/form refinement, not evidence that animation needs a timeline.
2. **A cutoff hold already works.** A player finishing a segment stays at that endpoint until its later event-triggered segment starts. No artificial delay or extra Hold control is needed for the tested relay.
3. **Tag-up depends on deliberate event selection.** The third-base runner must start at “When ball is fielded,” rather than the default “At contact.” The test exercises this condition successfully. Whether coaches discover that control readily remains a hands-on usability question.
4. **Ball-fielded is a flight boundary.** The engine schedules it from batted-ball type, independently of defender arrival. These routes put the fielder at the ball before that boundary. A longer route could visually field the ball before the defender arrives; this is a timing-model limitation found by code inspection, not a failed scenario here. Include a longer catch/fielding route in hands-on review before deciding whether it warrants Phase 05.
5. **Library usability is not yet measured.** Three named examples loaded successfully, but this small set cannot establish search/filter/duplication needs for a season's collection. Previously fixed duplicate Board names are not new evidence for more library work.

## Recommendation and remaining coaching check

Follow-up: the user completed manual testing and reported that behavior worked as expected, then explicitly approved Phase 06. Phase 05 is deferred. The [Phase 06 library](play-library.md) implements discovery and reuse; the outcome-detail follow-up remains separate. The assessment below records the initial automated checkpoint.

The integration checkpoint passes. Do not automatically expand animation controls: cutoff waiting and tag-up starts are already expressible. There is not yet enough human-use evidence to declare Phase 05 or Phase 06 the larger need.

Use the same three plays in a short preparation/teaching session, creating routes by hand with your team's actual alignments:

- Prepare a double play and complete force/out-order details through Situation Details. Note whether changing editors gets in the way.
- Prepare a cutoff with a second movement after the relay. Note whether choosing the segment and its start event is clear.
- Prepare a tag-up and a longer fly-ball route. Step through catch and runner departure to judge the timing.
- Reopen the plays later among your existing saved content. Note whether finding, distinguishing or reusing them takes longer than authoring them.

Record the play, exact troublesome action, expected behavior and workaround. Choose **05** if route/event/segment preparation is the repeated obstacle; choose **06** if locating/reusing saved content dominates. Treat outcome-detail fields as a narrowly scoped authoring integration follow-up whichever phase is chosen. No next feature phase was started by this checkpoint.

## Reproduce the focused exercise

```sh
npx playwright test tests/coaching-checkpoint.spec.js
```

Result: **3 passed**. The test harness builds the app and uses its isolated database; it does not seed the user's normal local database. Existing build chunk-size warning remains. The broader regression already passed locally according to the user and was not repeated for this documentation/checkpoint addition.
