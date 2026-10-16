# IronMan: working context

Read this first when you pick the project up from a new machine or a new Claude session. It says what
the system is, where everything lives, how work gets shipped, what is live, what is still open, and the
traps that have already cost time. It is a snapshot (last updated 2026-10-17); where it disagrees with
the code or with `docs/`, the code and `docs/` win. **This repository is public: never put secrets,
passwords, tokens or personal data in this file or anywhere else in it.**

## 1. What this is

IronMan (written **IRON MAN** on the marketing site) is a doorstep clothes-pressing service in Hyderabad,
growing one apartment cluster at a time. The platform is operations, custody tracking, billing, inventory,
growth analytics and customer/rider apps. Its reason to exist is one output: trustworthy per-apartment,
per-channel unit economics, produced weekly (`README.md`, `docs/01`, `docs/07`).

The brand claim the owner wants every visitor to understand: **IRON MAN is an automatic ironing service**
(machine pressing, not a handheld iron). Palette is black, white and bright yellow (`#ffd60a`); in the
wordmark "IRON" is white and "MAN" is yellow.

## 2. Repository map

Monorepo (npm workspaces, npm 10, Node 22 in CI, Python 3.12).

| Path | What | Notes |
|---|---|---|
| `apps/api` | Django + DRF API | Apps: identity, customers, territory, catalog, ordering, custody, fulfilment, billing, supplies, notifications, growth, analytics, privacy, common, platform_core. Import boundaries are enforced (12 `lint-imports` contracts) |
| `apps/web` | Next.js (App Router) | Public landing page at `/`, customer web booking `/book` and `/account`, staff console under `/console`, rider PWA under `/field`. Tailwind v4 |
| `apps/mobile` | Expo customer app | `com.ironman.mobile`. Built and tested on its web build, never run on a phone |
| `apps/field` | Expo rider app | `com.ironman.field`. Offline-first queue, never run on a phone |
| `packages/api-client`, `packages/tokens` | shared client and design tokens | used by web and both apps |
| `docs/` | The spec, in order `00`..`16`, plus `adr/` and `user-manual/` | `docs/08` is the delivery plan, `docs/09` the open decisions, `docs/16` the rollout plan |
| `infra/gcp` | Cloud Scheduler setup | |
| `.github/workflows` | `ci.yml`, `deploy.yml`, `maintenance.yml`, `mobile-release.yml` | see section 4 |
| `DEPLOYMENT.md` | Production runbook (Supabase, Cloud Run, Vercel) | |

`README.md` still says "no application code has been written yet". That is out of date; the code exists
and is live. Worth fixing.

## 3. Production

| Layer | Where | How it ships |
|---|---|---|
| API | Google Cloud Run (service and region in repo variables `CLOUD_RUN_SERVICE`, `GCP_REGION`) | `deploy.yml` on every push to `master` that touches `apps/api/**`: build image, run migrations against the real database, deploy, health check at `/healthz`, keep the latest 3 images |
| Database | Supabase Postgres | migrations run on each API deploy |
| Web | Vercel project `ironman-console` (root dir `apps/web`) | every merge to `master`. Domains: `ironmanindia.co`, `www.ironmanindia.co`, `console.ironmanindia.co`, `ironman-console.vercel.app` |
| Retention job | GitHub Actions `maintenance.yml`, 02:17 IST nightly | calls `POST /internal/maintenance` (retention windows, finishes account deletions after the 7-day grace) |
| Phone apps | not shipped | EAS builds via the manual `mobile-release.yml`, needs `EXPO_TOKEN` and accounts (see `docs/16`) |

Secrets live in GitHub Actions secrets, Cloud Run env vars and Vercel env vars, never in the repo. The
secret **names** are visible in `deploy.yml`. Vercel Authentication was switched off for the project so
preview links are public (the client could not open them otherwise). Turn it back on if previews should be
private again.

## 4. How work is shipped

- Branch: develop on `claude/iron-man-software-architecture-vpjwha`, open a PR into `master`.
- CI must be green on the head commit before merging. Jobs: API lint (ruff, black, `lint-imports`), API
  migrations and tests (pytest, roughly 855 tests), web lint (`--max-warnings=0`), types and build, mobile
  and field types, unit tests and `expo export`, and the Playwright end-to-end suite (about 8 minutes).
