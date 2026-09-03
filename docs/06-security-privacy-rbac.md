# 06 — Security, Privacy & Access Control

## 1. What this system actually holds

Naming it plainly, because the controls follow from it:

- **Phone numbers and home addresses** of apartment residents, down to the flat number.
- **Photographs of people's front doors** (delivery proof), often with the flat visible.
- **Movement traces of staff** (job timestamps, optional geolocation on proof).
- **Money**: prices, margins, cash held by riders, commissions payable to watchmen.

That is a meaningful personal-data footprint for a neighbourhood ironing service, and it brings
India's **DPDP Act 2023** into scope. Neither source document addresses privacy at all
(`00 §4 G-13`).

## 2. Authentication

Two audiences, two schemes (`00 §5 T-3`). Forcing one on both either adds friction where the
client asked for none, or weakens security where money lives.

### 2.1 Customers (S1 web, S4 app) — phone-first

```
Enter phone → OTP (WhatsApp preferred, SMS fallback) → verified → JWT access (15 min)
                                                                 + refresh (30 d, rotating)
```
- No password. No email required. Email is optional, collected only for invoice delivery.
- OTP: 6 digits, 5-minute expiry, hashed at rest, max 5 verify attempts, max 3 requests per
  phone per 10 minutes, exponential cooldown on abuse.
- Refresh rotation with reuse detection: a replayed refresh token revokes the whole family.
- **Most customers never authenticate at all** — the tracking link (`/track/{token}`) covers
  booking through delivery. Login exists for order history, saved addresses and referrals.

### 2.2 Staff, operators, admins, founders (S2, S3) — email + password

Directly satisfies the brief's sign-up / verification / reset requirements:

- **Registration is invite-only.** No public sign-up on the console — an admin invites by email,
  the invitee sets a password through a single-use, 72-hour token. A public sign-up form on an
  ops console is an unnecessary attack surface for a team of eight.
- **Email verification** required before first login; re-verification if the address changes.
- **Password reset**: single-use token, 60-minute expiry, invalidated on use and on password
  change. The request endpoint always returns 200 — no account enumeration.
- **Password policy**: minimum 10 characters, checked against the Pwned Passwords k-anonymity
  API and a common-password list. No composition rules, no forced rotation (NIST 800-63B).
  Argon2id hashing.
