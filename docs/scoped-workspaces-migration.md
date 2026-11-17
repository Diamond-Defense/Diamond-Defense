# Sign-in and workspace migration

## Cutover order

1. Backfill stable usernames and add username sign-in. Existing account IDs, password hashes, active memberships, seasons, results, and attempt history carry forward. The existing Platform Admin signs in as `admin`. During the staged rollout, `?signin=legacy` opens the prior form for recovery, and the old API request format remains compatible.
2. Assign teams to explicit regions, each under an organization. Platform Admin can use **Organizations** to browse the hierarchy and place teams. Teams with unknown ownership stay unassigned until a Platform Admin confirms the hierarchy. Team names do not establish ownership.
3. Add scoped workspace assignments alongside current grants. Use **People & access** to review team memberships and legacy publishing grants, appoint directors and record each Designer choice. Director appointments grant operational access to the Org workspace. Designer assignments enable authoring and publication at their own scope.
4. Migration `0034_scoped_situation_libraries.sql` keeps existing published entries in the Global Library and adds scoped libraries, promotion requests, and revision-pinned distributions. Former shared-library publishing grants are historical. Platform Admin approves Global requests, and existing coach submissions remain available in Global library tools.

## Existing access

| Current access | Scoped assignment at cutover |
| --- | --- |
| Active team coach membership | Coach for that team. Roster and team permissions remain tied to that membership. |
| Legacy standalone team training grant | Migration `0033_retire_additional_team_access.sql` records the prior grant in the audit log and retires it. Access follows active Coach memberships and director appointments. |
| Shared-library publishing in `coach_permissions` | Platform Admin reviews the account's actual responsibilities and grants Designer only for confirmed scopes. Only Platform Admin can write to the Global Library. No previous publisher is automatically granted Designer access. Existing published situations and their attribution retain their IDs. |
| Platform administrator | Platform Admin workspace and global publishing and final approval. |

A director appointment is explicit. Regional and Organization Directors normally receive Designer in that same scope. Operations-only appointments omit Designer. A director can grant a narrower Designer assignment only when they hold the relevant Designer permission and the destination belongs to their scope. Curation is independent of Designer access. A director with a Coach assignment on the same account selects the team or director workspace for the work at hand. Unrelated assignments remain separate when permissions are checked.

Before publishing cutover, review the inventory of active memberships, director appointments, and direct publishers. Confirm team ownership and appointments with Platform Admin, then test that a director-coach can work in both scopes, that an operations-only director can curate, and that an unrelated workspace is denied. Record any scoped grants an existing publisher needs before deploying the publishing cutover.

## Playbook and library cutover

Migrations `0037_global_library_inheritance.sql` and `0038_scoped_library_inheritance.sql` make published situations available at their latest revision throughout the publishing library’s hierarchy. Global situations reach every team. Organization situations reach that organization’s regions and teams, and regional situations reach that region’s teams. The Team Library keeps team-authored situations local.

Staff manage inherited visibility with **Hide here** and **Show here** in Design. Local hides apply across revisions and to descendant scopes. A team’s inherited difficulty setting applies to every inherited library. Existing links, shares, and adoptions no longer control availability. Existing practice assignments and attempts keep their recorded revisions.

Reviews go to the next library up. Regional Directors with Designer review team submissions. Organization Directors with Designer or Platform Admin review regional submissions into the organization. Global publication requires a separate request from the organization and approval by Platform Admin. Authorized directors may also cherry-pick directly from libraries within their scope.
