# Phase 1 — shared design system and application shell

Implemented on `local-redesign`. This is a visual foundation, not a workflow or gameplay rewrite.

## Architecture and scope

The application uses Svelte 5 / SvelteKit, Vite, and the Cloudflare adapter. `DiamondIQApp.svelte` renders the existing `index.html` markup and loads the classic runtime. `ensureHeaderGrouping()` in `src/game/engine.js` already owns the shared shell, existing navigation controls, branding image, and account menu. The redesign retains that architecture and its responsive layout, element IDs, event handlers, data sources, permissions, and role decisions.

`src/styles/app.css` imports the new `tokens.css`, so both the SvelteKit layout and the legacy HTML reference receive the same palette. Shared CSS primitives are refactored in place rather than introducing a second component library or dependencies. Historical class names such as `.btn-green` remain compatibility aliases for primary actions. New code can use `.btn-primary`, `.btn-secondary`, and `.btn-tertiary`.

## Files

- `src/styles/tokens.css`: semantic palette, type scale, effects, radii, and reserved baseball tokens.
- `src/styles/app.css`: shared theme, control states, form boundaries, panels, dialogs, navigation, account presentation, unsupported-screen notice, and decorative reduced-motion behavior. Existing screen layouts remain intact.
- `src/game/engine.js`: two accessibility attributes identifying the existing utility group as Application navigation; no event or gameplay changes.
- `src/lib/components/DiamondIQApp.svelte`: shared semantic error colors for startup failure feedback.
- `tests/app.spec.js`: existing Guide and Reset color assertions now resolve semantic tokens; gameplay color and behavior assertions are preserved.
- `docs/phase-1-design-system.md`: implementation and validation record.

## Token reference

| Purpose | Tokens |
| --- | --- |
| Application | `--app-background`, `--surface`, `--surface-raised`, `--surface-interactive`, `--surface-hover`, `--border`, `--border-emphasis` |
| Brand | `--accent-primary`, `--accent-primary-hover`, `--accent-primary-pressed`, `--accent-primary-muted`, `--text-on-accent` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-disabled` |
| Feedback | `--success`, `--warning`, `--error`, `--info`, and their `-muted` surfaces |
| Accessibility | `--focus-ring`, `--overlay` |
| Baseball, reserved | `--field`, `--field-dark`, `--field-highlight`, `--defender`, `--defender-highlight`, `--runner`, `--runner-highlight`, `--baseball-line`, `--ball`, `--target` |
| Effects | `--shadow-low`, `--shadow-raised`, `--glow-brass`, `--glow-green`, `--glow-cool` |
| Typography | `--font-ui`, `--type-page`, `--type-section`, `--type-panel`, `--type-body`, `--type-help`, `--type-label`, `--type-numeric`, `--weight-heading`, `--weight-control`, `--line-body`, `--line-heading` |
| Shape | `--radius-control`, `--radius-panel` |

Primary actions use brass with dark text. Secondary actions use raised navy. Ghost controls keep a minimal surface. Destructive controls stay rose/red; status feedback retains separate success, warning, error, and information colors. Focus uses a cool, high-contrast outline. Disabled controls retain their labels and native disabled behavior.

Existing `--ff-*` and `--dd-*` UI variables map to semantic tokens where safe. Game-rendering aliases (including route colors) retain their existing values. The reserved baseball palette is deliberately not applied to the current field, chips, runners, target markers, or animations.

## Shared shell and branding

The existing horizontal command shell is preserved to keep the strategy field usable at the 1024×768 minimum. It uses restrained separators, consistent control shapes and type, navy navigation surfaces, and brass selected states with an inset underline/edge so selection is not communicated solely by hue. Existing workspace visibility drives the staff/practice navigation styling without introducing duplicate role state.

The existing app icon is reused without recoloring or replacement; its surrounding frame receives the brass treatment. Asset import and the existing brand image slot remain ready for a future approved asset. The application's existing “Diamond Defense” spelling is retained.

Authenticated name, role/team details, account security, and logout remain in the existing shared account menu. No account features or navigation destinations were added.

## Responsive behavior

Desktop retains the existing compact horizontal shell; narrower supported landscape widths wrap command groups through the existing breakpoints. The existing header-size observer and field-sizing logic are untouched.

Phones, portrait screens, and widths below 1024px still show the existing larger-screen requirement. That notice inherits the new brand treatment. Enabling phone gameplay or changing this boundary would be a separate functional scope decision.

## Remaining legacy styling and Phase 2

The stylesheet still contains historical layout layers, specialized inline styles generated by the legacy runtime, field-specific colors/glows, report chart colors, detailed gameplay feedback, and some screen-specific badges and typography. The shared theme is centralized, but this phase does not claim to eliminate all legacy CSS.

In Phase 2, migrate the field and player/runner/target palette together using the reserved tokens, with geometry and gameplay regression coverage. Gradually remove superseded screen-specific declarations as each screen is redesigned. Reuse the shared primitives rather than introducing new page-specific palettes. Any official asset replacement should be reviewed separately.

## Validation

Baseline: `npm run check` passed with zero errors/warnings; 29 script tests and all 49 regression tests passed. The test server also completed the production build.

Post-change validation completed before the requested handoff workflow changed:

- `npm run check`: zero errors and zero warnings.
- `npm test`: 29 script tests and 49 regression tests passed.
- `npm run test:acceptance`: 8 desktop/compact Chromium checks passed.
- Production builds succeeded through the existing test-server workflow. The pre-existing large-chunk warning remains.
- `git diff --check`: passed.
- The protected field image and chip/target/runner visual blocks were compared against HEAD and remain unchanged.
- Selected token contrast pairs: primary text 15.50:1, secondary text 8.59:1, muted text 6.26:1, primary-button text 7.49:1, semantic feedback text 7.34:1 or greater, focus ring 10.94:1, input boundary 3.83:1. This is a palette check, not a complete accessibility certification.

Hands-on browser inspection covered the public shell, login dialog, visible input focus, successful Player login, authenticated Player shell, and the existing unsupported-screen notice. Coach/Admin access, Situation Builder, Coach Review, navigation, logout/session behavior, and complete gameplay were exercised by existing automated regression/acceptance checks. Additional hands-on Coach/Admin and responsive review is left to the user; it is not claimed as completed.

No standalone lint script exists; `npm run check` is the repository's Svelte/TypeScript diagnostic command.

## Local verification handoff

For future changes, provide commands and let the user run tests and return results unless they explicitly request agent-run validation.

```sh
cd /Users/smbambling/Documents/personal/git/github/Diamond-Defense
git branch --show-current
npm run check
npm test
npm run test:acceptance
npm run build
```

The branch should be `local-redesign`. For hands-on review against isolated test data:

```sh
npm run test:server -- --port 4176
```

Open `http://127.0.0.1:4176`. This uses `.wrangler/test-state`, not persistent development data. Do not run this preview concurrently with the automated suites because they use the same isolated test-state directory. Stop the preview with Ctrl+C before running tests.

Review Player, Coach, Admin, Situation Builder, Coach Review, Playbook, Guide, login/logout, and start/check/reset. Check desktop and 1024×768 landscape layouts, the phone/portrait notice, keyboard focus, selected navigation, and destructive-action styling. Return any command failures and screenshots or descriptions of visual issues.
