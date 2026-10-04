# Board & Situation Library — Phase 06

Choose **Coach Board** on the main page to open the card library. The same default entry applies to `/coach-board`; authoring handoffs from Situation Builder go directly to their existing draft instead. **New Board** in the library header opens a blank editor. The explicit `/coach-board?edit=1` entry remains available for a blank editor.

Cards reuse the existing Situation-selection design and runners/outs graphics. Clicking the main card opens **Presentation**, paused at the starting alignment. Each card offers **Edit** and a secondary **Duplicate** action. Search, content type and sorting stay visible; additional baseball filters expand when needed. Cards use one column on phones, two on tablets and three on desktop. The redundant Load Board or Situation selectors have been removed.

Presentation offers **Back to Library** for plays selected from the library; editing is chosen from a card. Presentation entered from an editor retains its existing Exit Presentation behavior, including returning Situation Builder drafts to their originating editor. Back to Library pauses/exits presentation while retaining the current draft; closing the library returns to its tools. Closing the initial library without opening a play returns to the main field. Unsaved replacement guards remain in place.

Phase 05 was deliberately deferred after the user reported successful hands-on coaching checks and approved Phase 06. No animation timing or geometry semantics change in this phase.

## Search and filters

Search matches names, Situation descriptions, display codes, existing teaching concept IDs and structured ball locations. Filters combine content type, exact occupied-base combination, outs, batted-ball family, Situation ball location and Situation teaching concept (primary or related). Sort by recently updated, recently created or name. Equal sort values use stable title/type/identity tie-breakers.

Fly balls and pop flies share an air-ball family because legacy Situation hit types do not reliably distinguish them. Location/concept filters use recorded Situation data; Boards do not acquire guessed classifications from field coordinates. Concept filters read canonical `situation_teaching_categories`, including backfilled legacy records. No new tags, ages or team classification are invented.

`GET /api/play-library` performs bound SQL filtering, sorting, counting and paging in D1. Search is a literal substring (`instr`), so percent/underscore characters are not wildcard operators. SQLite's existing lowercase behavior applies. Responses contain summaries only, at most 50 per request (20 rows in the dialog). Opening a play fetches its full data from `/api/play-library/board/:id` or `/api/play-library/situation/:id`. Search input is debounced; stale requests are aborted. Empty results offer filter reset and New Board. No external search service is introduced. Substring/JSON filtering still scans candidate records; this is bounded network loading, not full-text indexing.

## Actions and copies

The library is a selection/creation surface: cards offer Presentation, Edit and Duplicate. Situation Details, Save as Situation and deletion/archive are not library actions.

Editor tools retain **Save as Situation** / **Save Situation Changes**. New Board is available only in the library header, and the redundant Situation Details shortcut has been removed from Board tools; structured details remain available in the existing Situation Builder. **Delete Board** appears only for a saved Board; **Archive Situation** appears only for an existing Situation and an admin. The focused Save as Situation form retains its validity checks and hides other tools as before. Incomplete Boards remain editable/presentable.

Duplicate asks for a copy name and opens a separate **unsaved draft**. It does not write or replace the source. Board copies have no saved Board ID/revision; Save Board creates a new record owned by the current user and enforces existing name checks. Source Situation data retained in a Board is cloned provenance, not a linked edit identity.

Situation copies receive a new key and discard revision, display code, archive/audit and variation-number fields. Structured targets, starts, outcomes, notes, extension data, secondary throws and instructional animation are cloned. Publishing allocates a new Situation identity/display code through the existing repository. A coach without publishing access submits a create proposal through the existing review workflow instead. Copies remain protected by the ordinary unsaved-edit guard.

Delete Board uses explicit confirmation and an owner/revision-checked DELETE; stale revisions do not delete a changed record. Deleting the current saved Board retains its open draft for saving under a new ID. Archive Situation lists affected team Playbooks in its confirmation and calls the existing admin-only revision-checked archive API, retaining historical data. Archiving from the editor preserves its open draft as an independent Situation copy, with a fresh key and no revision, so the old archived identity cannot be accidentally revived. Library close restores keyboard focus. Selecting cards fetches full detail only when needed.

## Permissions

The library and detail endpoints require an authenticated Coach/Admin with completed password setup. Every Board list/detail/delete is scoped to the authenticated owner, including for admins. Active Situations remain shared across staff, matching existing Situation access; archived records are omitted. Players and anonymous users cannot access this staff library. Copies use existing Board-save, publisher or proposal authorization; no permission is granted by the client buttons. Situation archival remains admin-only. Writes enforce the existing same-origin policy. No new public sharing or team ownership model is introduced.

## Migration and implementation

New migration: `migrations/0030_play_library_indexes.sql`. It adds active-Situation date indexes and an owner/created-date Board index; the existing owner/updated Board and teaching-category indexes remain in use. It does not rewrite play payloads or change animation schema.

Apply it to your normal local database before starting the updated app (the isolated browser harness applies it automatically):

```sh
npm run db:migrate:local
```

Files for this phase:

- `src/lib/components/PlayLibrary.svelte`: dialog, search/filter controls, cards, copy naming, paging and responsive styling.
- `src/lib/plays/library.js`: independent draft cloning and summary labels.
- `src/routes/api/play-library/+server.ts`: authorized, paginated SQL discovery.
- `src/routes/api/play-library/[type]/[id]/+server.ts`: authorized details and revision-safe Board deletion.
- `src/routes/coach-board/+page.svelte`: library-first navigation, editor-only management and draft handoffs; preserved sidebar/conversion flow.
- `scripts/play-library.test.mjs`, `tests/play-library.spec.js`: copy isolation, filtering/pagination/sorting, write permissions, presentation/details, archive, coach proposals and populated touch layouts.

## Validation and local regression

Script tests: 58 pass. Type checking: zero errors/warnings. Focused browser validation: **25 passed**, covering the library and existing Board, unified authoring, Presentation and coaching checkpoint workflows. Desktop/tablet/phone screenshots are inspected. The production build runs through the browser harness; the existing chunk-size warning remains.

For broader regression locally, run these sequentially:

```sh
npm run db:migrate:local
npm run test:scripts
npm run check
npx playwright test tests/play-library.spec.js tests/coach-board.spec.js tests/situation-authoring.spec.js tests/presentation.spec.js tests/coaching-checkpoint.spec.js tests/app.spec.js
```

Do not overlap `npm run check` with the browser harness build: both operate on Svelte's generated workspace. Tests use isolated local data unless explicitly configured with `BASE_URL`.

Deferred: full-text search, new tag/level/team scopes, folders, bulk operations, marketplace/sharing, collaboration, and animation editor refinements. The separately recorded out-type/out-order form gap remains a future integration refinement.

## Teaching and visual cleanup

Normal Watch Solution and Board preview/presentation now use a shared quarter-speed clock (four times longer than previously); Slow and Fast apply to that teaching baseline. Authored geometry, event times, stepping, reduced-motion behavior and stored records stay unchanged. Defensive labels are always shown; the Show Labels control and hiding code were removed. The Board draws its actual batted-ball path from start to destination, with a dashed ground-ball line, independently of defensive throw arrows.

Cards omit the marked batted-ball/location/concept summary, update date and record references. Those fields remain searchable/filterable without crowding the cards. No migration is needed for these refinements.
