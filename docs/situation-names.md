# Situation names and coaching context

The coach and administrator editors share these fields:

- **Situation name** (`title`): required, at most 120 characters. Used in the playbook, field heading, assignments, and situation library.
- **Description / coaching context** (`desc`): optional explanation. Shown beneath the situation name in the field information panel, including player previews. Hidden when empty. It does not replace the name in headings.
- **Situation code** (`displayCode`): assigned separately, for example S02. Renaming a situation does not change its code or database key.

Migration `0022_situation_names.sql` promotes existing descriptions to names for legacy numbered titles. Custom names and their descriptions are retained. Converted records receive a new revision; earlier revisions, attempts, and assignment snapshots are not rewritten. Existing coach proposals remain reviewable with their original submitted contents.

Apply the migration to the environment being updated:

```sh
npm run db:migrate:local
# Or, for the appropriate remote environment:
npm run db:migrate:preview
npm run db:migrate:production
```

Do not reseed an existing database to perform this conversion. Seed generators have been updated for fresh databases only.
