# Provisional animation timing baseline

S01 ground pickup v1 is a saved engine snapshot after the recording review. It is
not visually approved yet. Review the updated S01, then S02 and a longer outfield
play with runners before enabling distance suggestions across the existing catalog.

In the designer, open **Review → Timing baseline · provisional**. Event times are
seconds from contact at Normal teaching playback (engine milliseconds / 250).
An explicit gather/transfer is separate from flight. “Wait before release” also
includes any required movement or step dependency; it should not be interpreted
as transfer time alone. Field coordinates are native image units, not feet or
pixels at the current browser size.

Distance suggestions v1 interpolate between 0 / 200 / 500 / 1000 / 1600 / 2400
field units and 0.3 / 0.5 / 0.8 / 1.2 / 1.7 / 2.2 teaching seconds. First ground
pickup gather is 0.36 s and relay transfer is 0.28 s. These are provisional teaching
defaults, not measured baseball standards. New designer drafts use this profile by default. Existing plays keep their timing
until the profile is explicitly selected. Baseline-enabled plays use the same hit
flight, authored movement duration, and throw interpolation in both viewpoints. Pair-specific authored overrides take priority.

The report records landing, bounce end, pickup, throw releases and receptions,
plus ball-to-fielder separation at landing, bounce midpoint and ground-travel end,
and sampled minimum separation during the bounce.
Separation below 80 native units prompts visual review, not a scoring failure.
Rendered ball height is included so an airborne-looking overlap is detectable.

**Download timing baseline** saves a named copy of the draft and both engine-view
reports. Load an earlier JSON file with **Compare saved baseline** to see deltas.
Reports model a full animation; player positioning and throw-selection stages are
separate interactions and must still be reviewed in recordings. Negative times
can represent actions before contact. Actual recording timestamps include UI
waits and are not directly comparable to these event times.

Ground-pickup suggestions respect an assigned fielder, then prefer an existing
route reaching the ball, then the nearest starting defender. Show landing / pickup
marks the points without editing. Preview suggested pickup plays the proposed
bounce and approach without changing the draft; Stop preview returns to editing. Applying changes the assigned fielder
and low forward bounce, adding an approach only when that fielder has no route.
Existing routes, other fielders, throws, targets, and outcomes stay intact. Preview
again if an existing route ends away from the ball. Ground balls keep their
existing rolling/hopping presentation; airborne hits receive a separate low bounce.


## S02 recording review

The S02 v1 baseline moves the pickup from (1710,700) to (1710,500), keeps SS at
second, and moves 2B to (1652,660) on the cutoff line. LF/RF back up the deeper
pickup. This stays a bases-empty single with CF → 2B → SS and the batter at first.
Relay legs now separate by about 170 native units instead of 89 / 79. The
`distance-v1` timing profile gives both full engine viewpoints matching event
times. Preserve the before-review snapshot when comparing this draft. Both remain
provisional until visually checked at compact screen sizes.

New designer drafts get the shared profile automatically. Placing their first
ground-fielded ball fills missing fielding method, fielder, low forward bounce
and approach. Existing routes and explicit bounce / throw timings are preserved.
Applying missing defaults to an older draft is explicit. Review suggestions flag
relay legs under 140 native units and chip overlap at bounce midpoint; these do
not block saving or change correctness targets.


## Readiness v2: ready before responsibility becomes relevant

S01 and S02 readiness-v2 snapshots preserve the earlier v1 references. Catcher
and first-base arrivals are now 4.0 Normal seconds after contact, before the
batter reaches first at about 4.4 seconds. Pickup backups arrive at 3.2 seconds,
before the fielder gathers the ball at 3.4 seconds. S01 RF remains at 4.0 seconds,
ahead of the throw reaching second. Cutoff and receiving infielders were already
ready; their routes were retained. S01 now uses the shared profile too, preserving
its explicit throw flight/transfer overrides and aligning its two playback views.

Designer reports infer conservative readiness checkpoints for routine first-base
coverage and catcher backup, ground-pickup outfield backup, and throw receiving.
These are review suggestions, not new scoring rules. Specialized or later-phase
responsibilities still need manual review. The compiler does not add dependencies
from unrelated backups to the relay; a late backup is flagged rather than making
the ball wait.


## Final trailing-catcher refinement (v3)

The v2 checkpoints are superseded for the catcher: the runner reaches first at
about 4.4 teaching seconds and the catcher settles behind the play at 4.6 seconds.
For routine singles with no throw to first, the inferred backup window permits
this short trail; a real throw to first still supplies its own reception deadline.
First-base and outfield-backup timing remains as in v2.

Watch Solution becomes ready after its primary teaching action finishes. A
non-receiving catcher with a short, timely backup tail (at most 0.6 teaching
seconds) keeps moving naturally in the background. Replay, reset and continuing
to the next stage cancel that tail safely. No movement is accelerated or snapped
at the normal completion point; unusually late or involved catchers retain full
playback and are flagged for review. Historical baseline files remain unchanged.
