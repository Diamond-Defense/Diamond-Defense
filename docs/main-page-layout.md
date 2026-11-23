# Main-page redesign (`newui2`)

## Chosen direction

Build on preview commit 9043b80. Use a single navy application header, blue-gray canvas, white contextual gameplay panel, and restrained green actions. The approved reference is the main-page color-system mockup. No sidebar is installed in this increment.

The header retains branding, permission-controlled destinations, and the existing account menu. Team/season context stays in the account and workspace selectors rather than being repeated beside the brand. Required-practice title and completion progress replace Free practice above the field. Play returns from practice/workspaces. Playbook and Random sit above the field and retain their existing IDs, restrictions and event handlers. Staff destinations remain available through the existing authorization-owned controls.

The field retains the real artwork and logical coordinate system. Width is bounded by both available space and viewport height; original resizing/overlay observers remain responsible for animation and token alignment. The light theme blends the field image's surrounding background into the canvas through CSS; no asset is edited. Dark and other existing themes remain available.

The right panel is 304px on desktop and 280px on compact landscape screens. It preserves the full situation title/variation, optional description, category and difficulty, runners/outs graphics, stage instruction, result/checks/timer, contextual coaching notes, solution and sequence controls, assignment advancement, and guide notices. Long content can scroll inside the panel. Existing state-owned hiding of unavailable actions and pre-check results remains intact. Phone/portrait support boundaries are unchanged.

## Selective carryover from newui

- Shared semantic geometry tokens and six opt-in Svelte components.
- Design workspace headers, sections, controls, and semantic feedback.
- Centralized existing workspace access policy (no permission changes).
- Playbook focus containment, background inertness, and return focus.
- Required-practice assignment title and completion count.
- Shared workspace behavior/accessibility tests.

Do not carry over application-rail.ts, player-layout.css, or sidebar-only tests. Main-page styles live in main-page.css; shared styles live in foundation.css. No package, database, API, publication, or inheritance changes are required.

## Preservation and verification checklist

- [x] Field proportions, logical landmarks, and overlay alignment at desktop/tablet widths.
- [x] No navigation overlays or horizontal page overflow.
- [x] Full Playbook card metadata and filters; focus restored after closing.
- [x] Start/check/reset, positioning-only results, sequence stage and solution review.
- [x] Required-practice restrictions, assignment context, advancement, and return to free play.
- [x] Guide pause/resume and coaching notes.
- [x] Player/coach/admin navigation and workspace permissions.
- [x] Design review/play-test, scoped import and publication flows.
- [x] Source checks and production build.

The checklist should reflect actual test results, not the appearance of a static mockup.

## Verification results

- Svelte source check: 0 errors and 0 warnings; git diff --check passed.
- All 19 selected checks passed across the broad run and focused reruns after fixes. Coverage includes gameplay geometry, Start/Check/Reset, sequence progression, required practice, Guide pause/resume, authentication roles, Playbook focus restoration, shared workspace layout/feedback, scoped publishing and scoped import.
- Visual inspection at 1440x900 and 1024x768; automated geometry also checked 1366x768.
- The initial staff Playbook placement was corrected after tests exposed hidden/overlapping controls. Staff situation actions now use a local toolbar outside the field/workspace visibility containers. The initial Guide selected-color conflict was also corrected.
- Production build succeeded through the test-server workflow. Existing bundle-size and devalue side-effect warnings remain.
- No database/API changes or new dependencies; changes are uncommitted on newui2.
- The user will run targeted gameplay checks and manual visual testing for subsequent iterations to avoid duplicate agent runs.

Header-context refinement: implementation and regression assertions updated; user will run checks locally. No tests were run by the agent for this refinement.

Field-size refinement: reduced desktop field-page padding from 24px to 12px and the column gap from 24px to 16px. Compact landscape padding is 8px with a 12px column gap. The toolbar-to-field gap is 8px. Height limits use matching allowances (72px desktop / 64px compact), keeping the complete field in view. Panel widths, image aspect ratio, logical coordinates and animation scaling are unchanged. Workspace page gutters are preserved. Verification is delegated to the user; no checks were run by the agent for this refinement.

Reversible desktop panel trial: above 1200px in landscape, the gameplay panel is 280px wide with 18px horizontal padding (vertical padding remains 24px). Toolbar height and tablet layout are unchanged. To undo only this trial, remove the labeled "Narrow desktop gameplay panel trial" block at the end of main-page.css; the original 304px / 24px rules remain intact. User will run checks and review long titles/feedback before accepting the trial.

Situation controls relocation: Playbook, Random and free/assigned-practice context now occupy the top of the right gameplay panel. The field grid has one row, recovering the former 40px toolbar plus 8px gap. Height allowances now reserve only page padding (24px desktop / 16px compact). Existing staff workspace toolbar behavior is retained so Playbook remains available outside the field. The existing header height is unchanged. User will run the updated layout and gameplay assertions; no agent checks were run for this change.

