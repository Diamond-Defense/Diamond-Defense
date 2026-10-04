# Canonical Situation authoring contract — Phase 03

## Canonical data and ownership

The existing `Situation` record is the canonical structured play. Situation Builder, Coach Board, shared playback, and future presentation/library consumers use that record. There is no second Situation schema, coordinate system, or throw representation.

| Data | Owner and meaning |
| --- | --- |
| `key`, `displayCode`, `revision`, lifecycle/variation fields | Situation identity and repository concurrency. Editor switching preserves them. The repository assigns public codes and revisions. |
| `title`, `desc`, categories, difficulty, audience, divisions, sequence note | Structured Situation details, edited in Situation Builder and retained by the Board adapter. |
| `starts`, `runnersOn`, `outs`, `hit`, `hitType` | Authored initial baseball state and batted-ball destination/type, in shared native field coordinates. |
| `targets` including coordinates, tolerance, and notes | Correct defensive final state. Player verification uses these targets/tolerances. |
| `playSeq`, optional `playSeq2` | Canonical defensive sequences used for verification and instructional throw events. Recurring positions are valid throw routes. |
| `playOutcome`, `runnerOutcomes`, compatibility `batterAdvance` | Structured baseball results and outs. Existing outcome normalization/validation remains authoritative. |
| Optional `boardAnimation` | Versioned instructional movement geometry and event starts. Never a Player Mode answer requirement. |
| Board id/revision, offense chip numbers, incomplete Board state | Independent coaching aid storage, scoped to its owner. Saving a Board does not publish a Situation. |
| Selection, panel mode, render frames, clocks, transfer envelope | Transient editor/runtime state. Never stored as Situation fields. |

Situation target notes and tolerances survive visual edits. The adapter starts with a clone of the full Situation and overlays only fields edited visually, preserving other properties. Native coordinates retain precision through the legacy Builder normalization. The version-2 animation/event contract is documented in `play-animation-contract.md`.

## Editing surfaces and identity rules

Situation Builder's **Edit in Coach Board** carries the current draft, original baseline, and proposal rationale. It includes unsaved structured changes. Coach Board's **Situation Details** returns the same draft to the shared coach/admin Builder. Switching views creates no records and does not publish changes.

In the Board library, **Edit Situation** links the visual editor to that Situation. **Load Situation** retains its earlier meaning: create an independent Board projection for teaching or later conversion. These are explicit, distinct actions. An independent Board retains **Save as Situation**, its focused outcomes form, and Create Situation. After successful conversion, the new record becomes the linked Situation and supports the same Details/edit workflow.

A linked existing Situation publishes with PUT and `If-Match` using its loaded revision. A new draft originating in Situation Builder retains its draft key and receives its first record only on explicit publication via POST. Stale publication rejects with 409 and leaves the draft intact. There is no automatic duplicate or intermediate Situation created by switching editors.

## Dirty state and navigation transfer

Full-document navigation remains necessary because gameplay uses classic document-level scripts. `authoring.js` transfers a canonical draft in per-tab `sessionStorage`, scoped to the authenticated user and intended destination. It retains the original baseline and rationale and is consumed only after that editor initializes. Transfers expire after 24 hours and are cleared on user mismatch or malformed data. Storage errors leave the current editor open.

Board replacement/New Board/loading another play asks before discarding dirty edits. Back to field asks before leaving; browser refresh/back/close uses the browser's unsaved-change prompt. Intentional editor handoffs preserve edits and bypass the discard prompt. The Builder restores its correct staff pane, baseline, and dirty badge. Saved Boards remain separate from pending Situation publication: Save Board does not mark a linked Situation published.

Transfer storage is a navigation mechanism, not autosave or durable recovery. Refreshing after dismissing the browser warning can discard an unpersisted draft. Drafts are not shared between tabs/devices. Rationale and transient authoring context do not become Situation fields.

## Geometry and animation reconciliation

`fromSituation` produces a Board projection from canonical starts/targets/outcomes and optional metadata. Missing actor routes use direct target paths or inferred runner routes. Recorded curves/segments/events are retained when supplied. The current Situation hit, starts, and target endpoints remain authoritative when structured edits modify them.

`situationDraft` overlays visual edits onto the full source Situation. A changed setup start does not discard the original correctness target when its old route is cleared; unrecorded actors use direct fallback on playback/import. Final recorded defender endpoints become edited targets, retaining target tolerance/notes. `syncSituationAnimation` reconciles optional metadata when crossing editors and before saving; it does not add metadata to legacy Situations merely to open Situation Builder.

No movement is required to edit a legacy Situation. Animation versions 1 and 2 remain readable; unsupported versions or impossible references/dependencies fail validation. Forms retain structured controls for notes, tolerances, categories, audience, and precise baseball outcomes. Spatial editing is available through the same Board field rather than another field renderer.

## Validation and permissions

Shared `situationPlayIssues` validates starting/final field positions, target tolerances, the ball destination, starting outs, both sequences, and animation dependencies. Builder guidance, linked Board save checks, and server Situation validation use this helper. Missing coaching notes are warnings, consistent with notes being optional in existing Board conversion. Existing structured metadata/outcome validation remains in place.

Publishing and coach submissions now share the server repository's `validateSituation` normalization/validation path. Approval runs through the same Situation repository. Animation and secondary sequences are included in proposal comparison and selectable approval fields. Geometry, metadata, and outcomes still preserve their independent ownership; selected partial approvals are reconciled/validated against the resulting canonical Situation.

Administrator and explicitly authorized Situation publishers can publish. Other coaches submit linked edits through the existing proposal endpoint with a rationale; Player Mode continues using the published record until approval. Board/UI access does not grant publishing permission. Existing publisher-coach shared-library confirmation remains in the visual workflow. Revisions carried by coach proposals are checked when provided, preventing a stale linked draft from silently using a newer baseline.

## Scope and verification

No D1 migration is required for Phase 03. Existing Situation JSON carries animation metadata; the Phase 01 Board table remains independent. No bulk legacy rewrite, collaboration, movement arrows, timeline editing, or new verification rules were added. Sidebar layout, shared token styling, playback controls, and focused Save as Situation mode are preserved.

Pure tests cover identity/detail retention, geometry/event reconciliation, legacy fallback, shared validation, and per-user transfer. Browser tests cover unsaved Builder/Board round trips, same-record publication, preserved segments/details, explicit discard cancellation, revision conflicts, new draft creation, coach proposal/approval permissions, existing Board conversion, touch input, and normal playback. Broader application/database regressions should be run locally using the commands in `coach-board.md` before proceeding to Phase 04.
