# Database environments

Diamond Defense uses four isolated database environments.

| Environment | Storage/database | Lifetime | Intended data |
|---|---|---|---|
| Development | `.wrangler/state` | Persistent | Local working data |
| Automated tests | `.wrangler/test-state` | Recreated per run | Disposable seed data |
| Cloudflare preview | `diamond-defense-preview` | Persistent remote | Sanitized/test data |
| Cloudflare production | `diamond-defense-production` | Persistent remote | Real application data |

All environments expose the binding name `DB`. The application, API routes,
repositories, and SQL therefore use the same access method everywhere.

## Migrations

Migration files live in `migrations/` and are applied in filename order.
Wrangler records completed migrations in each database independently. Running
a migration command repeatedly applies only files that have not already been
recorded for that database.

Commands:

```sh
npm run db:migrate:local
npm run db:migrate:preview
npm run db:migrate:production
```

Migration files are immutable after reaching preview. If preview testing finds
a problem, create a new migration rather than editing one that may already be
recorded. Prefer additive, backward-compatible migrations so the previously
deployed application remains functional if a deployment fails after migration.

## Seed policy

Local startup conditionally installs seed data only into an empty database.
Automated tests always seed their newly recreated state. Preview and production
are never seeded by the deployment command.

Remote seed/import operations are one-time, deliberate administrative actions.
Review all users and passwords before importing them into production.

## Exports

```sh
npm run db:export:preview
npm run db:export:production
```

Export files are ignored by Git and may contain sensitive information. Store
them securely and remove them when no longer required.

## Production refresh roadmap

Planned maintenance commands will support sanitized production-to-preview and
production-to-local refreshes. They will exclude sessions, replace non-production
passwords, optionally anonymize users, preserve target migration history, back
up the target, and require destructive-operation confirmation. They are not yet
implemented and are intentionally not part of deployment.
