# Playbook metadata and browsing

Cloudflare D1/SQLite is the only runtime source of truth for the Playbook. The
application does not load situation JSON files in the browser.

Each published situation has two searchable metadata fields:

- **Category** groups related baseball concepts, such as Singles or
  Extra-base hits.
- **Difficulty** is Beginner, Intermediate, or Advanced.

Players open **Playbook** from the main navigation. They can search titles,
descriptions, categories, and stable situation keys; filter by category,
difficulty, or whether runners are on base; or choose a random situation from
the filtered results. Selecting a card updates the strategy board and closes
the browser. The adjacent **Random** command skips the browser and immediately
chooses a different published situation for quick practice.

Player-facing labels combine the stable database key with the baseball title.
For example, `BD-02` is displayed as **S02 · Single to CF**. Compound keys such
as `BD-10-1` become **S10.1**. The Playbook card also shows runners and outs,
while the compact header label avoids repeating status already shown beside it.

Coaches and administrators edit metadata in the shared Situation Details
step. Coach changes remain proposals until an administrator approves them.
Administrator changes become visible after publishing.

## Database rollout

Apply migration `0008_situation_metadata.sql` to local, preview, and production
before deploying this version. It adds indexed `category` and `difficulty`
columns and classifies existing published situations. No account, attempt, or
team data is modified.

The generated seed files also include these columns. Root JSON files remain
development seed inputs only and are never used for runtime storage.
