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

**Batch 8.2 — following an order, and the account**

- **Order screen.** Progress through the seven stages (or a plain message when an order is cancelled,
  on hold or failed), the pickup and delivery times, items and payment, the invoice, and a timeline in
  the customer's words. The timeline comes from the tracking endpoint, which carries no staff names or
  internal notes, and refreshes every 30 seconds while the screen is open.
- **Changing an order.** *Cancel* (with a reason) while the clothes are still with the customer,
  *change pickup time* while the order is only scheduled, *book these again* from any order (it starts
  from the same items and the last address). The API's state machine is the real gate; the app only
  offers what it will accept. It does allow a customer to cancel a few states later (for instance
  once a delivery is assigned); the app doesn't offer that, so it stays a call to us.
- **Name.** The app asks for a name once, at first sign-in. Staff see it on the customer's orders, and
  editing it in the account tab now carries to the customer record (`PATCH /me` previously changed only
  the login account, so a renamed customer kept their old name in the console).
- **Account tab.** Name, referral code with copy and share, and the WhatsApp and text-message
  switches (hidden until the customer has a first booking, since both depend on a customer record).
- **Times** are shown in India Standard Time, whatever timezone the phone is in, to match the pickup
  windows (which are Indian wall-clock times).

**Batch 8.3 — privacy in the app**

Both app stores require an account to be deletable from inside the app, and the DPDP Act gives the
customer the right to a copy of their data (`docs/06 §5–6`); the API for both was built in batch 7.5.

- **Download my data.** The same file the website offers, handed over as a share sheet on a phone
  (save to Files, send to yourself) and as a download in a browser.
- **Delete my account.** The app first asks what stands in the way (an order in progress, an unpaid
  invoice, an open issue) and says so plainly. Otherwise: an optional reason, a fresh code to the
  account's own phone, then the account is closed and the customer signed out at once. Details are
  deleted after the grace period; signing in again before then restores the account, and the app says so.
- **Privacy notice and Terms** link to the website's pages from the account tab.

**Batch 8.4 — notifications and release preparation**

- **Push.** After a booking the app offers to turn notifications on (never at launch); the customer
  can switch them on or off in the account tab, and is pointed to the phone's Settings if they said no.
  The API stores the phone, and an order update goes to the phone first, then falls back to WhatsApp and
  SMS (`notifications/services.py`). A push that is rejected, or sent to a phone that no longer exists,
  falls back too and retires the device. Tapping a message opens that order. Phones are removed at
  sign-out and with the account, and appear in the data export without their token.
- **Release.** Build profiles, icons, store text and the checklist of what only the owner can do are in
  `docs/14-store-release.md`. Nothing has been built with EAS or submitted.

Push is **code-complete but unproven on a device**: it needs an Expo project (`eas init`), the Apple and
Firebase push keys uploaded to Expo, and `PUSH_PROVIDER=expo` on the API. Until then the app reports
push as unavailable and the API only logs.

Later batches are listed in `docs/08`.

## 2. How it is tested

- **Unit tests** (`npm test --workspace=apps/mobile`): token renewal in every case above, the booking
  rules and request building, order rules and timeline wording, phone and date formatting.
- **End-to-end tests** (`apps/mobile/e2e`, Playwright): the real screens, run as the app's web build
  against the live Django API: sign in, a first booking, a returning customer, an area we don't serve,
  token renewal and a revoked session, tracking, cancelling, rescheduling, booking again, the name
  reaching staff, the referral code, downloading data, deletion refused while an order is open, and
  deleting and restoring an account. In CI they run in the `e2e` job after the console's tests.
- **Types and bundle** (`mobile-quality` job): `tsc`, and a full web bundle, which fails on anything
  Metro can't resolve.

**What this does not cover.** The web build runs the same React Native screens through
react-native-web, so layout and logic are exercised, but it is not a phone: nothing here touches
the iOS or Android keychain (the web build stores tokens in `localStorage`), the camera, push
notifications, or native navigation gestures. Those need a device or emulator and have not been run.
The push token handling is unit-tested for routing only; registration and delivery are not testable here.
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
