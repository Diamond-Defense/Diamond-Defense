# Director and publishing permissions

Apply migration `0026_coach_permissions.sql` before deploying this version. Run `npm run db:migrate:preview` for preview and `npm run db:migrate:production` for production. Existing coaches keep their current access; no publishing or additional-team permissions are granted automatically.

## Grant access

As an administrator, open Teams & accounts, select the coach's team, and choose **Team access & publishing** beside the coach. Select additional teams and save. The coach retains their own team. They should reload the app to refresh the available teams and controls.

Additional-team access permits assignments, reviews/report exports, and adding/removing published situations from team Playbooks. It does not grant account administration, roster editing on those teams, permanent deletion, or publishing permission. Coaches select **Managing team** in their workspace. Admins use **Team training** in the admin workspace to access the same tools for any team.

## Publishing is separate

The optional **Edit and publish situations without approval** permission applies to the shared library, not only selected teams. Leave it off for directors who should continue submitting proposals for approval.

With publishing enabled, a coach can edit and publish existing situations or create and publish new situations without approval. Only administrators can approve or reject coach proposals. Coaches, including directors with publishing permission, can see only their own proposal history. Administrators can grant or revoke direct publishing independently of team access. The publish confirmation identifies team Playbooks that use the situation. Use **Create variation** when changes are intended for a particular team; publishing a variation does not automatically add it to any team's Playbook.

Without publishing permission, the usual proposal workflow remains. Admin-only operations such as permanent deletion, permissions, account management, import, and recovery stay restricted.

Permissions are read from the database on each authenticated request, so revocation takes effect on the next request even for existing sessions. UI controls refresh after reload. Permission changes and publishing actions are audited. Assignment ownership records retain the person who created them.