- Merge by **squash**, passing the expected head SHA. After a squash merge the branch has diverged from
  `master`, so reset it: `git fetch origin master`, `git checkout -B <branch> origin/master`,
  `git merge -s ours origin/<branch>`, push. Do not stack new commits on merged history.
- Verify live after the deploy (Vercel deployment READY, `Deploy API to Cloud Run` run green, fetch the
  live page or endpoint). A green merge is not a live check.
- Commit and PR footers: commits end with `Co-Authored-By: Claude ... <noreply@anthropic.com>` and a
  `Claude-Session: https://claude.ai/code/session_...` line; PR bodies end with the Claude Code line and
  the session URL.
- Do not create or merge a PR unless the owner asked. Marketing and design changes (the landing page) are
  merged only when the owner says so, after the client has seen the Vercel preview. Phase work from
  `docs/08` has a standing "implement, test, PR, merge when green, deploy, verify" mandate.

## 5. Running it locally

- Database: `docker compose up postgres` (credentials are in `docker-compose.yml`, local only) or any
  local Postgres. Redis on `localhost:6379` is optional for most tests.
- API: create a venv, `pip install -r apps/api/requirements/dev.txt`, set `DATABASE_URL` and
  `DJANGO_SETTINGS_MODULE=config.settings.test`, then `pytest` from `apps/api`. Lint: `ruff check`,
  `black --check`, `lint-imports`.
- Web: `npm install` at the root, then `npm run web:dev` (or `next dev -p 3005` in `apps/web`). Lint,
  types: `npx eslint --max-warnings=0` and `npx tsc --noEmit` in `apps/web`.
- End-to-end: `PLAYWRIGHT_BASE_URL=http://localhost:3005 npx playwright test e2e/landing.spec.ts` in
  `apps/web`. The landing tests need no API. The console, booking and mobile specs need the Django API
  running with a seeded database and `CORS_ALLOWED_ORIGINS` including the Expo web ports (8081, 8082).
- Phone apps: `npm run mobile:start` / `npm run field:start`.

## 6. Conventions and traps that already bit

- **Money** is `{amount_minor, currency}` over the wire and `*_minor` integers in code; display with the
  `en-IN` INR formatters (web `lib/format.ts`, apps `lib/format.ts`, API `common.money.Money`, whose
  `__str__` gives `₹`). Never a bare number as currency, never `$`. Invoice, credit-note and payout PDFs
  are rendered by WeasyPrint and need a font that has the rupee sign: the API image installs
  `fonts-dejavu-core` (python-slim has none). **Not yet confirmed on a real production PDF.**
- **Tailwind lint forbids arbitrary values** (`text-[0.65rem]`, `w-[42%]`). Use scale utilities or inline
  styles. Web lint runs with zero allowed warnings.
- **Landing copy lives in one file**, `apps/web/lib/landing/content.ts` (hero, ironing pitch, garments,
  services, FAQ, pricing, contact details). Components only render it.
- **Landing scroll effects** use `motion` v13. `useScroll`/`useTransform` must use the **function form**
  (`useTransform(p, (v) => ...)`), not the array form, or tall pinned sections misplay.
- **Landing video:** WebM (VP9) and MP4 sources under `apps/web/public/landing`; the scrubbed film uses a
  keyframe every 4 frames; reduced motion and Data Saver fall back to the poster image. `film.*` is cut from
  the owner's brand film with every logo frame removed (only machinery), re-encoded with `ffmpeg`
  (libx264 and libvpx-vp9, `-g 4`). The captions in `FILM` in `content.ts` are timed to that cut, so if the
  footage changes, retime them. The original film with the logo is in git history.
- **Photos:** garment tiles read `apps/web/public/garments/`, crew cards `public/crew/`, service cards
  `public/services/`, and the machine stills `public/machine/`; the paths and alt text live in `content.ts`.
  Replace a file (same name) to change a picture. The crew and service photos were generated with Figma
  (`gemini-3.1-flash-image`), faces kept out of frame, and are stand-ins for real photographs.
- **`next dev` caches optimised images by URL.** If you replace an image file and the page still shows the
  old one, delete `apps/web/.next/cache/images`.
- **Staff token login** is `POST /auth/staff/token` (riders only), and `/fulfilment/jobs/mine/` needs the
  trailing slash. Rider ids are checked server-side on sync and proofs (this was a real security fix).
