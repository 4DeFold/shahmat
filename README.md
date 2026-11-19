# shahmat

## The best chess arena. 

## Responsive browser checks

```sh
npm ci
npx playwright install chromium
npm run dev                 # leave running in one terminal
npm run test:responsive     # run in another terminal
```

The checks use isolated mock authentication and profile responses, not real Supabase accounts. Screenshots and viewport measurements are written to `responsive-evidence/` (ignored by Git). Set `RESPONSIVE_BASE_URL` if the dev server uses another port.

`npm run test:sync` runs a two-session browser check with a shared mock Supabase account. It also checks menu/page animations and reduced motion. No real account data is changed.

## Pages and assets

The landing page is `/`, with PLAY opening the standalone guest demo at `/play`
and «Войти» opening `/login`. The dashboard «Играть» link opens a separate
`/game` page inside the persistent dashboard, with the existing sidebar and
profile controls. The board appears immediately; Supabase Auth is checked in the
background. The member screen offers match search for blitz (3 minutes), rapid
(10 minutes) and classical (1 hour), per player, without an
increment. Search pairs distinct authenticated users with the same control.
The Supabase `matchplay` Edge Function validates legal moves with chess.js;
transactional SQL serializes matching and updates clocks using server time.
An active match resumes on return. Online games are rated, and the
previously requested automatic bot fallback is not implemented: search waits for
another player. The guest demo remains an independent local bot game; its move
history is saved in browser localStorage and clearing browser data removes it.
In the guest demo, “Новая партия” opens registration. If the game has ended,
the first click also starts a one-hour countdown; the completed game is preserved
until the deadline and the board resets when it expires. The deadline is stored
locally and survives navigation and refresh; clearing browser data removes it.
No game data is sent to Supabase. The account palette can be changed in `/settings` (the initial choice remains in onboarding); selecting the active palette again switches light/dark theme. The account game follows the selected palette and theme;
the guest demo uses a monochrome board and the device or saved theme preference. Chess pieces are Colin M. L. Burnett’s Cburnett SVGs, copied unmodified from
Lichess under GPL-2.0-or-later. The source, attribution and full GPL-2.0 text
are in `public/pieces/cburnett/`. This license applies to these assets; review
its terms before redistribution or modifying them. The signed-in sections use `/home`, `/profile`,
`/settings`, and `/help`. Their markup lives in `pages/` and is loaded on demand;
the authentication shell and application code are also deferred on a fresh
landing-page visit. Navigation uses real links and the History API, while Vercel
rewrites routes for direct visits and refreshes. Old `#play`, `#profile`,
`#settings`, and `#help` bookmarks are upgraded without changing Supabase's
email callback fragments. The original logo is in `public/images/shahmat-logo.png`;
`public/favicon.svg` uses vector outlines and does not require a font download.

To test production routing and lazy loading using mock Supabase responses:
`VITE_EMAIL_OTP_READY=true npm run build`, then `npm run preview`, and in another
terminal `npm run test:routes` (set `RESPONSIVE_BASE_URL` if needed).
`npm run test:game` and `npm run test:game-appearance` check guest play, themes,
piece images, movement animations and reduced-motion behavior in the browser.

## Database foundations

- `auth.users` is managed by Supabase Auth and contains account credentials.
  `public.profiles` is the existing user profile table: `id` references the Auth
  user, and it stores `username`, `bio`, `palette`, and `created_at`. Profiles
  are created during onboarding; existing RLS only allows users to access their
  own profile. Appearance theme is stored in Auth user metadata.
- `public.games` stores player IDs (white and black), status, result and reason,
  starting FEN, initial clock and increment in milliseconds, and timestamps.
  Deleting an account sets its player reference to null to retain game history.
- `public.game_moves` stores each half-move ordered by `ply`, its color, UCI
  notation, optional SAN and resulting FEN, remaining clocks in milliseconds,
  and timestamp. Deleting a game cascades to its moves.

These are storage foundations and are not used by the local bot game. Both game
tables have RLS enabled and no client privileges or policies, so anonymous and
authenticated clients cannot read or write them. A future implementation must
add deliberate read policies and trusted server-side authorization, legal-move
validation, clock handling, and atomic game-state updates; the SQL constraints
alone cannot enforce chess rules or turn order. Do not expose the service role
key to browser code. No game data is populated by this migration.

