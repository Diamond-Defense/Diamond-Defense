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
The interactive application requires a landscape viewport at least 1024 CSS
pixels wide; narrower or portrait screens display a larger-screen notice.

Guide, account security, and staff drawers are mutually exclusive so only one
navigation surface competes with the strategy board at a time.


## Main navigation labels and icons

The destination formerly named Field is **Play**, with Lucide's play icon. Keep “field” for the baseball surface and retain existing internal `field` route/state identifiers and DOM IDs. Return actions say **Back to Play**; navigation instructions refer to Play.

Use icon plus text in this order: Coach Board (presentation), Play (play), Training (dumbbell), Design (pencil-ruler), Organization (building-2). Coach Board stays a separate top-level destination with extra space after it, hidden for players so Play comes first. Keep the role-dependent primary control icon and ordering synchronized after authentication. Keep permission-owned visibility, the green active underline, Guide (circle-help), and the account menu. Icons use 18px currentColor strokes, are decorative for assistive technology, and do not replace labels. The brand returns to Play through the existing navigation handler.
