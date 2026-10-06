# 14 — Releasing the customer app to the stores

> The order of work across *all* the apps, and the field app's private distribution, are in
> `docs/16-rollout.md`. This page is the customer app's store detail.

What is built, and what only the owner can do. The app code, push channel and build configuration are
in the repository; the accounts, credentials and store listings are not code, and nothing here has been
submitted.

## 1. What the repository now has

- `apps/mobile/eas.json`: `preview` (an installable Android file for testing) and `production` builds,
  both pointed at `https://console.ironmanindia.co/api/v1`, with version numbers managed by EAS.
- `apps/mobile/app.json`: name, icons (made from the logo mark in `apps/web/public/logo-mark.png`),
  push plugin, bundle id `com.ironman.mobile`, phone-only on iOS, and the export-compliance answer
  (the app uses only standard HTTPS, so no encryption paperwork).
- Push: the API stores each customer's device (`POST /notifications/devices`), sends order updates to the
  phone first and falls back to WhatsApp and SMS, and removes devices at sign-out and account deletion.
  Sending is off until `PUSH_PROVIDER=expo` is set on Cloud Run.
- The app can delete an account and export data from inside it, which both stores require.

## 2. What you need to do

**Accounts (not something I can create for you).**

| Account | Cost | Needed for |
|---|---|---|
| Expo (expo.dev) | free tier is enough to start | building the app and sending push |
| Apple Developer Program | US$99 a year | the App Store and iOS push |
| Google Play Console | US$25 once | Google Play |

Apple asks an organisation to supply a D-U-N-S number; a sole proprietor can enrol as an individual.

**Decisions to make before building.**

1. **The app's identifier.** `com.ironman.mobile` is the template's. It cannot change after the first
   store release, so use one on a domain the business owns (for example `in.ironmanindia.app`), in
   `app.json` under both `ios.bundleIdentifier` and `android.package`.
2. **The icon.** The one in the repository is the existing logo mark on the brand's black. The mark in
   `logo-mark.png` is cropped at its left and right edges, which shows in the ring. A designer should supply
   a clean 1024 × 1024 square for the stores; replace `assets/icon.png` and the Android pair.
3. **Support and privacy contacts.** The privacy notice still lists `privacy@ironman.example`. Both
   stores check the privacy URL and a support contact; put real ones in before submitting.
4. **How the store reviewers sign in.** Sign-in is a code texted to a phone, which a reviewer in another
   country can't receive. Options: give them a dedicated review phone number that you control and read
   the code out of the SMS provider (needs the SMS provider connected first), or a purpose-built test
   account with a fixed code that only works for that one number. The second is a deliberate hole in
   sign-in and is your call.

**Build and submit** (from `apps/mobile`, on any computer with Node):

```
npx eas-cli login
npx eas-cli init                     # creates the Expo project and writes its id into app.json
npx eas-cli build --profile preview --platform android    # an installable test build
npx eas-cli build --profile production --platform all
npx eas-cli submit --platform all
```

`eas init` is what lets the app receive push: until the project id exists in `app.json`, the app
reports push as unavailable and never asks the customer for permission.

**Push credentials.** EAS generates the Apple push key for you during the first iOS build. For
Android, create a Firebase project, add the Android app (same package name), and upload its service-account
key to Expo (Credentials → Android → FCM V1). Then set `PUSH_PROVIDER=expo` on the Cloud Run service.
Without those, Expo accepts the message and the phone never gets it.

## 3. Store listing

Draft text; edit freely.

- **Name:** IronMan: Laundry Pickup
- **Short description (80):** Book ironing pickup and delivery at your door and follow every step.
- **Description:** Book a pickup in under a minute. A rider collects your clothes, we iron and check
  them, and a rider brings them back. Follow each step, see the price before you book, change or
  cancel before pickup, and book the same items again with one tap.
- **Category:** Lifestyle (or Shopping). **Age rating:** 4+ / Everyone.

**Privacy answers.** Collected: phone number, name, home address, order history and payment status,
a push token, and the customer's chosen referral source. Used for: running the service and notifying
the customer. Not used for advertising or tracking, not sold, not shared except with the people who
deliver the service. Deletion: in the app (Account → Privacy). These match `docs/06 §5` and the privacy
notice; recheck both if either changes.

**Screenshots** (phone sizes): sign-in, booking items with the price, pickup times, an order's
progress, the account tab. The screens are in `docs/13-customer-app.md`; capture them from a real
build, not the web preview.

## 4. Before the first release

- [ ] Run the app on one real Android phone and one real iPhone (nothing native has been exercised: the
      keychain, notifications, camera-free so far, navigation gestures).
- [ ] Confirm a push arrives end to end: place an order, advance it in the console, see the message.
- [ ] Real SMS provider connected (sign-in codes depend on it, `docs/11 §6`).
- [ ] The decisions in §2 made, and the real icon in place.
- [ ] Privacy notice and terms read through by someone with legal responsibility.
