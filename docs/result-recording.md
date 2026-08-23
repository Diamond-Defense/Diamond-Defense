# Result recording

Diamond Defense stores one `attempts` row for each situation a player starts.
The browser creates a unique `runId`, and the database enforces uniqueness so a
reset or page-unload retry cannot create a duplicate result.

## Terminal outcomes

- `passed`: positioning and every configured sequence stage passed.
- `failed`: the player completed the exercise but positioning or a sequence
  stage failed.
- `abandoned`: the player left an unfinished exercise by resetting, selecting a
  different situation, logging out, opening staff tools, starting another run,
  or leaving/reloading the page.

Situations without a sequence are saved as soon as positioning ends. Situations
with a sequence are saved after the last sequence stage, with all phases grouped
inside the same database record.

## Saved detail

The normalized columns support filtering and stable historical display. The
versioned JSON payload preserves the complete exercise detail:

- lifecycle timestamps and abandonment reason;
- situation key, revision, rules snapshot, outs, and runners;
- initial and final player positions;
- every positioning check, score, retry count, and elapsed time;
- every sequence submission and final stage result;
- final passed, failed, or abandoned outcome.

Team name, player name/number, situation title, and situation revision are
captured by the server from D1 rather than trusted from the browser. Editing a
current roster or situation therefore does not rewrite the context shown for an
older result.

## Delivery behavior

Normal terminal actions submit through the authenticated API. Logout waits for
the save before destroying the session. Page closure uses a keepalive request
as a best-effort final delivery. Repeating that request
is safe because `run_id` has a unique database index and duplicate submissions
return success without inserting another row.

Automated coverage verifies passed, failed, abandoned, and duplicate-submission
behavior against the same local D1 interface used by Cloudflare.
