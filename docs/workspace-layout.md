# Workspace layout foundation

Assignments is the first consumer. Org, Training and Design retain their existing layouts.

- `dd-workspace-layout`: two-column local workspace shell under the global header.
- `dd-workspace-sidebar`: 230px local navigation and scope context, with a subtle divider.
- `dd-workspace-nav`: text-led 44px destinations; current page has a quiet tint and vertical indicator.
- `dd-workspace-content` / `dd-workspace-heading`: flexible content with compact headings and consistent spacing.
- `dd-task-card`, `dd-status`, `dd-progress`, `dd-button`: shared assignment surfaces and controls.
- At 1100px and below, the sidebar offers a Sections disclosure rather than an icon-only rail.

These styles are opt-in. Keep global navigation and account actions in the application header. Future pages can adapt their existing permission-owned navigation into the same shell without moving business logic into the layout.

Use content-driven proportions: fixed readable local navigation, flexible tables, notes limited to a comfortable reading width. Golden-ratio-inspired hierarchy is a guide rather than a constraint on controls or table cells.

Player practice filters are server-paginated by recipient status. Counts cover all pages and the default API view remains unchanged for existing consumers. No changes to completion rules or assignment permissions.

## Player practice content

The local heading is Practice, with To-do and Completed destinations. Content headings are Assigned practice and Completed practice. Team and season context is omitted here because each player has one current context.

Cards lead with the assignment title and a quiet status badge. In progress uses info colors, completed uses success colors; due dates carry deadline emphasis. Short tasks use a text count and a semantic `dd-checklist` instead of a progress bar/percentage. Exactly one unfinished item is Next up. Long lists remain expandable. A single Start/Continue action remains per assignment. The practice content width is capped at 1040px including padding, aligned with its page heading.

## Deadline emphasis

Player cards use a reusable `dd-deadline` calendar badge: neutral beyond two calendar days, warning for today/tomorrow/two days, and error for overdue. Full localized dates including the year are available in the accessible label and title. Completed assignments retain neutral historical dates. Compare calendar dates using UTC day ordinals of local date parts to avoid DST off-by-one errors.

The global practice count uses the same tones. Its `nextDueAt` comes from the minimum deadline across all pending assignments, not the currently displayed page; an authoritative overdue count takes priority. The count stays a count, and accessible text explains urgency without duplicate alerts.

## Player practice location

Opening practice records `/?practice=pending` or `/?practice=completed` using the application shell's history owner. Reload restores the selected section for an authenticated player. Browser Back/Forward restores local navigation; starting a practice or selecting Field returns to `/`. Staff workspace routing remains unchanged.

## Field toolbar ownership

Free/assigned practice context and Playbook/Random remain children of the training board. Their floating upper-right placement is CSS-owned at supported desktop sizes. No field-height percentage check may move them into the situation panel during resize. Field dimensions, top header and gameplay footer remain unchanged.


## Org workspace interaction contract

Use `renderStaffTable`, `directoryMenu`, and the shared Org dialog helpers for organization, region, and team staff actions. Extend these shared renderers instead of copying older member-editor layouts.

- Roster row bodies toggle their checkbox for both players and coaches. Buttons, menus, links, fields, and labels act independently and never toggle selection. Retain keyboard-operable checkboxes and a visible selected-row state.
- Use one row ellipsis with Edit details, Reset password, and the permitted membership actions. Details and password reset open separate focused dialogs. Do not restore the Details / Password / Team membership strip or Manage member page.
- Player transfer names the source and destination active season, requires a review step, and preserves historical results. Coach memberships are independent; removing one does not remove the account or another membership.
- Director appointments and additional access share the roster table pattern: navy header, white rows, name/role/access-source columns, ellipsis actions, named search fields, and empty/no-match states. Names open access dialogs; show usernames only when different from names. Inherited access is labeled and never removed as a local appointment. Staff table menus offer View access and, for permitted direct appointments, Remove appointment; omit View organization and View region shortcuts.
- Add director is scoped to the current organization or region and honors existing permission rules. People is the unified player/staff directory, including assigned, unassigned, and archived accounts.
- Before handing off a UI change, review player/coach variants, direct/inherited access, permissions, populated/empty/filtered lists, keyboard focus, cancel/error/success states, and bulk selection. Update affected test expectations. Run tests only when the user authorizes execution; the current preference is user-run tests.


