# Director and publishing permissions

Coach workspace lists the teams where the account has an active coaching membership. Org workspace provides organization, region, and team management. Coach workspace provides training tools for the selected coaching team.

Migration `0033_retire_additional_team_access.sql` records standalone team training grants in the audit log and removes them. Review current coaching memberships and director appointments before applying it. Add a role only where it reflects the person's actual responsibilities.

## Publishing is separate

The optional **Edit and publish situations without approval** permission applies to the shared library, across all teams. Leave it off for directors who should continue submitting proposals for approval.

With publishing enabled, a coach can edit and publish existing situations or create and publish new situations without approval. Only administrators can approve or reject coach proposals. Coaches, including directors with publishing permission, can see only their own proposal history. Administrators can grant or revoke direct publishing independently of team access. The publish confirmation identifies team Playbooks that use the situation. Use **Create variation** when changes are intended for a particular team; publishing a variation does not automatically add it to any team's Playbook.

Without publishing permission, the usual proposal workflow remains. Admin-only operations such as permanent deletion, permissions, account management, import, and recovery stay restricted.

Permissions are read from the database on each authenticated request, so revocation takes effect on the next request even for existing sessions. UI controls refresh after reload. Permission changes and publishing actions are audited. Assignment ownership records retain the person who created them.

## Unassigned accounts

Recovery lists unassigned players and coaches even when no team is selected. Select accounts and a destination team to reuse existing accounts and passwords; only players require jersey numbers. Permanent deletion requires typing DELETE and removes the account and its associated records. Coach deletion removes proposals, sessions, and permission grants, but is blocked while the coach owns any practice assignments. Resolve those assignments before retrying; they are not silently deleted. Publishing attribution on existing situations is cleared by the database while published situations are retained.
