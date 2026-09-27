# Situation names, audience, and library order

Coach and administrator editors use the same naming and audience fields.

## Naming a situation

Choose the **Situation name** in **5. Review**. New situations receive a suggestion when Review is opened; **Use suggested name** applies an updated suggestion. An existing or manually entered name is retained until explicitly changed.

Suggestions combine ball type, the selected ball-location label, and starting runners, for example **Line Drive to LF — Runner on Second**. They exclude the scored outcome (such as a single), defensive answers, difficulty, and staff variants. Confirm the ball-location label in **3. The play**; dragging the ball does not guess or replace that label.

The required name is at most 120 characters. It appears in the playbook, field heading, assignments, and library. Historical situation codes remain searchable but are no longer part of these headings. Renaming never changes the permanent database key.

**Player context** remains optional and appears beneath the name in the player information panel. Do not put solution spoilers in this field.

## Staff labels and filters

Teaching category and difficulty are the main filters. The optional **Staff label** distinguishes versions with the same player-facing name and is hidden from players. Blank and “Standard” mean the same thing.

Situations may share a name and staff label. Their permanent keys identify them; staff labels are optional and never become player labels automatically.

## Automatic variation tags

Migration `0028_situation_variation_starting_state.sql` corrects the title-only grouping from 0027. Letters now belong to matching shortened titles, starting runners, outs, ball type, and ball-location labels (or ball coordinates to 0.001 field units when a label is unavailable). ASCII capitalization and surrounding spaces in titles are ignored. For example, matching **Line Drive to LF** cards show **Variation A**, **Variation B**, and so on. A lone situation in a new group has no visible tag. Different runners or outs create separate groups, even when their card titles match. Tags appear in the card title and field heading.

Migration 0028 resets the overly broad letters once, assigning letters in library order within each corrected group. New publications reserve the next available letter. Reordering, archiving, or deleting records does not renumber the survivors or reuse a deleted letter. Renaming into another title group obtains a tag in that group; returning to an old group restores that record's reserved tag. Tags identify alternatives, not chronological revisions or difficulty levels.

Draft tags are previews; the server assigns the final tag on publication, including when two coaches draft at once. Player context remains optional and should explain any relevant, spoiler-free condition. A letter distinguishes cards but cannot explain why one defensive response is appropriate.

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

**Create variation** in the library or similar-situations list copies the setup into an unpublished draft with a new permanent key. It preserves the source content and records the source relationship. The review step shows collapsed **Related variations** without another Create variation button. A public tag is automatic; no distinct staff label is required. The original card also shows its reserved tag once another matching starting situation is published. Existing unsaved work requires confirmation before replacement.
