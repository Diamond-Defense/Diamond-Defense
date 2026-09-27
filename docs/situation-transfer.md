# Transfer situations between environments

Administrators can transfer all published situations or a selected subset using a JSON file. No database migration or whole-database import is needed.

## Export from preview

1. Sign in as administrator in preview.
2. Open **Admin workspace → Situations**.
3. Choose **Export**. Published situations load automatically into the searchable library list.
4. Select individual situations, **Select matching situations**, or **Select all situations**, then **Download selected**. Selections remain selected when the search changes.

The file contains published situation content, including ball placement, defensive starts and targets, coaching notes, outcomes, and throw sequences. Staff labels and ball-location labels are included. Local drafts and archived situations are excluded. Accounts, teams, assignments, attempts, and historical revisions are never exported by this tool.

## Import into production

1. Sign in as administrator in production and open **Admin workspace → Situations**.
2. Choose **Import**, select the exported JSON file, then **Review import**.
3. Verify the source and destination addresses. Expand the changed-field details.
4. Select the new or changed situations you want to publish.
5. Choose **Publish selected** and confirm the destination.

Reviewing a file does not write anything. Publishing uses the existing admin publishing API: updates create new destination revisions and preserve previous revisions; new situations receive destination display codes. Unselected situations are untouched.

Situations are matched by their stable key, not by their name. Duplicate keys, archived key collisions, and invalid content are blocked. Matching names and staff labels are allowed; automatic variation tags distinguish the cards. Historical display codes do not determine identity. Resolve conflicts in the source/destination library before exporting again; the importer does not guess which situation to overwrite.

Imports publish one situation at a time. If a request fails, earlier successful publications remain published. Review the file again before retrying; unchanged situations will no longer be selectable. Revision checks reject edits made after the review. If a response is lost, reviewing again determines whether the write succeeded.

Publish or discard local editor changes before importing. The playbook reloads after a successful import. Other signed-in users may need to reload to see the new published content.

Files are limited to 5 MB and 1,000 situations. Treat exported files as trusted administrative content and review every selected change.

Older files that omit audience or ball-location fields retain those fields on existing destination situations. Retired age, field-size, and team metadata is ignored when validating incoming publications. Shared library order is not imported: existing entries keep their order, and new entries are appended.

## Local verification

```sh
npm run check
TEST_PORT=8778 npx playwright test tests/administration-api.spec.js -g "situation transfer"
```

## Replacing an existing library

Administrators can use **Delete permanently** on a library entry or an archived entry in **Recovery → Situations** before importing a replacement. Review the affected-record counts and type the full situation name to confirm. Deletion removes saved attempts, revisions, proposals, and team Playbook selections for that situation. Audit history remains. Export first if a content backup is needed.

Assignments that are not canceled or archived block permanent deletion. After confirmation, references and situation progress in canceled or archived assignments are removed along with the situation. Restoring those assignments will not restore the deleted situation. Imported replacement situations are not automatically added to team Playbooks.


### Delete multiple assignments

Admins can select canceled or archived assignments in assignment history and choose **Delete selected assignments**. **Select all on this page** selects eligible assignments on the current filtered page only. Selection resets when the page or filters change. Review the listed titles before confirming.

Deletion permanently removes those assignments, recipient links, situation references, and assignment progress. Saved attempts remain as results without an assignment link. Other assignments cannot be deleted through this action; cancel or archive them first. No database migration is required.


### Delete multiple situations

In the admin situation library, choose **Delete situations**. Select individual rows, **Select matching situations** for the current search, or **Select all situations** for the entire library. Selections persist across searches; **Clear selection** removes them all. Switching library modes clears selection.

Choose **Delete selected** to review names and affected-record counts, then type **DELETE** to confirm. Any reference from an assignment that is not canceled or archived blocks the entire selection before deletion starts. Canceled and archived assignment references and associated progress are removed as described above. Each situation is deleted separately; if a later deletion fails, the successful deletions remain and the remaining selection can be reviewed and retried. No database migration is required.

When bulk deletion is blocked, the review lists each blocking assignment's name, team, status, and ID. Closed, completed, and draft assignments still retain references. Use **Archive blocking assignments** to confirm moving those assignments out of player queues while preserving their results. This action does not delete situations; choose **Delete selected** again for a fresh review and a separate permanent-deletion confirmation.

Variation numbers and source relationships are included in exports. Apply migration 0027 in both environments before deploying this feature. Existing destination records keep their tags; new imports retain their exported letter when available, or receive the next free letter if that letter is already reserved. Older exports without tags receive them automatically.
