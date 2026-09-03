# Practice assignments and player queues

Practice assignments are database-backed work queues created by a coach for
active players on that coach's team. They do not duplicate situations or
attempts: assignments reference published situation keys, and saved attempts
carry an optional assignment ID.

## Coach workflow

1. Log in as a coach and open **Coach workspace**.
2. Select **Assignments**.
3. Enter a name, optional instructions, and an optional due date.
4. Select individual players, or use **Select team** to select the current
   active roster.
5. Select one or more published situations. Each selected situation requires
   one complete play-through.
6. Save a draft or publish the assignment.

The assignment workspace separates **Active**, **Drafts**, **Completed**,
**Closed**, and **Archived** records. Every view supports sorting and paginated
search, including archived practices.

Drafts can be completely edited or permanently deleted while unused. Active
practices allow safe changes to the title, instructions, and due date; their
situation list and original recipient snapshot do not change. A coach can
explicitly add newly joined active players, which creates fresh progress rows
without changing the history of the original recipients.

### Editing rules by lifecycle state

| Practice state | Editable fields | Available lifecycle actions |
| --- | --- | --- |
| **Draft** | Name, instructions, due date, selected players, selected situations, and situation order | Publish, Duplicate, Archive, or permanently Delete when the draft has no results |
| **Active** | Name, instructions, and due date; newly joined active players can be added explicitly | Close, Cancel, Duplicate, Retake, or Archive |
| **Completed** | None; the completed assignment and its recipient, situation, and result history are read-only | Duplicate, Retake, or Archive |
| **Closed or cancelled** | None; the ended assignment and its history are read-only | Duplicate, Retake, or Archive |
| **Archived** | None; archived assignment data is read-only | Restore, Duplicate, or Retake |

Editing an active practice never removes an original recipient, replaces its
situation list, or changes situation order. Those changes require **Duplicate**
or **Retake**, followed by editing and publishing the resulting draft. This
keeps existing player progress and results tied to the exact practice that was
originally assigned.

**Duplicate** creates an editable draft from any current practice. **Retake**
creates a separately identified draft cycle linked to the original practice;
publishing that draft starts new progress without modifying earlier results.
Closing or cancelling immediately releases every player. Cancelling also marks
any currently open attempt as abandoned. Archiving removes the practice from
all queues, while restoring preserves the record without automatically
reassigning players: a previously active practice is restored into the closed
view.

Drafts are invisible to players. Publishing makes the assignment available in
each recipient's **Your Practice** queue. Archiving removes it from normal
coach and player lists without deleting its historical attempts.

## Player workflow

1. Log in as a player and open **Your Practice**.
2. Select **Start practice** or **Continue practice** on an assignment.
3. Once an assignment starts, complete it before selecting another assignment.
   The app always opens the first incomplete situation in the saved assignment
   order.
4. Complete the selected situation normally, then use **Continue to next
   situation**. If another assignment remains after completion, the app returns
   to **Your Practice**.
5. Progress changes to **Incomplete** as soon as play starts. It changes to
   **Completed** when the attempt ends. Leaving or reloading records an
   abandoned result and advances to the next assigned situation; it does not
   provide another attempt.

Players can only retrieve assignments addressed to their account. A submitted
attempt only counts when its assignment is active, the player is a recipient,
the assignment owns that player's active practice lock, and the attempted
situation is the next incomplete item. Overdue assignments remain playable and
are clearly marked overdue.

While any published assignment remains incomplete, **Playbook**, **Random**, and
unassigned attempt creation are disabled. This rule is enforced by both the UI
and the attempt API. Free play unlocks only after all pending assignments are
complete, closed, cancelled, or archived. If a coach ends an assignment while a
player is already completing a situation, that attempt is still saved as a
result but does not advance the ended assignment.

**Reset** is unavailable for the entire assigned-practice attempt, including
after either phase finishes. The server claims one run ID when the situation
starts, so disabling the button is not the only protection: reloads, another
tab, direct API requests, and other navigation cannot create a second run for
that same assigned situation.

