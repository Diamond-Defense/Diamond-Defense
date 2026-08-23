# Coach reporting and CSV export

Coach reporting reads directly from the same D1/SQLite `attempts` records used
by the game. Browser-local result data is not used.

## Review workflow

Open **Tools**, choose **Review**, and use any combination of:

- player;
- situation;
- final result (`passed`, `failed`, or `abandoned`);
- From and Through dates.

Choose **Apply** to update the summary and table. **Clear** returns to the
unfiltered team view. The default view shows the latest matching result for
each player, five players at a time. Selecting a player shows that player's
matching history, three attempts at a time.

Summary cards cover every database result matching the filters, not only the
current page. They show attempts, players, pass rate, outcome counts, average
position score, and average total completion time.

## CSV export

**Export CSV** downloads the complete filtered history. The export contains
the saved date/time, player, situation, final outcome, positioning score,
tries and time, sequence result, sequence tries and time, selected sequence,
abandonment reason, and idempotent run ID. Values are escaped for spreadsheet
use and potentially executable spreadsheet values are neutralized.

The endpoint is:

`GET /api/reports/team/:teamId/export`

It accepts the same `playerId`, `situationKey`, `outcome`, `dateFrom`, and
`dateTo` query parameters as the paged report endpoint.

## Access control

- Players cannot read or export team reports.
- A coach can read and export only the team linked to that coach account.
- An administrator can read and export any selected team.
- Report responses and CSV downloads are private and are not browser-cached.

Invalid outcomes, malformed dates, and reversed date ranges return a request
error instead of running a broad query.
