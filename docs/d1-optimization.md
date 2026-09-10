# D1 reporting and queue optimization

Phase 6C keeps the frequently opened coach reports and player-practice queue
within predictable database bounds while preserving complete historical data.

## Bounded application reads

- Team Activity returns five player rows per page.
- Selecting one player returns three attempts per page.
- Coach and player practice queues default to six assignments per page and
  enforce a maximum page size of twenty.
- Development responses are bounded to six monthly trend points, five
  situations needing attention, and eight player summaries.
- Report filter choices are loaded once per team while the workspace remains
  open, rather than on every page or filter change.
- Filtered totals and development insights are reused while moving between
  result pages. Applying filters or choosing Refresh deliberately recalculates
  them.
- CSV export is intentionally the one complete-history operation. It is a
  deliberate user action and uses the same filters as the visible report.

The development calculation still considers every matching completed attempt,
but its database query now reads only the compact metrics needed for the four
insight sections. It no longer transfers or parses each full attempt payload or
loads display metadata that the calculation does not use.

## Index migration

Migration `0020_reporting_and_queue_indexes.sql` adds focused indexes for:

- assignment-filtered attempt history;
- attempt lifecycle filters;
- report completion-date ranges;
- a player's pending assignment queue; and
- a compact partial index containing only incomplete attempt records.

Existing indexes and primary keys already cover team, player, season, outcome,
situation, assignment order, assignment progress, and idempotent attempt
lookup. Phase 6C verifies those paths instead of duplicating their indexes,
because every additional index consumes storage and adds index writes when a
record changes.

## Query-plan verification

After applying migration 0020, verify that representative queries use indexes:

```bash
npm run db:query-plans:local
npm run db:query-plans:preview
```

Run the production check after the matching production migration:

```bash
npm run db:query-plans:production
```

The command is read-only. It runs `EXPLAIN QUERY PLAN` for nine report and
practice-queue paths and fails if an expected index is absent from the plans.

## Workers Free plan considerations

As of September 2026, Cloudflare documents a Workers Free allowance of five
million D1 rows read per day, 100,000 rows written per day, 5 GB total account
storage, and a 500 MB maximum for each free D1 database. Free Workers may issue
up to 50 database queries in one invocation. Current limits should always be
confirmed in Cloudflare's documentation before rollout:

- <https://developers.cloudflare.com/d1/platform/pricing/>
- <https://developers.cloudflare.com/d1/platform/limits/>

This application's ordinary report request remains well below the per-request
query limit. Indexes trade a small number of extra index writes and storage for
far fewer rows scanned during repeated reads. Monitor **D1 > Metrics > Row
Metrics** after preview deployment; rows read, rows written, and database size
are more useful than request counts when deciding whether further work is
needed.

The recommended free-tier operating pattern is:

1. keep routine UI reads paged;
2. filter long-running historical analysis by season, assignment, player, or
   date where practical;
3. reserve complete-history reads for explicit CSV exports;
4. retain indexes only for verified frequent query paths; and
5. use the season cleanup/export workflow when old test data is no longer
   valuable.
