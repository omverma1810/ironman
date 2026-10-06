# 16 — Rolling out all the applications

Four things users touch. Two are live and deploy themselves; two are built and tested but need
accounts, credentials and real phones that only the owner can supply. This page says which is which,
the order to do the rest in, what to check at each step, and how to undo it.

| Application | Who uses it | State today | How it ships |
|---|---|---|---|
| **API** (Django, Cloud Run) | everything below | **Live.** Deploys on every merge touching `apps/api` | `deploy.yml`: build, migrate, deploy, health check |
| **Website and console** (Next.js, Vercel) | customers on the web, ops, admin, founder | **Live** at console.ironmanindia.co | Vercel on every merge to master |
| **Field PWA** (`/field` on the website) | riders, today | **Live.** The fallback and the current rider tool | with the website |
| **Customer app** (`apps/mobile`) | customers | Built and tested on the web build; **never run on a phone, not submitted** | EAS build, then the stores (`docs/14`) |
| **Field app** (`apps/field`) | riders | Same: built and tested on the web build, **never run on a phone** | EAS build, then private distribution (§4) |

Nothing in the phone apps is live. Merging code to master deployed the API changes they need; it did not,
and cannot, put an app on anyone's phone.

## 1. Order of work

Each step has a gate. Do not start the next until the gate is met.

1. **Accounts and secrets (owner).** Expo account and an access token; Apple Developer and Google Play for
   the stores; Firebase for Android push. §2.
2. **One real phone each way.** Build the `preview` profile of both apps, install on a real Android phone
   (and an iPhone if there is one), and run the checklists in §3. *Gate: every item ticked.* The apps have
   been exercised only through a browser build; the camera, keychain, photo storage, push and real signal
   loss are the untested parts, and the field app depends on all four.
3. **Field app to one rider for a week**, alongside the PWA, on real routes (§4). *Gate: the office's view
   matches what the rider did; no unexplained issues; the rider prefers it.*
4. **Field app to all riders.** Keep the PWA reachable for a month.
5. **Customer app: internal test tracks** (TestFlight, Play internal) with staff and friendly customers.
   Needs a working SMS provider first (sign-in codes: `docs/11 §6`), and a decision on how store reviewers
   sign in (`docs/14 §2`). *Gate: a real sign-in code arrives on a real number.*
6. **Customer app to the stores**, after review. Staged: Play's percentage rollout, App Store phased release.

## 2. What the owner has to set up

- **Expo:** create the account, then in the repo's GitHub settings add the secret `EXPO_TOKEN` (an access
  token from expo.dev). In `apps/field` and `apps/mobile` run `npx eas-cli init` once each; it writes the
  project id into `app.json` (commit it). Without the project id push is reported as unavailable.
- **Identifiers.** Field app is `com.ironman.field`, customer app `com.ironman.mobile`. Both are the
  template's guess and cannot change after the first store release; choose real ones on a domain the
  business owns before building for the stores. The field app never goes to a store, so its identifier
  matters only for installing and for push.
- **Push (both apps):** Apple key (EAS makes it on the first iOS build), Firebase service-account key
  uploaded to Expo for Android, then `PUSH_PROVIDER=expo` on Cloud Run. Without these Expo accepts a
  message and the phone never gets it.
- **Icons.** Both apps currently use the same cropped logo ring. A designer should give each a clean
  1024 × 1024 square; the field app's should be visibly different so a rider can tell them apart.
- **Real SMS / WhatsApp provider.** Both are log-only today. Customer sign-in depends on SMS; the push
  fallback depends on both.

Builds are started from GitHub: Actions → **Mobile release** → choose the app, `preview` or `production`,
and the platform. It runs the type check and unit tests first and refuses to run without `EXPO_TOKEN`.
It only queues the build on Expo; the file appears on expo.dev.

## 3. Real-phone checklists

**Field app** (the Phase 9 exit criteria, from `docs/08`):

- [ ] Sign in; the day loads; Maps and Call open.
- [ ] **Airplane mode:** load the day, switch it on, complete a pickup and a delivery (scan the real bag tag
      with the camera), take a photo, switch it off. The office sees both jobs done and the photo; the
      banner clears.
- [ ] Force-quit the app with actions waiting, reopen with signal: they are sent.
- [ ] A wrong bag scanned offline comes back as an issue naming the order.
- [ ] Scanning a tag is at least as fast as the PWA.
- [ ] Assign a job from the console: the phone gets a push (needs §2 push).
- [ ] A full shift with the app open: battery acceptable.
- [ ] Sign in as an operator: refused with a clear message.

**Customer app:** `docs/14 §4`.

## 4. Getting the field app to riders

It is not a store app. Use private distribution:

- **Android:** the `preview` profile builds an APK that installs from a link on expo.dev (the rider allows
  "install from this source" once). For a managed route later, the Play Console's internal testing track.
- **iPhone:** needs the Apple Developer account; use TestFlight (internal testers) or ad-hoc profiles
  with each rider's device registered (`eas device:create`). There is no way around the account.
- **Onboarding a rider:** invite them in the console (Team) as field staff, they set a password from the
  email link, then install the app and sign in. Hand over a one-page card: what the banner means, what an
  issue is, and "open the app once at the end of the day".
- **The end-of-day habit matters** because background sync is not built (`docs/15 §2`).

## 5. Versions, updates and rollback

- **App versions:** EAS manages build numbers. A change to native code (a new module, a permission) needs a
  new build; a change to screens alone can later go out over the air once `expo-updates` is added, which it
  is **not yet**. Until then every fix is a new build.
- **The API must stay compatible with every app version in the field.** Changes are additive within `v1`
  (`docs/04`). A rider on last week's build and a customer on last month's must both keep working;
  removing or retyping a field breaks them with no way to recall the build.
- **Rolling back the API:** shift Cloud Run traffic to the previous revision (`docs/11 §3`). Migrations are written
  to be backward compatible with the previous revision for exactly this.
- **Rolling back an app:** stop the staged rollout (stores), or pull the build link (private). Riders fall
  back to the PWA, which is always live; no data is stranded, because the PWA and the app use the same
  endpoints and the same idempotent sync.
- **A refused action** is never an outage: it shows on the rider's phone as an issue and in the office as
  the job's true state.

## 6. What to watch after each step

- Cloud Run errors and latency on `/fulfilment/sync`, `/fulfilment/jobs/mine/`, `/auth/staff/token`
  (`docs/11`); the first is the app's heartbeat.
- `OfflineOp` rows with status `CONFLICT` or `REJECTED` (Django admin): a rising count means riders are
  hitting something systematically (an unclear bag process, reassignments mid-day).
- Jobs that sit `EN_ROUTE` or `ARRIVED` for hours: usually a rider who hasn't reopened the app.
- Crash and install numbers in the store consoles once the customer app is public (target in `docs/08`:
  crash-free sessions above 99.5%).

## 7. Not done, and who owns it

| Item | Why it isn't done |
|---|---|
| Real-phone testing of both apps | no device here; the biggest gap |
| Background sync (send while the app is closed) | needs a native background task; untested without a phone |
| Over-the-air updates | adds a native module and a project id; do it with the first real build |
| Photo upload idempotency | small API change; low priority |
| Cash collection by the rider at delivery | the console records payments; the rider's tools show balance and handover only |
| SMS / WhatsApp provider, store accounts, Firebase, icons, identifiers | owner decisions and accounts (§2) |
