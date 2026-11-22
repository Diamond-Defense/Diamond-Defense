# Workspace layout foundation

Your Practice is the first consumer. Org, Training and Design retain their existing layouts.

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