- **Tooling:** do not `pkill -f` a pattern that also appears in the same shell command; foreground `sleep`
  is blocked in this harness, so wait with an until-loop; after a container restart run
  `service postgresql start` and start Redis again; the sandbox's Playwright browser lives at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (set `PLAYWRIGHT_BROWSERS_PATH`, do not
  `playwright install`).
- **Network policy in the sandbox:** photo CDNs are blocked; `www.figma.com` was explicitly allowed so
  generated images can be downloaded. Outbound access is set in the cloud environment's settings.

## 7. What is live today

- API, database, website and console, and the rider PWA: live on the domains above.
- Landing page: immersive redesign (PR #66) and the round 2 refinements (PR #67, merged 2026-10-12 as
  `a2d829c`): film hero, scroll-scrubbed brand film, "Automatic ironing is what we do best" with stills
  of the machines from the film, a "What we iron" section (shirts as the lead tile, then pants, blazers
  and formals, kurtas and traditional, sarees) with generated garment photos, a press-robot mascot for the
  ironing specialist, a "by hand or by machine?" FAQ, four service cards (wash and fold, dry cleaning,
  sneakers, same-day express).
- Contact info (PR #68, merged 2026-10-16, live): three real phone numbers, a `/contact` page, a Google Maps
  button and a Leave a Google review section with the owner's poster.
- Photography round (PR open for the owner to verify, not merged): the crew and service cards use generated
  photographs, and the scrubbed film no longer shows the logo (see the status log).
- Customer app (`apps/mobile`) and field app (`apps/field`): built and covered by tests on their web
  builds; **nothing is installed on any phone yet.**

Recent merged PRs: #63 customer app tracking, cancel/reschedule, reorder, profile, referrals (phase 8.2);
#64 privacy in the app and push plus store prep (8.3, 8.4); #65 field app, rider-job security fix and the
rollout plan (phase 9); #66 landing redesign; #67 landing round 2 and the invoice font fix. Earlier work
(inventory, billing, growth, analytics, hardening, user manual) is summarised in `docs/08`.

## 8. Open items

**Needs the owner (nothing here can be done from the repo):**

- Real email address. Phones are now real (primary +91 75699 35700, plus 78160 05700 and 93460 93130) and
  the footer hides the email line until `CONTACT_EMAIL` is set in `content.ts`. But `app/privacy/page.tsx`
  and `app/terms/page.tsx` still show `privacy@ironman.example` and `support@ironman.example`, which are
  fake addresses; a privacy notice needs a real contact.
- Address on the page ("Barkatpura, Kacheguda, Hyderabad 500027", `CONTACT_ADDRESS`) differs from the
  Google listing the Maps link opens ("3-4, 372/S1, Basant Nagar Colony, Lingampally, Kachiguda, Hyderabad
  500027"). Decide which one to show.
- WhatsApp: the floating button and the CTA's WhatsApp option stay hidden until `NEXT_PUBLIC_WHATSAPP_NUMBER`
  is set in Vercel. Say which number is on WhatsApp.
- Testimonials on the landing page are unverified and may be invented. Confirm they are real or remove.
- Brand spelling: the landing page says "IRON MAN", the rest of the product still says "IronMan".
- Whether production sells wash and fold and dry cleaning. The pricing cards show them; the live catalogue
  may only sell ironing. A per-piece ironing price ("from ₹X") is not set.
- Whether the machine stills from the brand film are IRON MAN's real machines. They look AI-generated; if
  they are not the real ones, replace `public/machine/*.jpg` with photographs.
- The garment photos are AI-generated pictures of generic garments. Fine as a catalogue look, not as
  proof of work. Real photographs can replace them file by file.
- The logo mark (`public/logo-mark.png`) is still the old amber; the client may want a brighter file.
- Open a real invoice PDF on production and check the rupee sign draws.
- Dismiss three GitGuardian "Generic Password" findings (old test fixtures) as false positives in its
  dashboard. The seed demo password was pasted into a chat once; rotate it.
- Database port for the API's `DATABASE_URL` (5432 direct vs 6543 pooled) decides whether
  `CONN_MAX_AGE` can be turned on.
- Phone apps (`docs/16` section 2): Expo account and `EXPO_TOKEN`, `eas init` for both apps, real device
  testing, Firebase and `PUSH_PROVIDER=expo`, real app identifiers, designer icons, a real SMS/WhatsApp
  provider (both are log-only today; customer sign-in depends on SMS), store accounts.
- GST invoicing is blocked on the owner's GST decisions.
- Phase 7 hardening is still open: items 7.8 and 7.9 in `docs/08` need people, not code.

**Known gaps in the code:** background sync, OTA updates, photo-upload idempotency and rider cash
collection in the field app; the hero and film video files are not set up for long-lived caching.

## 9. Decisions already made (do not reopen without a reason)

- Illustrations and generated imagery, not fake photos of staff faces, until real staff photos exist.
- Do not pursue seeding the production database from a Cloud Run job, and do not add a demo OTP.
- Credentials go in bullet lists, never tables, in docs.
- Marketing copy never compares IRON MAN with, or talks down to, local ironing services.

## 10. How the owner likes to work with Claude

Lead with what is wrong or missing, not praise; stress-test an idea before agreeing; be direct and brief;
say "no" in the first sentence when the answer is no; report test failures and skipped steps plainly. The
owner relays client feedback verbatim and expects it addressed point by point, including pushing back where
a request will not work.

## 11. Starting a new session: checklist

1. `git fetch origin && git checkout claude/iron-man-software-architecture-vpjwha`, then
   `git merge origin/master` (or reset per section 4 if the last PR was squash merged).
2. Read this file, then `docs/16-rollout.md` and `docs/09-open-decisions.md`, then the file for the area
   you are touching.
3. Check CI on `master` and the last Vercel and Cloud Run deployments before starting.
4. Ask the owner which item in section 8 to work on, or take the next phase in `docs/08`.
5. Update this file when something here stops being true.

## 12. Status log (newest first)

Check this against GitHub and the live domain before trusting it; it is only as fresh as its date.

**2026-10-16 check**
- `master` head is `a2d829c` (PR #67). Nothing has merged since; no open PRs.
- Working branch `claude/iron-man-software-architecture-vpjwha` is at the commit that adds this file,
  one commit ahead of `master`, pushed. A preview build of it is READY.
- Live: Vercel production deployment is `a2d829c` (READY). `https://ironmanindia.co/` returns 200 with the
  new landing content; `www.ironmanindia.co` redirects (307) to the apex; `console.ironmanindia.co` returns
  200; the API answers through the site (`/api/v1/healthz` returns `{"status":"ok"}`).
- API: the last `Deploy API to Cloud Run` run is green for `a2d829c` (includes the fonts fix). The nightly
  maintenance job has succeeded every night since 10-12.
- Still public and unresolved: placeholder phone and email, unverified testimonials (see section 8).
- One preview deployment of the branch shows ERROR with `git_info_fail`. That is Vercel failing to read git
  metadata, not a build failure; production built the same code fine. Ignore unless it repeats.
- Housekeeping, nothing urgent: remote branches `batch-4.3-booking-wizard` and
  `claude/lucid-cannon-isamod` are old and not fully merged into `master`. Confirm they are superseded
  before deleting.

**2026-10-17**: the owner asked for premium images for the crew and service sections and for the logo
to come out of the scroll film. Done in a PR for the owner to verify (not merged): seven generated photos
(rider, ironing specialist at a robotic finishing cabinet, quality check, wash and fold, dry cleaning,
sneakers, same-day delivery), the SVG illustrations and the press-bot mascot removed, and the film re-cut
from machinery-only footage with new captions. #68 is merged and verified live (numbers, `/contact`, review
section). One of the Figma images had a scooter model badge, which was painted out.

**2026-10-16 (later)**: the contact update (#68, merged and live). It sets the
three real phone numbers (primary +91 75699 35700), adds a `/contact` page (numbers, hours, Google Maps
button), a "Contact" nav link, a "Leave a Google review" section with the owner's poster
(`public/reviews/google-review-poster.webp`, the QR decodes to the business's Google page, which the button
also opens), and fixes a hydration console error from #67 (rounded the stopwatch tick coordinates). The owner
has one more change coming: the site's images and the logo-based parallax effect.

**2026-10-12**: PR #67 merged and deployed (web and API). **2026-10-09**: PR #66 (landing redesign) merged
and deployed.

