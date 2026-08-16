# Diamond IQ regression tests

These tests capture the established application behavior and the portable
SQLite/D1 data and authentication layer. Local tests run against Wrangler so
the same Cloudflare bindings used in production are available.

## Run the suite

```sh
npm install
npx playwright install chromium
npm test
```

To run the browser behavior checks against the deployed GitHub Pages app:

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
- result recording, aggregation, browser fallback, and D1 persistence;
- database-backed player and staff authentication;
- authorization for team reports; and
- password-free public team responses.

Tests should be kept at the behavior and repository-contract level during the
modular rewrite. Internal function-level tests can be added after modules have
stable public interfaces.
