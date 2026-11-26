# Current regression contracts

The standard suite runs with `npm test`; browser release checks run with `npm run test:cross-browser`.

- Coach membership grants Training access. Situation Designer is a separate, scoped permission and defaults off for a new coach. Revoking it must deny Design reads and writes without removing Training access.
- Global coach publishing grants and direct writes to `/api/situation-submissions` are retired (410). New publication and proposed-update flows belong to Design and are covered by `scoped-design.spec.js` and the scoped editor flow in `app.spec.js`.
- Primary workspace navigation is a sidebar. Compact layouts expose its items through Sections. Global Library tools remain a secondary horizontal strip.
- Import uses Review, Select eligible, and Import. Duplicate imports are skipped; destructive deletion requires impact review and typed confirmation.
- Situation copies preserve authored animation; normalization may add step metadata. Scoring targets and optional instructional movement remain separate.
- Presentation checkpoints should compile the saved, normalized Situation rather than the Board before conversion. Derived catch outcomes may be disabled controls with authoritative values.
- Watch Solution tests should use reduced motion when checking completion, and keyboard activation to avoid the intentional rapid-click guard after Check Positions.
- Account lifecycle tests use independent teams and users. Tests that temporarily grant seeded staff Designer access must restore the original grant in finally.

Retired workflow tests were replaced with current permission-boundary and sidebar tests, rather than skipped. Keep assertions tied to user-visible outcomes and server authorization; avoid exact old colors, removed controls, or pre-normalization snapshots.
