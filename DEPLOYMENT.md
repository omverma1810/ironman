# Production deployment runbook

Three services, three providers:

| Layer | Provider | What's already built |
|---|---|---|
| Database | Supabase (Postgres) | Nothing to build — just provision and hand back a connection string |
| API | Google Cloud Run | `apps/api/Dockerfile`, `.github/workflows/deploy.yml`, `infra/gcp/setup-scheduler.sh` |
| Web | Vercel | Next.js app already reads its API URL from one env var |

`master` is production: `.github/workflows/deploy.yml` fires on every push to
`master` that touches `apps/api/**`, builds the Docker image, runs
migrations against the real database, deploys to Cloud Run, then deletes
every Artifact Registry image except the newest 3.

**What I can't do for you, and why:** I have no GCP, Supabase, or `gcloud`
access from this session — no connector for either exists, and there's no
tool available to me that can create a GCP project, provision a database,
or set a GitHub Actions / Vercel secret. Project creation on both GCP and
Supabase requires your Google/Supabase identity and (for GCP) a billing
account, which I have no way to act as. Everything below marked **You do
this** needs your hands in that provider's console; everything marked
**I'll do this** I can do once you hand me the one piece of information it
needs.

Correction from earlier in this conversation: I said I'd add the GCP key to
GitHub secrets myself. I don't actually have a tool that can write repo
secrets — GitHub's API requires encrypting the value with the repo's
public key first, and nothing exposes that to me here. That's a better
outcome anyway: **paste secrets directly into GitHub's UI, never into this
chat.** Steps below reflect that.

---

## 1. Supabase — Postgres

**You do this:**

1. [supabase.com](https://supabase.com) → New project. Pick a region close
   to your Cloud Run region (Mumbai/`ap-south-1` if available — keeps
   DB↔API latency low).
2. Save the database password you're prompted for.
3. Once the project is up: **Project Settings → Database → Connection
   string**. Switch the tab to **Transaction** mode (port `6543`) — this is
   the pooled connection string, and it's the one to use. Cloud Run
   instances start and stop with traffic, so a small pool of short-lived
   connections behaves far better against Supabase's connection limit than
   the direct (port `5432`) string, which is meant for long-lived servers.
4. Copy that string. It looks like:
   `postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
   Replace `[YOUR-PASSWORD]` with the real password, then swap the scheme to
   `postgres://` (Django's `dj-database-url` parser, used in
   `config/settings/base.py`, expects `postgres://` or `postgresql://` —
   either works, but keep the whole thing as one string). This full string
   is your `DATABASE_URL`.

Nothing else needed here — `deploy.yml` runs `manage.py migrate` against
this on every deploy, so the schema is created automatically on first run.

---

## 2. Google Cloud — project, APIs, Artifact Registry, service account

