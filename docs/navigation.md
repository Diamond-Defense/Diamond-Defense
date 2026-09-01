# Role-aware navigation

Diamond Defense keeps global account actions separate from controls that apply
only to the current baseball situation.

## Signed-out navigation

The header shows **Login** and **Guide**. Login opens the shared player, coach,
and administrator login dialog. Game and situation controls remain disabled
until a valid account session is loaded.

## Account menu

After login, the Login control becomes the account's display name. Players also
see their jersey number. Opening the control shows a compact account menu with:

- the account name, role, team, and jersey number when applicable;
- **Account security** for password and session management;
- **Log out** for the current session.

The menu closes when focus returns through Escape, the user clicks outside it,
or another header surface opens. Accounts with a temporary password are sent
directly to Account Security and cannot use the game or staff workspace until
the password is changed.

## Role-specific workspaces

Players use the strategy board and do not see a staff workspace control.
Coaches see **Coach workspace** and administrators see **Admin workspace**.
Compact mobile labels shorten these to **Coach** and **Admin** without changing
their accessible names.

Guide, account security, and staff drawers are mutually exclusive so only one
navigation surface competes with the strategy board at a time.