- **TOTP 2FA**: opt-in for everyone during the pilot (`MFA_REQUIRED_ROLES` is empty — the console
  has no enrollment UI yet, so there's no way to complete a mandatory-TOTP login). The design intent
  is mandatory for `FOUNDER` and `ADMIN` once a real setup flow ships, since those roles can change
  prices and settle commissions; `requires_mfa()` and the enable/verify endpoints are already wired,
  so turning it back on for those roles is a one-line change (repopulate `MFA_REQUIRED_ROLES`).
- **Sessions**: httpOnly + Secure + `SameSite=Lax` cookies, 12-hour idle timeout, 7-day absolute,
  device list with remote revoke, and forced logout everywhere on password change.
- Field staff log in with phone OTP *or* email+password — riders often have no work email.

### 2.3 Lockout and monitoring

Progressive delays then a 15-minute lock after 10 failed attempts per account, plus per-IP
throttling. Every failed login, password reset, role change and 2FA event is audit-logged, and
a login from a new device notifies the account owner.

## 3. Authorisation

Three layers, all enforced server-side. **The client hides what a user cannot do; the server
decides what they may do.** UI-only permissions are a UX affordance, never a control.

1. **Role** — what the user is
2. **Permission** — a fine-grained capability (`orders.cancel`, `pricing.edit`)
3. **Scope** — which rows: hub-scoped, or "only my own"

### 3.1 Permission matrix

`✓` full · `◐` own/assigned only · `M` visible but money masked · `—` no access

| Capability | Customer | Field | Operator | Ops/Admin | Founder | Viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Book / view own order | ✓ | — | — | — | — | — |
| View all orders | — | ◐ | ✓ (hub) | ✓ | ✓ | M |
| Create counter order | — | — | ✓ | ✓ | ✓ | — |
| Edit / reschedule order | ◐ | — | — | ✓ | ✓ | — |
| Cancel order | ◐ | — | — | ✓ | ✓ | — |
| Update job status / proof | — | ◐ | — | ✓ | ✓ | — |
| Intake verification | — | — | ✓ | ✓ | ✓ | — |
| Scan stage transitions | — | ◐ | ✓ | ✓ | ✓ | — |
| Raise exception | ✓ | ◐ | ✓ | ✓ | ✓ | — |
| Resolve exception / write off | — | — | — | ✓ | ✓ | — |
| **View prices (list)** | ✓ | — | — | ✓ | ✓ | — |
| **Edit price lists** | — | — | — | — | ✓ | — |
| **Create / edit offers** | — | — | — | ◐ | ✓ | — |
| View invoice | ◐ | ◐ (job) | ✓ | ✓ | ✓ | M |
| Record payment | — | ◐ (COD) | ✓ | ✓ | ✓ | — |
| Issue credit note / refund | — | — | — | ✓ | ✓ | — |
| Own cash balance / handover | — | ◐ | — | ✓ | ✓ | — |
| Cash reconciliation (all staff) | — | — | — | ✓ | ✓ | M |
| **View commission rules** | — | — | — | ✓ | ✓ | — |
| **Edit commission rules** | — | — | — | — | ✓ | — |
| **Run settlement / mark paid** | — | — | — | — | ✓ | — |
| Manage referral partners | — | — | — | ✓ | ✓ | — |
| Enter marketing spend | — | — | — | — | ✓ | — |
| Supplies: receive / issue / adjust | — | — | ✓ | ✓ | ✓ | — |
| **Supplies: unit costs & valuation** | — | — | — | ✓ | ✓ | — |
| Customer PII (phone, address) | ◐ | ◐ (job only) | ✓ (hub) | ✓ | ✓ | masked |
| Export customer data | — | — | — | ✓ | ✓ | — |
| **Unit economics / margin** | — | — | — | — | ✓ | — |
| Operational analytics | — | — | ✓ | ✓ | ✓ | ✓ |
| Manage users & roles | — | — | — | ✓ | ✓ | — |
| View audit log | — | — | — | ✓ | ✓ | — |
| Delete own account | ✓ | — | — | — | — | — |

**The rows in bold are the reason RBAC is a Must-Have and not a checkbox.** The store operator
handles every garment in the building and must not see what the business charges, what it pays
watchmen, or what it earns per order. `00 §3.3 M-6` flagged that SRC-B specified this in one
sentence with a role list that did not even match its own personas.

### 3.2 Object scoping

Enforced in DRF via a `ScopedQuerysetMixin`, not by remembering to add a filter:

| Role | Scope |
|---|---|
| Customer | `customer_id = self` |
| Field staff | `job.assigned_to = self` **and** `job.route_day.date` within ±2 days |
| Operator | `hub_id IN user.hub_scope` |
| Ops/Admin | `hub_id IN user.hub_scope` (all hubs by default) |
| Founder | unrestricted |
| Viewer | hub-scoped, money fields serialised as `null` with a `masked: true` marker |

The ±2-day window on the field scope is deliberate: a rider does not need to browse last month's
customers, and a lost phone should not expose the address book.

### 3.3 Audit log — `R-802`

Append-only `AuditEvent` (`02 §3.1`), with `UPDATE`/`DELETE` revoked from the app role. Captured
for: role/permission changes · price list activation · offer create/edit · commission rule
change · settlement creation and payout · refunds, credit notes and write-offs · order
cancellation · cash variance approval · customer PII export · customer deletion · manual stage
override (a transition without a scan) · login, logout, failed login, 2FA changes.

Each row stores actor, role, action, object, before/after JSON, IP, user agent and timestamp.
Viewable in the console (`/console/audit`), filterable by object and by actor, exportable.

## 4. Application security

| Control | Implementation |
|---|---|
| Transport | TLS 1.2+, HSTS with preload |
| Headers | CSP (nonce-based, no `unsafe-inline`), `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying geolocation/camera except on the field routes |
| CSRF | Django CSRF for cookie auth; JWT endpoints are cookie-free |
| CORS | Explicit origin allowlist per environment; no wildcard |
| Injection | ORM only; any raw SQL parameterised and reviewed |
| XSS | React escaping; `dangerouslySetInnerHTML` is banned by lint rule |
| File upload | Type and magic-byte validation, 10 MB cap, EXIF stripped (proof photos carry GPS by default — that is a privacy leak, not a feature), stored private, served via short-lived signed URLs, virus scan on upload |
| SSRF | No user-supplied URLs are fetched server-side |
| Rate limiting | Per-endpoint, Redis-backed (`03 §3.5`) |
| Secrets | Platform secret store; `gitleaks` in CI; no `.env` committed |
| Dependencies | `pip-audit` + `npm audit` in CI; Dependabot weekly |
| Admin | Django Admin restricted to superusers, IP-allowlisted in production, 2FA required |
| Tokens | Tracking-link tokens are 32-byte random, single-order scoped, revocable, and expire 30 days after order close |

## 5. Privacy & DPDP compliance — `R-806`

| DPDP obligation | Implementation |
|---|---|
| **Notice & purpose limitation** | Plain-language privacy notice at first booking. Purposes separated: service delivery (necessary) vs marketing (opt-in). |
| **Consent** | `ConsentRecord` per purpose with timestamp, source and IP. WhatsApp marketing consent is recorded separately from transactional messaging. Withdrawable in one tap. |
| **Data minimisation** | No date of birth, no gender, no Aadhaar, no bank details from customers. Geolocation on proof is **optional and off by default**. |
| **Accuracy** | Customers can edit their profile and addresses; a merge log covers duplicate records. |
| **Retention** | Proof photos 180 days · notification payloads 90 days · OTP records 30 days · audit 7 years · financial records 8 years. A nightly Celery job enforces this; retention is code, not policy prose. |
| **Access & portability** | `GET /me/export` produces a JSON + PDF of the customer's own data, delivered by signed link. |
| **Erasure** | See §6. |
| **Breach notification** | Documented incident runbook with the Data Protection Board timeline; Sentry alerting feeds it. |
| **Children** | Not knowingly collected; no age-gated features. |
| **Grievance officer** | Named contact published in the privacy notice — a DPDP requirement that is easy to forget. |

**Staff privacy matters too.** Riders are tracked by job timestamps. Geolocation is captured only
at proof-of-delivery, never continuously; continuous location tracking is out of scope and should
stay that way unless the founders ask for it and tell their staff.

## 6. Account deletion — `R-806`

Requested in the brief and legally required. The naive implementation (`DELETE FROM customer`)
is wrong: it destroys invoices the business is statutorily required to retain for eight years
and corrupts every historical metric the founders rely on.

**Soft-delete with anonymisation:**

```
DELETE /me
  1. Re-authenticate (fresh OTP)
  2. Refuse (with reasons) if: an order is in flight, an invoice is unpaid,
     or an exception is open  → tell the customer exactly what blocks it
  3. 7-day grace period. Account is deactivated immediately and a cancellation
     link is emailed/messaged. Sessions revoked now.
  4. On expiry, a Celery job:
       • name        → "Deleted customer"
       • phone/email → nulled; a salted HMAC is retained to prevent
                       re-registration abuse and duplicate-account fraud
       • addresses   → flat number and free text cleared; apartment retained
                       (an anonymous order still belongs to an apartment,
                        and losing that would corrupt the analytics the
                        founders' plan is built on)
       • proof photos → deleted
       • feedback    → anonymised, text retained
       • orders/invoices/payments → RETAINED, pointing at a tombstoned customer
       • Attribution → retained (channel + apartment only)
  5. Write an AuditEvent. Confirm to the customer.
```

Staff account deletion is different: staff records are retained for cash and audit
accountability; the account is deactivated and access revoked, and PII removal happens only
after the statutory employment-record period.

## 7. Security testing

| Activity | When |
|---|---|
| SAST (`bandit`, `semgrep`), dependency and secret scanning | Every PR |
| RBAC test suite — **every matrix cell in §3.1 asserted in `pytest`** | Every PR |
| IDOR probes on every `{id}` endpoint with a wrong-tenant actor | Every PR |
| Rate-limit and lockout tests | Every PR |
| Manual penetration pass on auth, payments, RBAC and file access | Before pilot launch |
| Restore-from-backup rehearsal | Once per phase |
| Dependency review | Monthly |

The RBAC matrix being machine-tested is the point. A permission matrix in a document drifts from
the code within two sprints; a permission matrix that is a parametrised test cannot.
