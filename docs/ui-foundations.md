# Shared UI foundations (selectively carried into `newui2`)

This increment extends the existing design tokens and introduces opt-in Svelte components. It does not complete the screen redesign. The initial foundation increment kept top-level navigation in place. The current single-header layout is documented in [main-page-layout.md](main-page-layout.md); the sidebar increment is not carried over.

## Ownership

- `src/styles/tokens.css` owns semantic colors and shared geometry: spacing, control/touch heights, header type, gutters, panel padding/width, focus, motion, navigation widths, and table density. Existing field tokens keep their current values.
- `src/styles/foundation.css` owns `.dd-*` component appearance. It is loaded after `app.css` by the root Svelte layout, has no CSS reset, and does not target the field, defenders, targets, or gameplay metrics.
- The limited compatibility selectors cover Organization/Training section navigation, workspace headers, and filter toolbars. Legacy elements retain their IDs, handlers, role-based visibility, and data ownership.
- `src/lib/ui/navigation.ts` centralizes the existing shell workspace-access decisions and labels. This is presentation policy; server authorization remains authoritative. The later sidebar must use the same policy rather than duplicate it.

## Components

| Component | Contract |
| --- | --- |
| `Button` | Primary, secondary, ghost, danger; native type/disabled handling; optional busy state disables activation and exposes `aria-busy`. Keep an explicit visible busy label when the operation needs one. |
| `PageHeader` | One h1, optional context, wrapping action snippet. Uses available width; long context wraps without imposing a page max-width. |
| `Field` | Explicit label/control ID, optional hint/error IDs. The caller renders the native input/select and sets `aria-describedby`/`aria-invalid` when applicable; this wrapper does not intercept validation or input events. Apply `.dd-control` to the native control. |
| `Panel` | Shared surface and optional padding, forwards native div attributes. Does not force a heading, role, fixed size, or nested card structure. |
| `Feedback` | Mounted, atomic live region. Error messages use alert; informational, success, and warning messages use status. Empty messages remove visual chrome while keeping the region mounted. Callers choose the semantic tone; errors are not automatically dismissed. |
| `SectionNavigation` | Native section buttons, explicit nav label, controlled selection callback, optional counts/disabled state. Native Tab/Enter/Space behavior. These are section controls, not an incomplete ARIA tabs implementation. Secondary navigation uses a quieter treatment. |

Design uses these components for its header, library selector, navigation, outer panel, status feedback, and details Close control. Existing table contents, selection logic, detail content, review/play-test handlers, imports, and permissions remain owned by their existing screens. Library tools also use the shared feedback component.

## Rules for subsequent screens

1. Use semantic tokens and shared components rather than adding screen-specific colors or another global element reset.
2. Keep specialized controls and geometry inside their screen. The field image, coordinate system, scoring, timer, attempts, sequence, and animations are outside this styling layer.
3. Avoid broad `button`, `header`, `section`, and `dialog` overrides for new components. Retire superseded rules as each screen is migrated.
4. Preserve native form labels, disabled states, focus, reduced-motion behavior, and at least 44 px control heights on coarse pointers. The existing unsupported-screen boundary remains unchanged.
5. Keep the revised proposal's preservation checklist as the screen rollout checklist. Mockups do not authorize dropping descriptions, variation labels, base/outs graphics, workflow stages, or permissions.

No dependency is added. Bits UI remains an option for complex accessible interactions; TanStack Table remains conditional on the Design-table pilot. A CSS framework or a full runtime migration is not required for this increment.

## Verification

Use `npm run check`, `git diff --check`, the scoped Design/workspace tests, and `tests/ui-foundations.spec.js`. The latter exercises native keyboard section navigation, semantic theme colors, full-width headers/content at desktop/tablet widths, failure feedback/recovery, and same-document return to the field. Gameplay regression tests remain the baseline for the next field layout step.

`docs/phase-1-design-system.md` records a previous design iteration; its historical palette and branch statements are not the specification for this `newui` increment.

### Historical verification on `newui`

These results describe the source branch before selective carryover. Current `newui2` verification is recorded in main-page-layout.md.

- `npm run check`: 0 errors and 0 warnings.
- `git diff --check`: passed.
- Focused browser run: 10 passed, including shared components, themes, responsive widths, failure/recovery, library publishing/review/import workflows, same-document workspace transitions, login roles, and field-coordinate landmarks.
- One additional existing player-shell test fails on the Guide expanded-button background-color expectation. The exact same failure was reproduced in an isolated checkout of committed baseline `9043b80`; it predates this increment. The assertion and Guide styling were left unchanged.
- The existing production build completed during the tests, with its existing large-chunk and devalue side-effect warnings.
- The field asset, simulator engine, legacy role/gameplay handlers, database/API code, dependency manifest, and lockfile have no changes in this increment.
