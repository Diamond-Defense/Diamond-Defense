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

Situations are matched by their stable key, not by their name. Duplicate keys or active name/staff-label combinations, archived key collisions, and invalid content are blocked. Historical display codes do not determine identity. Resolve conflicts in the source/destination library before exporting again; the importer does not guess which situation to overwrite.

Imports publish one situation at a time. If a request fails, earlier successful publications remain published. Review the file again before retrying; unchanged situations will no longer be selectable. Revision checks reject edits made after the review. If a response is lost, reviewing again determines whether the write succeeded.

Publish or discard local editor changes before importing. The playbook reloads after a successful import. Other signed-in users may need to reload to see the new published content.

Files are limited to 5 MB and 1,000 situations. Treat exported files as trusted administrative content and review every selected change.

Older files that omit audience or ball-location fields retain those fields on existing destination situations. Retired age, field-size, and team metadata is ignored when validating incoming publications. Shared library order is not imported: existing entries keep their order, and new entries are appended.

## Local verification

```sh
npm run check
TEST_PORT=8778 npx playwright test tests/administration-api.spec.js -g "situation transfer"
```
