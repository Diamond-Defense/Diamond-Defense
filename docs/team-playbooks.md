# Team Playbooks

Coaches open **Coach workspace → Team Playbook**. Administrators open **Situations → Team Playbook**. Coaches manage their own team; administrators choose a team. Search published situations or filter by teaching category, difficulty, and optional Suggested divisions (9U–18U). Check the situations to include, then **Save team Playbook**. Selections survive filter changes. **Select all matching** and **Deselect matching** affect only the current search and filters; selections outside those results remain unchanged. With no filters, they apply to the whole list. Changes still require **Save team Playbook**. The list uses two columns on wider screens and one on smaller screens. Changing teams or leaving without saving discards selection edits.

Players browse and use Random from their team's selections. New publications are not added automatically. An empty selection is allowed and shows a setup message. Staff can still browse the complete published library and create variations. Removing a selection does not archive the situation or change another team's selections. Changes reach players after reloading; the server rejects free-play submissions for situations no longer selected.

Assignments can contain any published situation, even when not selected for the team's Playbook. Only assigned players receive the practice's saved situation through that assignment. This does not add it to browsing or Random. Existing assignment access, completion, and review rules still apply. Permanent situation identities and assignment snapshots remain unchanged.

Suggested divisions help coaches discover content; they do not grant or restrict access. They are edited in Details and follow coach proposal approval. Staff labels remain private in the interface. Player context appears on cards and can distinguish otherwise identical setups without revealing the solution. Team selection warns about visually identical entries.

## Rollout

Apply migration **0025_team_playbooks.sql** after the earlier situation migrations. It selects the current active library for existing teams, preserving their experience. Teams created afterward start empty. Development/test seeds explicitly populate starter selections; do not reseed live databases for this rollout.

Use the normal environment migration commands (`npm run db:migrate:local`, `npm run db:migrate:preview`, or `npm run db:migrate:production`) for the intended environment. Exported situation files contain Suggested divisions but never team selections.
