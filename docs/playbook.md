# Playbook metadata and browsing

Cloudflare D1/SQLite is the only runtime source of truth for the Playbook. The
application does not load situation JSON files in the browser.

Each published situation has distinct browsing metadata:

- **Hit outcome** describes the batted-ball result, such as Singles or
  Extra-base Hits.
- **Primary teaching category** identifies the main defensive concept.
- **Related teaching categories** identify additional concepts without
  weakening the primary classification.
- **Difficulty** is Foundational, Intermediate, or Advanced.

Teaching categories come from one controlled list: Cutoffs & Relays, Backups
& Rotations, Force Plays, Fly-Ball Priority, Rundowns, Bunt Defense,
First-and-Third Defense, Double Plays, Base Coverage, Pitcher & Catcher
Responsibilities, Tag-Ups & Sacrifice Flies, and Situational Alignment.
Arbitrary category text is not accepted. The current 22-situation library is
classified primarily as Cutoffs & Relays, with Backups & Rotations and Base
Coverage as related concepts.

Players open **Playbook** from the main navigation. They can search titles,
descriptions, teaching categories, hit outcomes, and stable situation keys; filter by teaching category,
hit outcome, difficulty, or whether runners are on base; or choose a random situation from
the filtered results. Selecting a card updates the strategy board and closes
the browser. The adjacent **Random** command skips the browser and immediately
chooses a different published situation for quick practice.

Player-facing labels combine a stable public display code with the baseball
title. For example, the internal key `BD-02` has display code `S02` and appears
as **S02 · Single to CF**. Compound legacy keys retain labels such as **S10.1**.
New situations receive the next `S##` code automatically; their collision-safe
database keys remain internal. The Playbook card also shows runners and outs,
while the compact header label avoids repeating status already shown beside it.

Coaches and administrators choose the hit outcome, required primary teaching
category, optional related categories, and difficulty in the shared Situation Details
step. Coach changes remain proposals until an administrator approves them.
Administrator changes become visible after publishing.

## Database rollout

Apply migration `0017_situation_teaching_metadata.sql` to local, preview, and
production before deploying this version. It adds the controlled category
catalog, relational links for current and immutable situation revisions, and
the Foundational difficulty value. No account, attempt, or team data is
removed.

Migration `0018_situation_display_codes.sql` adds the public display code. It
backfills the original labels, assigns existing custom situations after the
highest original number, and automatically numbers future situations.

The generated seed files also maintain the relational metadata. Root JSON
files remain development seed inputs only and are never used for runtime
storage.
