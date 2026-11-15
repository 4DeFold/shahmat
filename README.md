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
