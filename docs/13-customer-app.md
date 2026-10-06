# 13 — Customer app (Phase 8)

The customer's phone app: sign in, book a pickup, follow an order. Expo (React Native) with
expo-router, NativeWind, and TanStack Query, in `apps/mobile`. It talks to the same API as the web
(`@ironman/api-client`, `@ironman/tokens`); the screens are its own (`docs/05 §10`).

## 1. What is built

**Batch 8.1 — foundation and booking**

- **Sign-in.** Phone number and a texted code. Numbers are normalised to `+91…` the same way the
  website does, so a customer who booked on the web and signs in on the app is one account.
- **Staying signed in.** Access tokens last 15 minutes, so the app renews them from the 30-day
  refresh token and replays the request that failed (`packages/api-client`). Concurrent failures
  share one renewal. Being offline never signs anyone out; only the server refusing the renewal does.
- **Orders tab.** The customer's orders, pull to refresh, and re-quote approvals.
- **Booking.** Four screens: pickup address (pincode check, saved addresses, or a listed building and
  flat, or a typed address), items with a live price, pickup time (or "any time"), and confirm. The
  pincode and area are remembered. A first order also asks about a referral code and where they heard
  of us. The order request carries an idempotency key so a retry after a dropped connection can't
  book twice.

Later batches (8.2 onwards) are listed in `docs/08`.

## 2. How it is tested

- **Unit tests** (`npm test --workspace=apps/mobile`): token renewal in every case above, the booking
  rules and request building, phone and date formatting.
- **End-to-end tests** (`apps/mobile/e2e`, Playwright): the real screens, run as the app's web build
  against the live Django API: sign in, a first booking, a returning customer, an area we don't serve,
  token renewal and a revoked session. In CI they run in the `e2e` job after the console's tests.
- **Types and bundle** (`mobile-quality` job): `tsc`, and a full web bundle, which fails on anything
  Metro can't resolve.

**What this does not cover.** The web build runs the same React Native screens through
react-native-web, so layout and logic are exercised, but it is not a phone: nothing here touches
the iOS or Android keychain (the web build stores tokens in `localStorage`), the camera, push
notifications, or native navigation gestures. Those need a device or emulator and have not been run.
Before a store release, run the app on at least one real Android phone and one iPhone.

## 3. Running it

```
npm run web --workspace=apps/mobile            # dev, in a browser
npm run export:web --workspace=apps/mobile     # the bundle the e2e tests serve
EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:8000/api/v1 npm run start --workspace=apps/mobile   # a real phone
```

To run the e2e tests locally, start the API with `config.settings.test` and
`CORS_ALLOWED_ORIGINS=http://localhost:8081`, seed it with `seed_demo`, build the web bundle, then
`npx playwright test` in `apps/mobile`.

## 4. Dependency notes

- `react-dom` is pinned to the app's React version (19.2.3). The console uses 19.1, and without its
  own copy the web build hoists the console's and fails with React error 527 at start-up.
- NativeWind needs Tailwind 3 and the console needs 4: `scripts/fix-nativewind-tailwind.js` runs
  after install to give NativeWind its own copy. If `expo export` says "NativeWind only supports
  Tailwind CSS v3" after an `npm install`, run that script.