## Progress rules

- Every assigned situation requires one completed play-through; a completed
  pass or fail satisfies it because the player has received the review for
  both parts.
- Starting a situation immediately records it as incomplete and permanently
  claims that situation's single run.
- Passing, failing, or abandoning the claimed run ends that situation and moves
  practice forward. Abandoned attempts remain visible in result history.
- An unfinished start is excluded from normal results and reporting until the
  browser records it as abandoned or the player completes it.
- A recipient is complete when all assigned situations are completed.
- The assignment becomes complete when every recipient is complete.
- A player may choose among pending assignments until starting one. Starting it
  creates the player's single active assignment lock.
- Completing, closing, cancelling, or archiving an assignment releases its
  lock. Closing and cancelling preserve results while immediately removing the
  assignment from the player's queue and free-play restriction.
- A start and its final outcome update the same attempt row. Attempt run IDs
  make both operations idempotent, so retries cannot advance progress twice.

## Runtime endpoints

- `GET /api/practice/status` returns the player's pending and overdue counts,
  active assignment lock, and server-authorized next situation snapshot.
- `POST /api/practice/assignments/:id/start` acquires or resumes the player's
  assignment lock.
- `POST /api/attempts` verifies the lock and ordered situation on every assigned
  start and completion. It also rejects new free-play attempts while required
  practice remains.
- `GET /api/practice/assignments?view=&search=&sort=&page=` supports separate
  lifecycle lists, server-side search, sorting, and pagination.
- `PUT /api/practice/assignments/:id` fully edits drafts or safely edits active
  metadata and adds explicitly selected new recipients.
- `PATCH /api/practice/assignments/:id` lets authorized staff publish, close,
  cancel, archive, restore, duplicate, or create a retake cycle.
- `DELETE /api/practice/assignments/:id` permanently deletes unused drafts only.

## Database model

- `practice_assignments`: team, coach, title, status, due date, and lifecycle.
- `practice_assignments.season_id`: the season owning the original assignment,
  duplicate, or retake cycle.
- `assignment_recipients`: the player snapshot and per-player completion state.
  It also stores the single active practice lock and its release timestamp.
- `assignment_situations`: ordered situation references pinned to immutable
  situation revisions.
- `assignment_progress`: per-player, per-situation not-started, incomplete, or
  completed state, the linked attempt, and the single claimed attempt run ID.
- `attempts.assignment_id`: optional link between a result and its assignment.
- `situation_versions`: immutable situation snapshots used by published work.

Recipient names and jersey numbers are copied into assignment snapshots so a
later roster edit does not rewrite who originally received a practice.

Apply migrations `0009_practice_assignments.sql`,
`0010_practice_attempt_integrity.sql`, `0011_guided_player_practice.sql`, and
`0012_strict_practice_attempts.sql`, and
`0013_practice_assignment_lifecycle.sql`, and
`0014_seasons_and_player_lifecycle.sql` to every environment before
deploying application code:

```sh
npm run db:migrate:local
npm run db:migrate:preview
npm run db:migrate:production
```

Run preview and production commands from the branch containing the correct D1
database IDs for that environment.

## Phase 3 completion checklist

- Drafts support full editing and guarded permanent deletion.
- Active practices support safe metadata edits and explicitly adding eligible
  players without changing existing recipient snapshots.
- Completed, closed, cancelled, and archived records cannot be edited.
- Duplicate and Retake create new drafts while retaining original results.
- Close, Cancel, and Archive immediately remove practices from player queues
  and release active-practice locks.
- Cancelling or archiving abandons an open attempt without deleting its
  history.
- Restore retains history and does not automatically reassign players.
- Active, Drafts, Completed, Closed, and Archived views support the intended
  search, sorting, and pagination behavior.
- Migration `0013_practice_assignment_lifecycle.sql` is applied locally and to
  each deployed D1 environment before the matching application code is used.
- Migration `0014_seasons_and_player_lifecycle.sql` associates assignments and
  recipients with the team season and safely withdraws removed players.
