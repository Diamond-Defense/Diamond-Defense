# Release readiness and rollout checklist

Use this checklist after a feature phase is accepted locally. It keeps code,
database schema, and environment testing in the same order without modifying
preview or production during local development.

## 1. Local release candidate

Install the browser engines once on each development computer:

```sh
npx playwright install chromium firefox webkit
```

Then prepare and validate the release candidate:

```sh
npm run db:migrations:status:local
npm run db:migrate:local
npm run db:query-plans:local
npm run check
npm test
npm run test:acceptance
npm run test:cross-browser
npm run build
```

`npm test` remains the complete Chromium behavior and API suite.
`test:acceptance` adds a quick desktop and minimum-supported-screen release
smoke test. The broader `test:cross-browser` command runs that focused smoke
test in Chromium, Firefox, WebKit, a 1024 x 768 compact Chromium viewport, and
an 11-inch iPad-sized landscape WebKit viewport. It intentionally does not
repeat the entire behavior suite five times.

Before leaving local testing, manually verify:

- player, coach, and administrator login, logout, and refresh/resume behavior;
- assignment selection, forced practice navigation, next-situation behavior,
  and free-play unlocking;
- coach assignment lifecycle, Team Activity filters, development summaries,
  pagination, and CSV export;
- administrator roster, season, situation, and proposal-preview workflows;
- keyboard focus order, visible focus indicators, dialogs, and form labels;
- no clipped text or horizontal scrolling at `1024 x 768`, approximately
  `1194 x 834`, and a normal desktop width;
- the larger-screen notice at phone widths and in portrait orientation; and
- animation timing, runner destinations, and solution replay for at least one
  situation with runners on base.

## 2. Preview rollout

Preview is the required rehearsal for schema and application changes.

1. Create a preview export before a release that changes schema or data:

   ```sh
   npm run db:export:preview
   ```

2. Review the pending migration list:

   ```sh
   npm run db:migrations:status:preview
   ```

3. Apply all pending migrations in filename order:

   ```sh
   npm run db:migrate:preview
   ```

4. Deploy the exact matching code through the preview branch/Worker workflow.
5. Verify the remote indexes and query plans:

   ```sh
   npm run db:query-plans:preview
   ```

6. Run the focused browser suite against the deployed preview URL:

   ```sh
   BASE_URL=https://your-preview-worker.example npm run test:cross-browser
   ```

7. Repeat the high-value manual checks from the local list using sanitized
   preview accounts and an 11-inch tablet in landscape where available.

The migration command applies every unapplied migration in one run; individual
migration commands are not needed. For this release line, migrations
`0019_structured_situation_outcomes.sql` and
`0020_reporting_and_queue_indexes.sql` must be applied before the matching code
is deployed. Migration `0021_reference_situation_corrections.sql` must accompany
the reviewed playbook situation data so existing databases receive the same new
revisions as fresh seeds.

## 3. Production rollout

Schedule production migration and deployment together after preview acceptance:

1. Export production and store the file securely:

   ```sh
   npm run db:export:production
   ```

2. Review the pending list:

   ```sh
   npm run db:migrations:status:production
   ```

3. Apply the accepted migrations immediately before deploying the matching
   application code:

   ```sh
   npm run db:migrate:production
   ```

4. Deploy the accepted commit through the `main` production Worker workflow.
5. Verify query plans:

   ```sh
   npm run db:query-plans:production
   ```

6. Perform a short, non-destructive smoke test: public load, one login per role,
   report loading, practice queue loading, logout, and a compact landscape
   screen check.
7. Confirm error rates and D1 usage in Cloudflare before declaring the release
   complete.

Do not run the authenticated automated suite against production because its
fixture accounts and assumptions belong to isolated test or sanitized preview
data.

## Failure and rollback policy

Applied migrations are forward-only. Do not edit or rename a migration that has
reached preview or production. If a schema problem is found, create a new
corrective migration. Application deployments may be rolled back to a previous
Worker version only when the migrations were designed to remain backward
compatible with that version.

If migration or data recovery is required, stop writes, retain the pre-release
export, and assess recovery before another deployment. Never reseed or reset a
remote database as a rollback shortcut.

## Release record

Record the following with each rollout:

- accepted Git commit;
- migration names applied;
- local, preview, and production validation results;
- preview and production deployment times;
- query-plan verification result; and
- any known follow-up issue or corrective migration.
