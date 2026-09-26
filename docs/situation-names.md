# Situation names, audience, and library order

Coach and administrator editors use the same naming and audience fields.

## Naming a situation

Choose the **Situation name** in **5. Review**. New situations receive a suggestion when Review is opened; **Use suggested name** applies an updated suggestion. An existing or manually entered name is retained until explicitly changed.

Suggestions combine ball type, the selected ball-location label, and starting runners, for example **Line Drive to LF — Runner on Second**. They exclude the scored outcome (such as a single), defensive answers, difficulty, and staff variants. Confirm the ball-location label in **3. The play**; dragging the ball does not guess or replace that label.

The required name is at most 120 characters. It appears in the playbook, field heading, assignments, and library. Historical situation codes remain searchable but are no longer part of these headings. Renaming never changes the permanent database key.

**Player context** remains optional and appears beneath the name in the player information panel. Do not put solution spoilers in this field.

## Staff labels and filters

Teaching category and difficulty are the main filters. The optional **Staff label** distinguishes versions with the same player-facing name and is hidden from players. Blank and “Standard” mean the same thing.

Age divisions, field dimensions, and team associations are retired. Old payloads can still contain them for compatibility, but they are ignored by labels, uniqueness checks, and new publications. Active uniqueness uses normalized name plus staff label; capitalization and repeated whitespace do not distinguish records. Archived names can be reused, but restoring an active duplicate is blocked.

Migration `0024_situation_staff_labels.sql` updates stored identities. Existing collisions are retained as legacy records rather than automatically renamed or deleted. Staff must choose distinct names or labels when changing their identity. Permanent IDs and existing assignment sequences are unchanged.

## Ordering

Administrators use **Situations → Reorder**, drag rows or use **Move up / Move down**, then **Save order**. The whole active library is shown without search while ordering. The order is shared, and concurrent changes require reloading before saving. New situations are appended.

Ordering does not renumber situations, create content revisions, or rearrange existing assignment queues. Archiving simply removes an entry from the active list. There is no need to close historical number gaps.

## Database rollout and reviewed local names

Apply migration `0023_situation_identity_and_order.sql` with the existing migration command for the intended environment. It adds identity and ordering support; it does not guess names or age suitability for remote records.

```sh
npm run db:migrate:local
# Choose the appropriate remote environment when deploying:
npm run db:migrate:preview
npm run db:migrate:production
```

The reviewed local development library can be migrated with:

```sh
node scripts/rename-local-situations.mjs
node scripts/rename-local-situations.mjs --apply
```

This script requires Node with TypeScript stripping and `node:sqlite` support. It only opens the local development database, previews changes by default, and creates a SQLite backup under `.wrangler/local-maintenance-backups/` before applying. It renames the reviewed legacy entries, archives S10.3 while retaining S07 and its published sequence, records revisions, and applies migration 0023 if needed. Subsequent custom names are skipped. Do not use it as a general remote migration or reseed an existing database.

No accounts, practices, or player results are deleted by these changes. Prelaunch data cleanup remains a separate operation.

The editor shows primary category, difficulty, player context, and an optional Staff label. Related categories expand when needed. Starting outs are in step 2; the legacy Hit outcome filter classification is under **3. The play → Playbook classification**. Archive is under **More actions**, and Discard changes appears only while edits are pending.

## Creation tools

Review includes a live player-card preview using the current draft. The suggested name remains opt-in for existing/custom names. Similar situations are published entries with matching ball type, starting runners, outs, and location label (or exact ball coordinates when a label is unavailable). This is a warning, not proof of identical defensive solutions. Staff can edit an existing entry, create a variation, or continue their current draft.

**Create variation** in the library or similar-situations list copies the setup into an unpublished draft with a new permanent key. It does not alter the original. Choose a distinct name or Staff label before publishing or submitting. Existing unsaved work requires confirmation before replacement.
