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

Drafts are invisible to players. Publishing makes the assignment available in
each recipient's **Your Practice** queue. Archiving removes it from normal
coach and player lists without deleting its historical attempts.

## Player workflow

1. Log in as a player and open **Your Practice**.
2. Select **Start practice** or **Continue practice** on an assignment.
3. Once an assignment starts, complete it before selecting another assignment.
   The app always opens the first incomplete situation in the saved assignment
   order and resumes that situation after login or interruption.
4. Complete the selected situation normally, then use **Continue to next
   situation**. If another assignment remains after completion, the app returns
   to **Your Practice**.
5. Progress changes to **Incomplete** as soon as play starts. It changes to
   **Completed** when both configured parts of the situation are finished.

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

## Progress rules

- Every assigned situation requires one completed play-through; a completed
  pass or fail satisfies it because the player has received the review for
  both parts.
- Starting a situation immediately records it as incomplete. Resetting,
  leaving, or otherwise abandoning it does not satisfy the assignment.
- Abandoned attempts remain in result history, while an unfinished start is
  excluded from normal results and reporting.
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
- `PATCH /api/practice/assignments/:id` lets authorized staff publish, close,
  cancel, or archive an assignment.

## Database model

- `practice_assignments`: team, coach, title, status, due date, and lifecycle.
- `assignment_recipients`: the player snapshot and per-player completion state.
  It also stores the single active practice lock and its release timestamp.
- `assignment_situations`: ordered situation references pinned to immutable
  situation revisions.
- `assignment_progress`: per-player, per-situation not-started, incomplete, or
  completed state and the linked attempt.
- `attempts.assignment_id`: optional link between a result and its assignment.
- `situation_versions`: immutable situation snapshots used by published work.

Apply migrations `0009_practice_assignments.sql`,
`0010_practice_attempt_integrity.sql`, and
`0011_guided_player_practice.sql` to every environment before
deploying application code:

```sh
npm run db:migrate:local
npm run db:migrate:preview
npm run db:migrate:production
```

Run preview and production commands from the branch containing the correct D1
database IDs for that environment.