Gameplay panel hierarchy pass: grouped spacing uses 8px within groups and 16px between sections; title is 22px, stage heading 17px, body/actions 14px, metric labels 12px and numeric values 22px. Situation actions wrap rather than overflow, with 40px desktop / 44px coarse-pointer targets. Main gameplay actions retain 44px targets and wrap long labels. Foundational uses the existing semantic success tint; other difficulty labels remain neutral. Navy text, neutral surfaces and restrained green primary actions remain the hierarchy. Existing descriptions, status/error feedback and stage-owned visibility are preserved. No automated checks run; user verification requested.

Long-title correction: variation is a separate neutral badge beside difficulty, with the base title preserved in full. Panel children/HUD no longer flex-shrink into overlapping content; excessive content scrolls inside the panel. Playbook titles and situation data are unchanged. User-run verification pending.

User verification: source check clean and all four selected gameplay tests passed. Two main-page checks passed; the long-title test hit an early-runtime ReferenceError. Corrected the shared test login helper to await data-diq-runtime=loaded before accessing readiness/state; focused user rerun pending.

Playbook visual integration: white compact header, consistent filter controls and tighter section spacing, neutral canvas and bordered white cards without card shadows. Difficulty/variation badges are separate, category is secondary text, full title and description remain available, and runners/outs align at each row bottom. Three columns on desktop, two on tablet, four only above 1800px; one on narrow displays. Existing filtering, Current indicator, accessible full situation labels and modal lifecycle are preserved. User verification pending; no agent tests run.

Final-check action stability: panel fills its available height, instruction feedback reserves three text lines, and the action group uses reserved primary/solution/reset rows. Reset stays in its own third row instead of replacing Check Positions when controls disappear. Panel still scrolls for long content; no scoring/reset handlers changed. User verification pending.

User Playbook verification: source/whitespace checks clean and focus/metadata check passed. Updated the existing card color assertion to the intended neutral Intermediate/Advanced badges; filtering and selection assertions remain unchanged. User rerun pending.

Playbook density refinement: cards use 12px padding/gaps and an automatic grid with a 250px minimum card width, allowing four cards within the normal desktop dialog. Category can share the badges row and wraps naturally; state diagrams remain bottom-aligned with an 8px divider gap. Header, filters and results spacing are tighter without reducing text/control sizes. Tablet two-column and narrow one-column rules remain. User checks pending.

Persistent stage footer: panel content now scrolls independently above a non-scrolling metrics/action footer. Removed reserved empty action rows and feedback-height spacer. Runtime-owned available actions are promoted into one green primary slot (Start, Check, Watch, Continue, Verify, next situation/assignment). Replay is secondary when another next step is available; playback retains disabled visible progress. Reset remains separate below the action group. A 450ms cross-action click guard prevents a rapid second click activating a newly promoted action. Category/free-practice label and Random recede during play; full title and runners/outs remain, descriptions move under Situation notes, and positioning scores recede in sequence entry. Playbook stays available according to existing permission/practice rules. No gameplay algorithms or authorization changed. User-run verification pending; no agent tests run.

Footer follow-up: Replay and Reset share a stable secondary row; assignment advancement replaces the primary row rather than adding another row. Added a user-run long-notes scrolling check at 1024x768. Cross-action click protection is limited to final Check -> Watch to preserve immediate interaction at other stages.

Review clarity: stage headings now distinguish Watch the positioning solution, Solution playing, and Explore position responsibilities. Contextual position/sequence feedback follows the stage heading/instruction; selected positions use full responsibility labels. The shared close control is hidden for mandatory Play Review results while remaining available for optional coaching notes. Footer behavior is unchanged. User-run tests pending.

Disclosure/result styling refinement: Situation notes is a full-width text disclosure with a right-aligned CSS chevron, keyboard focus and touch sizing. Sequence review uses one semantic tinted result block, a compact icon and normal-weight expected sequence; the outer card and redundant visual Play Review heading are removed. Actual result content, stage logic and reset behavior are unchanged. User-run verification pending.

Stable panel header refinement: Playbook, Random, category and free-practice context no longer disappear during play. The header wraps naturally, placing free-practice context beside selection controls when space permits without reducing control sizes. Assigned-practice context retains a full row. Divider padding/margin tightened to 8px/12px. User verification pending; no agent tests run.

Floating selector trial: practice context / Playbook / Random float at the upper-right of the field column only when their measured rectangle fits a conservative empty corner (rightmost 20%, above 8% of field height, accounting for vertical centering). Field/header/panel dimensions are unchanged. At smaller sizes or with long assignment context, the controls return to the panel. Resize observations update placement. User checks pending; no agent tests run.

Login refinement: compact 440px centered card, 48px logo/wordmark, Log in heading with one short tagline, shared surfaces/controls and green primary action. Added Show/Hide password with accessible state and preserved autocomplete. Submission reports Logging in with aria-busy, duplicate submissions remain disabled, errors have reserved space and a polite atomic live region. Password visibility resets on modal close. Legacy role sign-in controls and API flow remain available. User checks pending; no agent tests run.