**You do this** (Cloud Shell, at [console.cloud.google.com](https://console.cloud.google.com), is the fastest way to run these — it's a terminal in the browser, already authenticated as you, no local `gcloud` install needed):

```bash
# 1. New project (skip if reusing one you already have)
gcloud projects create ironman-prod --name="IronMan"
gcloud config set project ironman-prod
# Then, in the console UI: Billing → link this project to a billing account.
# (Service account keys can't do this step — it's tied to your identity.)

# 2. Enable the APIs deploy.yml and the scheduler need
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  iam.googleapis.com

# 3. Artifact Registry repo to hold the Docker images
gcloud artifacts repositories create ironman \
  --repository-format=docker \
  --location=asia-south1 \
  --description="IronMan API images"
# asia-south1 = Mumbai. Keep this consistent everywhere below — it's the
# GCP_REGION secret.

# 4. Service account deploy.yml (and the scheduler) will act as
gcloud iam service-accounts create ironman-deployer \
  --display-name="IronMan CI/CD deployer"

SA="ironman-deployer@ironman-prod.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding ironman-prod \
  --member="serviceAccount:$SA" --role="roles/run.admin"
gcloud projects add-iam-policy-binding ironman-prod \
  --member="serviceAccount:$SA" --role="roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding ironman-prod \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountUser"

# 5. A JSON key for that service account — this is what GitHub Actions
#    authenticates with. Treat the downloaded file as a secret from the
#    moment it exists on disk.
gcloud iam service-accounts keys create ironman-deployer-key.json \
  --iam-account="$SA"
```

Then get a clean copy of it as base64 — **use Cloud Shell's editor, not a
terminal copy.** Selecting text out of a terminal is where this reliably
goes wrong: it's easy to also grab part of the command you ran or the
next prompt line without noticing, and a decoder has no way to tell your
shell prompt apart from real key data — it just fails, sometimes
cryptically.

```bash
base64 -w0 ironman-deployer-key.json > ironman-deployer-key.b64
cloudshell edit ironman-deployer-key.b64
```

That opens the file in Cloud Shell's built-in code editor (a real text
buffer, not a terminal). Click into it, Ctrl+A (Cmd+A on Mac) to select
everything, Ctrl+C to copy — guaranteed to be exactly the file's bytes,
nothing appended. That's what goes into the `GCP_SA_KEY_B64` secret below.

---

## 3. GitHub repository secrets and variables

**You do this** — repo → **Settings → Secrets and variables → Actions**.
Two separate tabs there, **Secrets** and **Variables** — this split matters:
GitHub masks a Secret's value out of every log line that mentions it
(including, awkwardly, the deployed URL this workflow prints — it contains
the service name as a substring), so identifiers that aren't actually
sensitive go in **Variables** instead, and stay readable in logs.

**Variables tab → New repository variable:**

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `ironman-prod` (or whatever you named it) |
| `GCP_REGION` | `asia-south1` |
| `GCP_ARTIFACT_REPO` | `ironman` |
| `CLOUD_RUN_SERVICE` | `ironman-api` |

**That's the whole Variables list — nothing else goes there.** In
particular, `GCP_SA_KEY_B64` (the service account key) always stays a
Secret, never a Variable: Variables are plaintext-readable by anyone with
access to repo settings, which is fine for a project ID but not for a
credential.

**Secrets tab → New repository secret:**

| Secret | Value |
|---|---|
| `GCP_SA_KEY_B64` | base64 of the key file — see the copy method below, not a plain terminal copy |
| `DATABASE_URL` | the Supabase pooled connection string from step 1 |
| `DJANGO_SECRET_KEY` | a fresh random value — generate with `python -c "import secrets; print(secrets.token_urlsafe(50))"` and never reuse the dev one |
| `DJANGO_ALLOWED_HOSTS` | `.run.app` for now (the leading dot matches any Cloud Run URL; switch to a real domain once you attach one) |
| `CORS_ALLOWED_ORIGINS` | the Vercel URL your frontend will live at, e.g. `https://ironman-console.vercel.app` — decide the Vercel project name now (step 5) so you can fill this in before the frontend exists |
| `AWS_STORAGE_BUCKET_NAME` | optional — see "Object storage" below. Leave unset and the API still boots fine; proof-of-delivery photos just won't survive a restart |
| `AWS_ACCESS_KEY_ID` | optional, only if you set `AWS_STORAGE_BUCKET_NAME` |
| `AWS_SECRET_ACCESS_KEY` | optional, only if you set `AWS_STORAGE_BUCKET_NAME` |
| `AWS_S3_REGION_NAME` | optional, e.g. `ap-south-1` — only if you set `AWS_STORAGE_BUCKET_NAME` |

**Object storage (for `fulfilment.Proof` — pickup/delivery photos):** the
API code already speaks S3 (`django-storages`, same as the MinIO container
in `docker-compose.yml` for local dev), it just needs real credentials in
production. Cloud Run's own disk is wiped on every scale event, so without
a bucket configured, proof photos taken by field staff are lost the moment
the container restarts — fine for a demo, not fine once real riders are
uploading real delivery proof. Any S3-compatible bucket works (a plain AWS
S3 bucket is the least setup); create one, create an access key scoped to
it, and put the four values above in as Secrets. No code change needed —
`config/settings/base.py` picks it up automatically the next deploy.

Also create a GitHub **environment** named `production` (Settings →
Environments) — `deploy.yml` targets it by name; an empty environment with
no protection rules is fine, or add required reviewers there later if you
want a manual approval gate before every production deploy.

Once these exist, push anything touching `apps/api/**` to `master` (or run
the **Deploy API to Cloud Run** workflow manually from the Actions tab) and
it deploys. Grab the printed service URL from that run's logs — that's your
API's base URL, `https://ironman-api-xxxxxxxx-el.a.run.app` — needed twice
below.

---

## 4. Cost-saving schedule (5am–8pm IST warm, scale-to-zero overnight)

**You do this once**, after the service has deployed at least once (Cloud
Shell again, same project):

```bash
PROJECT_ID=ironman-prod \
REGION=asia-south1 \
SERVICE=ironman-api \
SA_EMAIL=ironman-deployer@ironman-prod.iam.gserviceaccount.com \
  ./infra/gcp/setup-scheduler.sh
```

This creates two Cloud Scheduler jobs that PATCH the Cloud Run service's
min-instances: 1 at 5:00 AM IST (fast responses all business day, one
warm instance billed), 0 at 8:00 PM IST (scales to zero overnight — no
idle cost, first request next morning pays a few seconds' cold start).
Re-run it any time to update the schedule; it's idempotent.

---

## 5. Vercel — frontend

**I'll do this** once you give me your Vercel account/org slug (visible in
your dashboard URL, `vercel.com/<slug>/...`) — I'll create the project
linked to this GitHub repo with root directory `apps/web`, which then
redeploys automatically on every push to `master`.

**You do this, once, after I create it:** Project Settings → Environment
Variables → add `NEXT_PUBLIC_API_BASE_URL` = `<your Cloud Run URL from
step 3>/api/v1`, scoped to Production. I don't have a tool that can set
Vercel env vars, and it's a one-field, thirty-second step in their
dashboard. Redeploy after saving it (Vercel prompts you to).

If the Vercel URL Vercel actually assigns differs from the
`ironman-console.vercel.app` you planned for in step 3's
`CORS_ALLOWED_ORIGINS`, update that GitHub secret to match and re-run the
deploy workflow.

**Why the browser never talks to Cloud Run directly:** console and API sit
on different registrable domains, so a direct browser fetch is cross-site
— the session/CSRF cookie needs `SameSite=None`, which mobile Safari (and
increasingly other browsers) can drop unreliably right after it's set.
`next.config.ts`'s `rewrites()` proxies `/api/v1/*` to
`NEXT_PUBLIC_API_BASE_URL` server-side instead, so the browser only ever
sees its own origin and the cookie stays an ordinary same-site one. This
reuses the one env var above — nothing else to configure.

---

## 6. What's already live without any of the above

- `GET /api/v1/healthz` — liveness, no dependencies.
- `GET /api/v1/readyz` — readiness, checks the database connection; returns
  503 if it can't reach Postgres. Point Cloud Run's own health checks and
  any uptime monitor at this one, not `/healthz`.
- `GET /api/v1/docs/` — Swagger UI.
- `GET /api/v1/schema/` — the raw OpenAPI schema `docs/` and the web app's
  typed client are generated from.

## What I need from you to finish this

1. Your Vercel account/org slug.
2. Confirmation you've completed steps 1–3 above (or the values, if you'd
   rather I sanity-check the shape of what you entered — never the secret
   values themselves back to me).

Everything else — the Docker build, the migrations, the deploy, the image
cleanup, the scaling schedule — runs unattended from here once the secrets
exist.