### Account and membership lifecycle

People replaces Staff access. Account & team deletion is no longer a team tab: player/staff account actions belong in the person popup, and team deletion belongs in the team-heading ellipsis. Season selectors, exports, roster records, and season deletion belong under Seasons. Deletion dialogs explicitly distinguish account-wide removal from a single season’s records. Team deletion requires a closed active season, a server impact preview, exact-name confirmation, and an unchecked optional account-deletion choice with the affected active-player list. If preview counts differ from the displayed list, disable optional account deletion until refresh.

Parent navigation uses a standard 36px outlined Back to button on the current detail heading row, right aligned and immediately before the team ellipsis. Remove the separate back-link row. At narrower widths, actions wrap beneath the heading.

### Seasons

The Seasons tab uses a searchable Team seasons table with status, member/practice/result counts, and row ellipsis menus. New season opens a focused dialog for another season on the same team; disable it with visible explanatory text while a season is active. Close season opens a confirmation dialog explaining unfinished practice and retained history. Export remains a row action. Clickable season rows open a detail view with Back to seasons, status, counts, a searchable player/coach roster, and the season action menu. Closed-season permanent deletion stays in that menu with exact-name confirmation. Player rows in closed seasons expose record-deletion reviews to authorized admins, using the explicitly opened season as context. Keep season management out of Account & team deletion.

Advance roster is a separate admin-only wizard, offered from the latest closed season when there is no active source season and current members are available. Its steps are Destination, Members, and Review. Existing destinations must have an active season. Member filtering must preserve selection; row-body clicks toggle selection while fields and controls remain independent. New player numbers are editable and checked for destination conflicts. Review names every selected member and destination, and explains preserved original history and sign-outs before invoking the existing advance API. The wizard moves current memberships, not a historical roster snapshot. Preserve server authorization and validation.


Roster removal and permanent account deletion must remain distinct in labels and confirmations. Removal ends only the selected team membership and preserves the account and historical attempts; it never requires subsequent account deletion. Permanent player-account deletion removes all attempts/results across teams and seasons. Season-record deletion affects only the explicitly selected closed season.


### Unified People and Recovery flow

People lists visible player and staff accounts with type and Assigned / Unassigned / Archived filters. Player accounts have one current team; previous memberships and season snapshots are history. Coaches may have multiple current team memberships. Use existing accounts for reassignment; do not create duplicates when a player returns. Active memberships on archived teams remain explicit assignments until resolved, not silently reclassified as unassigned.

Remove from team ends only membership, withdraws current practice, and preserves the account/history. Archive account is a separate admin-only action that disables sign-in and ends current memberships while retaining history. Restore account does not reactivate an old team membership; reassignment is separate. Legacy accounts archived by the former last-membership removal behavior stay archived until an admin deliberately restores them. Explicit archiving of staff requires resolving appointments and owned practice assignments first.

For active season rosters, End participation explicitly also ends current team membership; this version does not introduce simultaneous current-team membership with an independent inactive season enrollment. Undo mistaken entry is admin-only and rejects any recorded attempt, practice recipient, or owned practice in that season. Closed seasons retain history; record deletion is an explicit admin review.

Recovery has Teams and Situations categories only. Unassigned and archived accounts are found in People, never a second Recovery account table. Duplicate-account merging is not implied by deletion and is not implemented by these actions.

Migration 0041 adds a partial unique index for active player membership by user ID; coaches are excluded. Apply it through the normal migration workflow. Existing duplicate active player memberships must be resolved explicitly before the index can be created. No automatic reassignment or account reactivation is performed.


### Director account visibility after transfers

People accounts follow current responsibility: organization directors retain accounts on teams across their organization; regional directors retain accounts only within assigned regions. A current membership outside a former director's scope prevents visibility through old membership history. Unassigned or archived former members without any current memberships or appointments are visible only in the scope of their most recently ended membership, including archived teams in that scope. Active staff appointments may independently grant in-scope staff visibility. Returned account-membership rows are restricted to visible accounts and in-scope teams. Admins retain global visibility.

Director team responses omit inactive membership account details; original season roster snapshots and training history remain available through authorized season routes. Transferring does not delete those historical snapshots. Do not join current outside-team account information into historical views.
