# Situation play and runner outcomes

Situation outcomes are moving from one shared `batterAdvance` value to explicit,
relational baseball results. This prevents plays such as bunts, force plays, and
double plays from advancing every runner by the same number of bases.

## Implementation phases

1. **Data model and rules** — relational current and versioned outcomes,
   compatibility conversion, and shared validation. Implemented in migration
   `0019_structured_situation_outcomes.sql`.
2. **Coach and administrator editor** — replace the Ball Hit step with Play
   Outcome and Runner Outcomes controls, recommended defaults, force indicators,
   and readable validation messages. Implemented.
3. **Gameplay and animation** — animate the batter and each starting runner from
   their stored outcome instead of using one shared advancement value.
   Implemented.
4. **Proposal review and library cleanup** — compare published and proposed
   versions on the field, approve outcome fields atomically, and review
   ambiguous converted situations such as S21. Implemented.

## Relational records

`situation_play_outcomes` stores the play result, batter result, number of outs,
optional batter-out details, and whether the converted outcome needs review.
`situation_runner_outcomes` stores one result for each runner present at the
start of the situation, including optional out order/type and tag-up state.

The matching `situation_version_*` tables preserve the outcome used by every
immutable situation revision. Editing a current situation never changes the
outcome attached to an assignment's earlier revision.

The legacy `batterAdvance` value remains temporarily for compatibility and
conversion. New outcome records are relational and are returned by the
situation API as `playOutcome` and `runnerOutcomes`. Gameplay no longer uses the
legacy value to move every runner by the same number of bases.

## Gameplay resolution

Normal play and **Watch Solution** now use the same outcome resolver. The batter
and every starting runner independently hold, advance, score, or become out as
configured. Safe runners finish at their stored bases, scoring runners leave the
field at home, and out runners animate toward the next play before disappearing.

The resolved run and out totals are retained with the completed field state for
the gameplay session, while the visible score continues to measure defensive
positioning and sequence performance. Attempt snapshots preserve the structured
play and runner outcomes that were in effect when the attempt began, along with
their resolved final bases, runs, and outs for later reporting.

The outcome model records an out's type and order, but not an exact field
coordinate. The current out animation therefore uses a consistent visual point
along the runner's path. A future editor enhancement can add exact out locations
if that level of replay detail becomes useful.

## Rules enforced by the shared validator

- Every starting runner has exactly one outcome, and absent runners cannot have
  outcomes.
- Batter and runner outs must equal the stated number of outs recorded and may
  not exceed the outs remaining in the inning.
- Two players cannot finish on the same occupied base.
- Force chains are checked when the batter reaches first safely.
- Sacrifice results and double plays cannot be configured with two outs.
- A squeeze requires a runner starting on third.
- A runner advancing on a caught ball must be marked as tagging up.
- A run cannot score when the third out is a force or the batter is retired
  before reaching first.
- Safe-hit, double-play, and fielder's-choice selections must agree with the
  configured batter, runner, and out results.

For singles, doubles, and triples, the named result records the credited hit
while the batter result records where the batter finishes the entire play. A
batter may therefore finish beyond the credited base after a throw or other
continuing action, but cannot finish short of it. Ground-rule doubles and home
runs retain their exact required destinations.

## Coach and administrator editor

The shared situation editor now separates the outcome workflow into two steps:

- **Play Outcome** records the ball type, named play result, batter result,
  outs recorded, and optional batter-out details.
- **Runner Outcomes** provides one card for every occupied starting base, with
  destination, out type/order, and tag-up controls when applicable.

Changing the named play result applies conservative recommended outcomes that
remain editable. The game-state step explains the active force chain, and the
review step provides a plain-language summary plus targeted validation links.
Coach proposals and administrator publishing use the same validation. Play,
batter, and runner outcome fields are approved together so a partial proposal
cannot create an inconsistent situation.

## Proposal review and converted-outcome cleanup

The administrator proposal comparison identifies the exact defensive starts or
targets that changed as a count out of all nine positions, including moved
positions, tolerance edits, and coaching-note edits. Category names are
human-readable, ball changes include field area and direction, and sequence
changes identify the affected step. **Review selected changes on field** combines the published record
with only the fields currently checked for approval, then lets the administrator
switch between that result and the published version. Either version can be
started and exercised before returning to the unchanged proposal review.
Preview play never creates player attempt or Team Activity records, and leaving
preview restores both the prior editor values and its unsaved-change state.

The Situations tab is highlighted when either a coach proposal or a converted
outcome needs attention. Converted records marked `needs_review` appear in a
separate review queue. Selecting one opens its outcome controls. If its converted
values are already correct, **Confirm converted outcomes** clears the review flag
and saves a new confirmed revision without requiring a meaningless field change.
Each queue entry explains why it was flagged, and **Review next** advances through
larger cleanup sets. Successful confirmation removes the entry immediately. Both
the client and database API prevent a coach from submitting, or an administrator
from publishing, a record until its play and runner outcomes have been confirmed.

Fresh database seeds write the same relational play and runner outcome records
as migrated databases. The compatibility payload remains populated, but it is
not the authoritative outcome store.

## Original playbook reconciliation

The original coaching pages were reviewed against the seeded situation library.
Migration `0021_reference_situation_corrections.sql` publishes the confirmed
note, target, sequence, and outcome-label corrections as new situation revisions.
Earlier revisions remain unchanged so assigned practices and historical attempts
continue to use the situation that was published when they were created.

Situations 6 and 12 remain animated with the batter taking second on the selected
throw, but their named play result is correctly stored as a single. The migration
does not invent safe/out results for routes that the printed reference leaves
open to defensive reads.

## Existing situation conversion

Safe hits with an existing advancement of one through four bases are converted
automatically and marked ready. Each historical revision is converted from its
own saved values rather than from the current situation.

Zero-advance and otherwise ambiguous plays are preserved conservatively and
marked `needs_review`. Their runners hold until a coach or administrator chooses
explicit results in the outcome editor. This keeps the migration from silently
inventing baseball behavior. The current S21 squeeze-bunt setup is one expected
review item because it has no runner on third. It must be corrected in the
administrator editor—for example, by adding the intended runner on third and
choosing every batter and runner result—or changed to a different play type.
The migration intentionally does not guess the missing baseball state.

## Rollout

Run `npm run db:migrate:local` before testing code that reads situations. The
preview and production migration should wait until the matching application code
is ready to deploy. Apply the migration immediately before deploying that code.
After migration, use the administrator outcome-review queue to resolve every
flagged record before publishing further edits to it.
