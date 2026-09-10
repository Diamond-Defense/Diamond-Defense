# Coach reporting and CSV export

Coach reporting reads directly from the same D1/SQLite `attempts` records used
by the game. Browser-local result data is not used.

## Review workflow

Open **Tools**, choose **Review**, and use any combination of:

- player;
- season;
- assignment;
- situation;
- difficulty and teaching category;
- assigned practice or free play;
- result (`passed`, `failed`, `abandoned`, or `in progress`);
- From and Through dates.

Choose **Apply** to update the summary and table. **Clear** returns to the
unfiltered team view. The default view shows the latest matching result for
each player, five players at a time. Selecting a player shows that player's
matching history, three attempts at a time.

Summary cards cover every database record matching the filters, not only the
current page. Along with attempts, players, pass rate, outcome counts, average
position score, and average completion time, they identify in-progress,
overdue, late-completion, and retake attempts.

## Development insights

The development view uses all completed results matching the active filters,
not only the rows on the current page. It provides:

- recent progress by comparing the earliest half of the matching results with
  an equally sized group of the most recent results;
- separate positioning and play-sequence pass rates;
- a monthly pass-rate trend for up to the six most recent months; and
- up to five situations with the most unsuccessful results, including whether
  misses occurred in positioning or the play sequence; plus
- a roster snapshot of up to eight players, ordered with the lowest pass rates
  first so coaches can quickly identify who may need individual review.

Recent progress requires at least four completed results and compares two
equally sized groups. Completion-time improvement uses recorded active play
time where available and is shown as positive when the recent group is faster.
A missing percentage or **Not enough data** means the selected filters do not
include enough comparable recorded values; it is not treated as zero.

Each row identifies its season and whether it came from free play or an
assignment. Assigned rows include the assignment name and retake cycle. An
unfinished assigned attempt becomes **Overdue** after its due date; a finished
attempt completed after that date is labeled **Completed late**.

## CSV export

**Export CSV** downloads the complete filtered history. The export contains
the season, assigned/free-play source, assignment and cycle, due-date timing,
player, situation difficulty and teaching categories, lifecycle/final result,
positioning and sequence details, abandonment reason, and idempotent run ID.
Values are escaped for spreadsheet use and potentially executable spreadsheet
values are neutralized.

The endpoint is:

`GET /api/reports/team/:teamId/export`

It accepts the same `playerId`, `seasonId`, `assignmentId`, `situationKey`,
`difficulty`, `categoryId`, `activityType`, `outcome`, `dateFrom`, and `dateTo`
query parameters as the paged report endpoint.

## Access control

- Players cannot read or export team reports.
- A coach can read and export only the team linked to that coach account.
- An administrator can read and export any selected team.
- Report responses and CSV downloads are private and are not browser-cached.

Invalid outcomes, activity types, difficulty levels, malformed dates, and
reversed date ranges return a request error instead of running a broad query.

Pagination, query-plan verification, index coverage, and Workers Free usage
guidance are documented in [D1 reporting and queue optimization](d1-optimization.md).
