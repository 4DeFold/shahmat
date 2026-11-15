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