The game migration is tracked locally with the same version as the applied
Supabase migration. The older `create_profiles` migration predates this workflow:
its local filename is `20261113140000`, while the existing remote migration
history records it as `20261113151708`. Reconcile that historical mismatch before
using a CLI command that automatically applies migrations to an existing project.

## Email verification and password recovery

The registration and recovery UI is intentionally disabled unless the build has
`VITE_EMAIL_OTP_READY=true`. This public build flag is only a rollout guard; it
is not a security boundary. Supabase Auth itself must require confirmation.
Existing password logins continue to work while the flag is off.

The deployed preview and production currently share the same Supabase project.
Changing its Auth settings affects both: enabling confirmation before the new
frontend is deployed to production will break the old production signup flow.
For an independent end-to-end test, use a separate test Supabase project; or
schedule a coordinated production cutover. Never put SMTP credentials in code,
Vite variables, or chat.

Before enabling the build flag for an environment:

1. Configure a custom SMTP provider under Supabase Authentication → Emails →
   SMTP Settings, including a verified sender. The built-in sender only delivers
   to authorized team addresses and has a small shared email limit.
2. In Authentication → Email Templates, use the **Confirm signup** and
   **Reset password** bodies in `supabase/templates/confirmation.html` and
   `supabase/templates/recovery.html`, or custom templates with `{{ .Token }}`.
   Links using `{{ .ConfirmationURL }}` are supported as well. Configure a
   **6-digit** email OTP and an expiry no longer than 3600 seconds in the Auth
   email settings or the Supabase Management API. Set the Auth Site URL to the
   production site so email links lead to the deployed application.
3. Enable **Confirm email** for the Email provider and check the server's
   verification/email rate limits. A minimum password length of at least 8 in
   Auth settings is recommended too.
4. Set `VITE_EMAIL_OTP_READY=true` in the relevant Vercel environment and
   redeploy. Do not enable it while Supabase auto-confirm is on: the frontend
   cannot prevent direct API clients from bypassing verification. If Auth still
   returns a session immediately after sign-up, the UI signs out and reports
   registration unavailable, but the server may already have confirmed the user.
5. Test with a real mailbox: registration, wrong/expired code, resend, password
   reset, refresh on the new-password page, and sign-in with the new password.
   Check spam and SMTP logs if mail does not arrive. This repository's automated
   browser checks use mocked Supabase and do not test delivery.

For local mocked browser tests only, start the server with
`VITE_EMAIL_OTP_READY=true npm run dev`, then run `npm run test:responsive`.
Do not use this flag against a real auto-confirm-enabled project for signup.

## Rating foundation

The active ЯР and shadow Elo implementation, calibration and leaderboard are
described in `RANKING_STRUCTURE.md` and `rating/YAR_IMPLEMENTATION.md`. Online
games are rated by database-side logic; the separate bot games described below
are always unrated and their client-reported results are not authoritative.

## Bot games (preview)

Signed-in players can visit `/bot` and choose levels 1–5 or Stockfish.
Their figures progress from Pawn to King. All levels use Stockfish.js 17.1 with progressively higher UCI limits;
the 1/6–6/6 scale is a UI convention, not a measured percentage of chess ability.
The King uses the full single-threaded NNUE network with no skill limit and a
2.5-second move budget. The other five use the lite engine and strength limits.
The full network is approximately 75 MB and is downloaded lazily on its first
move; WASM and Web Workers must be supported. Engine failures are shown with a
retry action, never replaced silently with another algorithm.

Stockfish.js is GPLv3; its exact source revision is
https://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f
and the license is served at `/stockfish/COPYING.txt`. `npm ci` installs the
engine and the Vite plugin copies only the relevant worker and network files
into the build; these generated binaries are not committed.

`bot_games` stores client-generated, unrated snapshots. RLS permits each
authenticated user to read and write only their own rows. The moves, outcomes,
level and minute-before-resignation rule are client-side and must not be trusted
for leaderboards, prizes or anti-cheat. Bot games do not enter `online_games`
or trigger rating calculations. Pending writes and the current game are cached
per account locally and retried after network failures. Preview currently shares
the production Supabase database, where the additive bot table has been applied.
For browser checks, run `npm run build`, `npm run preview`, then `npm run test:bot`;
Supabase is mocked, while the Stockfish worker actually runs in the browser.
