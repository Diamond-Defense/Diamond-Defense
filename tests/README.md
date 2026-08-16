# Diamond Defense regression tests

These tests capture the established application behavior and the portable
SQLite/D1 data and authentication layer. Local tests run against Wrangler so
the same Cloudflare bindings used in production are available.

The test server recreates only `.wrangler/test-state`. Persistent development
data in `.wrangler/state` is never migrated, seeded, or modified by the suite.
Wrangler disk logs are disabled during tests; Playwright retains its normal
failure screenshots and traces under the ignored test-results directory.

## Run the suite

```sh
npm install
npx playwright install chromium
npm test
```

Run script/workflow unit tests without starting a browser:

```sh
npm run test:scripts
```

Run the complete release verification sequence:

```sh
npm run verify
```

To run the browser behavior checks against a deployed Cloudflare Pages URL:

```sh
npm run test:live
```

The live command does not start a local server and does not run the local JSON
file-contract tests. It verifies the deployed player, coach, admin, gameplay,
reporting, and persistence behavior using the same expectations as the local
suite.

The suite covers:

- the `situations.json` and `teams.json` data contracts;
- application startup and JavaScript runtime errors;
- situation selection and HUD updates;
- start/check/reset round transitions;
- player login behavior;
- coach and administrator password gates;
- established outputs from important helper functions; and
- situation normalization and export behavior;
- team and roster create/update/delete operations;
- coach review code encoding and decoding;
- a complete successful Phase 1 → Phase 2 game path; and
- result recording, aggregation, and D1 persistence;
- rejection of seed JSON and browser storage as runtime data sources;
- a visible database-unavailable startup state;
- database-backed player and staff authentication;
- authorization for team reports; and
- record-level team, member, coach, and situation administration;
- optimistic revision conflicts and archive/restore behavior;
- password-reset session revocation and administration audit records; and
- password-free public team responses.

Tests should be kept at the behavior and repository-contract level during the
modular rewrite. Internal function-level tests can be added after modules have
stable public interfaces.
