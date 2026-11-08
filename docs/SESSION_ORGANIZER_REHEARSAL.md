# Client organizer access and rehearsal

Implementation: 5 November 2026. Based on `feature/player-navigation` at `f9604ed835e8f51670f637c02f54487cea9f249e`.

## Organizer workflow

1. The administrator prepares a session, assigns the characters, freezes the character sheets and marks it READY.
2. In **Accès organisateur client**, enter the customer's Google account email and click **Enregistrer et autoriser**.
3. Copy the `/?organizer=<session UUID>` link. The application does not send an email.
4. The customer signs in with that verified Google account. The account is checked on each protected server request; the link alone grants no access.
5. **Commencer les essais** creates a separate READY rehearsal. Its player links are usable for testing, with an explicit rehearsal banner in the player portal. The customer starts it with the existing live controls.
6. **Remettre les essais à zéro** archives the previous rehearsal, disables its player links and creates a fresh rehearsal from the original preparation. Configuration, casting and frozen character sheets are copied. Test progress, private notes, player tokens and opening/read counters are not copied.
7. **Démarrer la partie réelle** closes the active rehearsal, rebuilds the original session's initial runtime, initializes its events and first phase, enables the original player links (creating missing tokens), and starts LIVE. Repeated/concurrent requests cannot launch it twice.
8. The customer uses the real session's player links. Rehearsal reset and pre-game editing are locked after the real launch. Existing pause/resume/finish controls remain available. The consumed marker cannot be cleared through client endpoints.

Preparation becomes read-only to the customer once the first rehearsal exists. The administrator retains the existing global management controls. Revoking or changing the email immediately prevents new organizer requests; player access is independent. Archiving a source session also denies delegated organizer access. Purging a source session purges its rehearsal descendants.

## Server authorization

Every HTTP export in `functions/src/index.mjs` passes through `securedOnRequest`. An explicit allow-list identifies public token-based player/registration routes. Every other route requires a verified, non-revoked Firebase ID token. Unknown/new routes default to administrator-only. Administrator emails retain the existing `ORGANIZER_EMAILS` configuration (default: Guillaume's existing account).

Delegated customers can operate their assigned session and its current rehearsal only. Library browsing/import, scenario editing/media, session creation/listing/archive/purge, and organizer delegation remain administrator-only. All private web requests attach the ID token, including session packs opened in another tab. Public player/registration routes retain their token-based access.

SQL Connect returns UUIDs without separators; session access normalizes these before comparing them to stored rehearsal references. Rehearsal and real-launch transactions use a single conditional UPDATE on the original licence row, checked for exactly one affected row. This serializes competing transitions and verifies the assigned email and enabled flag again inside the transaction. No-op locking plus a second update of that same row is deliberately avoided (PostgreSQL CTE semantics).

Each rehearsal has a distinct session ID and participant IDs. A late request from a retired test run can never write into the fresh run or the real session. Retired runs are archived and player access disabled; their data remains until the administrator purges the source session. Original participant records, including original player tokens, are retained at real launch.

## Validation

- Targeted authorization, rehearsal, cleanup, session preparation, runtime, live control, player portal and private-notebook unit tests.
- `npm run test:integration:self-service --prefix functions`: a **demo-only local** SQL Connect/PostgreSQL test, including >100 resource assignments, preserved casting, retired links, initialization over an existing runtime, concurrent real launches and revocation. It refuses to run without the emulator and the demo project ID.
- Local schema/connector compilation with the installed SQL Connect emulator's `build -config_dir dataconnect` command.
- `npm run build --prefix web`.
- `web/test/browser-organizer.cjs`: mobile Chromium test with mocked identity/API responses. Tests scoped navigation, auth headers, rehearsal/reset, real launch and lockout, denied access and administrator delegation. This does not validate Google's live OAuth popup or production infrastructure.

## Release requirements

Code is prepared without production writes. Deploy the additive SQL Connect schema first, then **all Functions and Hosting** from this revision. A hosting-only or selected-functions deploy is insufficient: private endpoints must all receive their authorization wrappers. The existing deployment workflow's `all-functions-and-hosting` scope supports this. No authentication provider configuration or account permissions need changing: Google sign-in is already used by this application.

Before customer use, validate Google sign-in with an assigned external account, verify that another account and an unrelated session are denied, and run one rehearsal/reset/real launch on a disposable session. This production OAuth/infrastructure check is separate from the automated local tests.
