# 11 — Operations runbook

docs/08 batch 7.7. This page covers what to do when something breaks, how to get data back, and
what has to be true before the real launch. It describes the deployment as it actually runs
(`DEPLOYMENT.md`): API on Cloud Run (asia-south1), web on Vercel, Postgres on Supabase (Mumbai),
files in S3.

---

## 1. Backups — what exists today

| Data | Where | Backed up by | Recovery point |
|---|---|---|---|
| Postgres (everything except files) | Supabase | Supabase daily backups (Pro plan) | **up to 24 h** |
| Proof photos, invoice and statement PDFs | S3 bucket | nothing yet (turn on bucket versioning) | — |
| Code and config | GitHub | git | every commit |
| Secrets | GitHub Actions secrets and Cloud Run env | nobody: keep an offline copy | — |

> **Gap against `10 §1` NFR-14 (RPO ≤ 5 min, RTO ≤ 4 h).** A 5-minute recovery point needs
> Supabase **Point-in-Time Recovery**, a paid add-on on top of Pro. Without it the real recovery
> point is the last daily backup, so up to a day of orders, payments and cash handovers could
> be lost. Either buy PITR before launch, or formally accept RPO = 24 h. This is the founders'
> call, and it belongs in the cloud-cost estimate.

**Do now, free:** turn on **versioning** on the S3 bucket (Bucket → Properties → Bucket
Versioning → Enable), with a lifecycle rule that expires noncurrent versions after 30 days. A
deleted or overwritten proof photo can then be recovered.

**Weekly logical backup (until PITR exists).** From a trusted machine, using the **direct**
connection string (port 5432, not the 6543 pooler):

```bash
pg_dump "$DIRECT_DATABASE_URL" --format=custom --no-owner --no-privileges \
  --file "ironman-$(date +%F).dump"
# Encrypt before it leaves the machine: the dump holds customer phone numbers and addresses.
gpg --symmetric --cipher-algo AES256 "ironman-$(date +%F).dump" && rm "ironman-$(date +%F).dump"
```

Keep the last 8 encrypted dumps somewhere that isn't Supabase or this GitHub repository.

## 2. Restore — rehearsal and the real thing

**Not yet rehearsed.** Rehearsing needs the database owner's credentials, which the build
pipeline does not hold. Do it once before launch and once per phase after that (`06 §7`).

1. **Make an empty target.** Use a new Supabase project (a "restore-test" project, deleted
   afterwards) or a local Postgres 17: `docker run -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:17`.
2. **Load the backup.**
   - From Supabase: Dashboard → Database → Backups → *Restore* (into the test project).
   - From a dump: `pg_restore --no-owner --dbname "$TARGET_URL" ironman-YYYY-MM-DD.dump`
3. **Bring the schema up to date:** `DATABASE_URL=$TARGET_URL python manage.py migrate`.
4. **Check it.** Each check should match production as of the backup time:
   ```bash
   DATABASE_URL=$TARGET_URL python manage.py shell -c "
   from ordering.models import Order; from billing.models import Invoice, Payment
   from customers.models import Customer
   print('orders', Order.objects.count(), 'latest', Order.objects.latest('created_at').ref)
   print('customers', Customer.objects.count())
   print('invoices', Invoice.objects.count(), 'payments', Payment.objects.count())"
   ```
   Sign in to the console pointed at the restored database, open the newest order and its
   invoice PDF, and confirm today's cash reconciliation totals.
5. **Write down how long it took.** That's the measured RTO; it must come in under 4 hours.

**For real:** restore into a *new* project, check it as above, then point production at it by
updating the `DATABASE_URL` secret and redeploying. Never restore over the live database: if
the backup turns out to be bad, you've lost both.

## 3. Rollback

| Layer | How | Time |
|---|---|---|
| **Web** (Vercel) | Vercel → ironman-console → Deployments → the last good one → *Instant Rollback* | ~1 min |
| **API** (Cloud Run) | `gcloud run services update-traffic $SERVICE --region asia-south1 --to-revisions=<previous-revision>=100` (list revisions with `gcloud run revisions list`) | ~1 min |
| **Code** | Revert the merge commit on `master` with a PR; the deploy workflow ships the revert | ~15 min |
| **Database migration** | Migrations are forward-only in production. Fix a bad migration with a new migration, never by editing or unapplying one. A destructive migration (dropping a column or table) goes out only after the code that stopped using it has been live for a full day. | — |

An API rollback to an older revision is only safe if that revision understands the current
schema. Because migrations are additive, the previous revision always does, which is the reason
for that rule.

## 4. Scheduled jobs and alerting

| What | Runs | If it fails |
|---|---|---|
| Deploy (`.github/workflows/deploy.yml`) | every push to `master` touching the API | GitHub emails whoever merged; production keeps the previous revision |
| Nightly maintenance (`maintenance.yml`): retention and account deletions | 02:17 IST | GitHub emails the repo owner; `MaintenanceRun` rows show what each step did |
| Warm/cold schedule (Cloud Scheduler) | hourly | first request of the morning is slow (cold start) |

**Recommended before launch, free:**
- Set `SENTRY_DSN` so API errors page someone (`config/settings/base.py` already wires Sentry
  when the variable exists).
- Add a Google Cloud **uptime check** on `https://console.ironmanindia.co/api/v1/healthz`
  every 5 minutes, alerting by email or SMS.

## 5. Personal-data breach (DPDP Act 2023)

If customer data may have been exposed (leaked credentials, a public bucket, a stolen staff
phone with an open session):

1. **Contain** (minutes): rotate the leaked secret (rotating `DJANGO_SECRET_KEY`, and `JWT_SIGNING_KEY`
   if one is set, signs everyone out); deactivate the affected staff account in the console; make the bucket private.
2. **Preserve evidence**: export the audit log (`/console/audit` → *Export CSV*) and the Cloud
   Run logs for the window before changing anything else.
3. **Assess**: whose data, which fields, from when to when.
4. **Notify**: the DPDP Rules require telling the **Data Protection Board** and the **affected
   customers** without delay, with a detailed report to the Board within **72 hours**. Confirm
   the current timelines with counsel. The customer message needs to say what happened, what
   data was involved, what we've done, and what they should do.
5. **Review**: write up the cause and the fix within a week.

## 6. Go-live checklist (from client demo to real launch)

- [ ] Delete `apps/api/.load-demo-data` so deploys stop loading demo data.
- [ ] Clear the demo data from the database, or start a fresh Supabase project.
- [ ] Rotate `DEMO_PASSWORD` and `DJANGO_SECRET_KEY`; set real staff passwords; turn on 2FA for founders.
- [ ] Replace the placeholder `privacy@ironman.example` in the privacy notice with a real
      grievance contact (a DPDP requirement, `06 §5`).
- [ ] Connect a real SMS/WhatsApp provider (customer sign-in codes and the account-restore link
      depend on it).
- [ ] GST details for invoices, if registered.
- [ ] Decide on Supabase PITR (§1), turn on S3 versioning, set `SENTRY_DSN`, add the uptime check.
- [ ] Rehearse a restore (§2) and record the time.
- [ ] Staff walkthrough using the user manual (`docs/user-manual`).
