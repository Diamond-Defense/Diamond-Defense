# Account security

Diamond Defense stores password and session state in the same portable SQLite
schema used by local D1, Cloudflare preview, and Cloudflare production.

## Password lifecycle

- Player and coach accounts are created with an administrator-issued temporary
  password containing at least 8 characters.
- An administrator reset also creates a temporary password, clears any login
  lock, and signs that account out everywhere.
- The next successful login is limited to the Account Security screen. Game,
  reporting, and administration APIs remain unavailable until the user chooses
  a permanent password.
- A signed-in player, coach, or administrator opens their name or player number
  in the header, then selects **Account security** to change their own password
  after providing the current password.
- Changing a password requires at least 8 characters, rejects reuse of the
  current password, signs out other sessions, and creates a fresh session for
  the current browser.
- Passwords are stored only as salted PBKDF2 hashes with 100,000 iterations.

The administrator command-line password scripts remain available for initial
setup and emergency administrator recovery. They are not the normal reset path
for player or coach accounts.

## Login protection

Five unsuccessful logins for an existing account create a 15-minute lock. A
successful login clears the failure count. An administrator password reset also
clears a lock. Login responses do not reveal whether an account exists: invalid
selections and invalid passwords use the same message.

## Sessions

Sessions have both limits:

- 7 days from sign-in, regardless of activity.
- 12 hours without activity.

Active sessions update their last-seen time at most once every 5 minutes to
avoid an unnecessary database write on every request. **Sign out everywhere**
deletes all sessions for the account, including the current browser. Password
changes and administrator resets also invalidate every prior session.

## Deployment

Migration `0007_account_security.sql` must be applied before deploying the code
that uses these fields:

```sh
npm run db:migrate:preview
npm run db:migrate:production
```

Apply and verify preview first. Each environment maintains an independent
migration ledger; applying the migration does not change existing passwords or
force existing accounts to change them.
