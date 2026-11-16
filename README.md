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

The landing page is `/`. The signed-in sections use `/home`, `/play`, `/profile`,
`/settings`, and `/help`. Their markup lives in `pages/` and is loaded on demand;
the authentication shell and application code are also deferred on a fresh
landing-page visit. Navigation uses real links and the History API, while Vercel
rewrites those routes to the shared shell for direct visits and refreshes. Old
`#play`, `#profile`, `#settings`, and `#help` bookmarks are upgraded without
changing Supabase's email callback fragments. The original logo is in
`public/images/shahmat-logo.png`; `public/favicon.svg` uses vector outlines and
does not require a font download.

To test production routing and lazy loading using mock Supabase responses:
`VITE_EMAIL_OTP_READY=true npm run build`, then `npm run preview`, and in another
terminal `npm run test:routes` (set `RESPONSIVE_BASE_URL` if needed).

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

These are storage foundations, not a playable game implementation. Both game
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
