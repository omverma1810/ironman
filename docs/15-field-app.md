# 15 — Field app (Phase 9)

The rider's phone app, `apps/field` (Expo, same stack as the customer app). It replaces the field PWA
for riders and keeps the PWA as the fallback. A rider signs in once, loads the day, and from then on the
phone is the source of truth: everything works with no signal and catches up when there is one.

## 1. What a rider can do

- **Sign in** with their work email and password (`POST /auth/staff/token`). Only field staff can; an
  operator or admin is told the app isn't for them. Tokens are the same short-lived pair the customer app
  uses, kept in the keychain.
- **Today.** The day's stops in driving order, with the customer, window and address, a count of what is
  left, and a one-line status that says plainly whether what they did has reached the office. Pull to
  refresh. Yesterday's unfinished jobs stay on the list; finished ones drop off.
- **A job.** Start, arrived, complete, or report a problem with a reason. Call the customer, open the
  address in Maps. A **pickup** is completed by counting what is collected (starting from the customer's
  estimate); a **delivery** by scanning every bag. The phone's camera reads the bag tag; a code can also be
  typed, and is checked against the tag format at the door, so a typo is caught before anything is queued.
  A photo of the handover can be taken at completion.
- **Cash.** Cash in hand and handing it to the hub. This one stays online: handing money to a person is
  recorded when it happens, on both sides.
- **Account.** What is waiting to send, when the day was last updated, job alerts, sign-out.

## 2. How offline works

The phone keeps four things, per rider: the cached day, a queue of actions, a queue of photos, and a list
of issues. The screens read only from these.

1. A tap is written to the queue first and shown at once. The job moves on screen to where it will be.
2. The queue is sent when the app opens or returns to the foreground, after every action, every minute while
   the app is open, and when the rider taps **Send now**. Photos follow the actions.
3. Each action has an id, so sending the same queue twice (a reply was lost) applies each action once.
4. **Nothing leaves the queue until the server has answered for it.** No signal, a timeout, a 5xx: it stays.
5. The server decides. If it refuses an action (the job was reassigned, ops closed it, a bag belongs to a
   different order) the action is not retried and **not hidden**: it appears as an issue on Today and in
   Account, with the order and the reason, until the rider reads it. The cached job then shows the server's
   truth. One refused action never blocks the ones behind it.
6. After a successful send the day is refreshed from the server.

Signing out never discards the queue; it stays on the phone and is sent the next time that rider signs in.
It is kept per rider, so a phone passed to someone else never sends the first rider's actions as the second's.

### What a rider cannot do offline, and the limits

- Signing in, and cash handovers, need a connection.
- Whether a bag code belongs to this order can only be checked by the server. The app knows how many bags
  to expect and that a code is well-formed, not whether it is the right bag, so a wrong bag completed
  offline is refused at sync and shown as an issue (the start and arrival still go through). Shipping the
  list of valid codes to the phone would let a rider "scan" without holding the bags, so it doesn't.
- A photo that was lost in a dropped upload can be uploaded twice (the photo endpoint has no idempotency key).
- Background sync (a send while the app is closed) is **not** built. The queue is sent when the app is
  opened; a rider who finishes the day and never opens it again leaves the last actions on the phone.
  The office sees the job as still in progress until then.
- The in-progress count or scan on a job screen is not saved if the app is killed before the rider completes.

## 3. What the server gained (batch 9.1)

- `POST /auth/staff/token`: bearer sign-in for field staff.
- `GET /fulfilment/jobs/mine/` returns the whole job card: customer name and phone, address, instructions,
  garment lines, bag count, route date.
- **A rider could act on anyone's job.** `POST /fulfilment/sync` and `POST /fulfilment/proofs` looked a job
  up by id with no check that it was the caller's. Any field account could start, complete or fail another
  rider's job, or attach proof to it. Both now go through `fulfilment.services.job_for_actor`: a rider acts
  only on jobs assigned to them (with no date limit, since a queue can be replayed days later); an unknown or
  foreign job is "not found" and tells them nothing. Tests: `fulfilment/tests/test_field_app.py`.
- Proof uploads must be images under 10 MB; an unknown job is a 404, not a crash.
- Riders can register a phone for push, and are nudged when ops give them jobs (best effort: the app fetches
  its own day regardless).

## 4. How it is tested

- **Unit** (`npm test --workspace=apps/field`): the transitions against the server's, the offline overlay,
  per-rider storage and its write ordering, and the whole sending routine against a fake server: order of
  actions, nothing lost on network or server errors, replay after a lost reply, refused actions surfaced,
  a malformed action not blocking the rest, photos, and a tap in the middle of a send being judged on the
  true state (this one caught a real bug: an action tapped during a send could be silently dropped).
- **End to end** (`apps/field/e2e`, Playwright, against the live API): sign-in and its refusals, a pickup
  and a delivery online with the office's view checked, a reported problem, a wrong bag, and the offline
  cases: a whole job with the network switched off then sent on reconnect, the app closed and reopened with
  actions waiting, a wrong bag completed offline coming back as an issue, and the day still readable with
  no signal. Each test books and assigns its own job through the API.
- **Types and bundle** in the `mobile-quality` job, e2e in the `e2e` job.

**Not covered.** This runs the same screens through react-native-web. Nothing here touches the camera, the
keychain, native file storage for photos, push, or real signal loss on a phone. The camera scan, photo
capture and upload, and push are untested. The Phase 9 exit criteria need a rider's day on a real phone:
a full route in airplane mode, scan speed against the PWA, and a battery check over a shift.

## 5. Running it

```
npm run web --workspace=apps/field                        # in a browser, port 8082
EXPO_PUBLIC_API_BASE_URL=http://<your-LAN-IP>:8000/api/v1 npm run start --workspace=apps/field   # a phone
```

End-to-end tests: start the API with `config.settings.test` and
`CORS_ALLOWED_ORIGINS=http://localhost:8082`, seed it with `seed_demo`, `npm run export:web
--workspace=apps/field`, then `npx playwright test` in `apps/field`.
