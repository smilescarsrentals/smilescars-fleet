# Project Notes — SmilesCars Fleet Manager

A running record of *why* things are built the way they are — the
reasoning that doesn't show up just from reading the code, and that would
otherwise only live in chat history. Update this when a decision is made
that a future reader (human or AI) would otherwise have to reverse-engineer
or re-litigate.

See `CONTRIBUTING.md` for the day-to-day verification workflow. This file
is about *why*, that one is about *how*.

## Stack

React + Vite frontend → Vercel serverless function (`/api/index.js`) →
Supabase Postgres. Fully migrated off Google Sheets/Apps Script; `Code.gs`
and the Sheets backend are legacy/rollback-only (see `.env.example` for the
`VITE_SCRIPT_URL` rollback path).

## Architecture decisions worth knowing the reasoning for

### Files are stored IN Postgres, not object storage
`lib/files.js`'s `storeFile()` writes binary data (`bytea`) directly into a
`files` table row, not Supabase Storage or S3. This was a deliberate
simplicity tradeoff, not an oversight — one connection, one place backups
cover, no separate bucket permissions to manage. The real cost: every photo
(signatures, agreements, blacklist images, invoice scans) counts against
the *database* storage quota, not a separate one. Client-side compression
(`src/lib/imageCompress.js`) exists specifically to keep this sustainable —
always compress before upload rather than storing raw phone photos. If
storage ever becomes a real constraint (watch the Systems Health panel in
Admin Panel), the migration path is moving to real object storage — `files.id`
already abstracts *where* a file lives, so this wouldn't require touching
every caller, just `storeFile`/`readFile` internals.

### The whole app assumes UTC+3 (Tanzania time), hardcoded
`nowTZ()` in `lib/core.js` is `new Date(Date.now() + 3*3600*1000)`. Not
using a timezone library, not reading a config value — just a fixed
3-hour offset. This is correct as long as the business operates in one
timezone. If that ever changes, this single function is the one place to
fix, but every date/time computation across the app implicitly depends on
this convention (e.g. the notification cron's 9am/2pm/4:30pm schedule is
defined in UTC in `vercel.json` specifically converted from this
assumption — see the cron section below).

### Role-based access is enforced server-side, not just hidden in the UI
Frontend button-hiding is cosmetic. The real enforcement is
`requireMaintenanceEditAccess`, `requireManagerOrAdmin`,
`requireNotGarageManager` etc. in `lib/core.js`, called at the top of every
write function that needs it. When adding a new write function, always ask
"who should be able to call this" and add the guard — don't rely on the
frontend not showing the button.

### Notifications route through one function, not scattered per-trigger
`createNotification()` and `notifyRole()` in `lib/core.js` are the only
things that create a notification row. Every trigger — whether an
immediate action (Fleet→Garage) or a scheduled check (24h reservation
reminder) — calls through these. This is why adding push notifications to
all 6 original triggers (Phase 2d of the PWA work) was a one-line allowlist
change instead of touching 6 separate call sites: push-sending lives
*inside* `createNotification`, gated by `PUSH_ENABLED_TYPES`. Any new
notification trigger should follow the same pattern — call
`createNotification`/`notifyRole`, don't build a parallel path.

### Notification triggers check `notification_trigger_settings` and fail OPEN
If the settings table lookup fails for any reason (network hiccup, missing
row), `createNotification` proceeds as if the trigger is enabled rather
than silently swallowing the notification. This means: only trigger types
that are deliberately given a settings row (the original 6 in Admin
Panel's Notifications tab) are individually toggleable. Safety-net alert
types (like `storage_threshold`, `trigger_disabled_reminder`) intentionally
have NO settings row, so they always fire — this is relied upon, not
accidental. Don't add a settings row for a safety alert type unless you
specifically want it to be disable-able.

### Supplier/Driver/Part pickers are all the same interaction pattern
`SupplierPicker` (in `MaintenancePage.jsx`, exported and reused elsewhere),
`DriverPicker` (`ActionModal.jsx`), `GarageLocationPicker`
(`ActionModal.jsx`) — all type-ahead search over a fetched list, with an
always-visible "add new" option that creates inline rather than requiring
navigation away. When building a new picker for a similar "search existing
or create new" need, copy this pattern rather than reinventing it — it's
proven and users are already familiar with the interaction.

### Vendor "locations" are free text, not linked to real Fleet locations
A supplier's branches (`vendor_locations` table) are just names typed once
when adding that location — deliberately NOT tied to the Fleet locations
list (Dar - NBAA, Kinondoni, etc.), since a supplier's own branch naming
has nothing to do with SmilesCars' internal location vocabulary. Don't
conflate the two when extending this.

### `str_replace` near function/call-site boundaries is a known failure mode
This has caused real bugs multiple times across this project's history —
consuming or duplicating an adjacent function's declaration line, or
silently colliding two same-named functions across files (see the
`addDriver` / `addDriverWithPhone` collision, a real bug caught and fixed
mid-session). The mitigation is procedural, documented in
`CONTRIBUTING.md`: syntax-check after every individual edit, not just at
the end, and grep for a new function name across the whole stack (backend
function, `api/index.js` routing, frontend `api.js`) before assuming it's
safe.

## Scheduled jobs (Vercel Cron)

`api/cron-notifications.js` runs 3x/day — 9am, 2pm, 4:30pm EAT, which is
6:00, 11:00, 13:30 UTC in `vercel.json` (Vercel Cron schedules are always
UTC; this project's EAT assumption means every cron schedule needs manual
conversion, there's no automatic timezone handling). It's secured by
`CRON_SECRET` (a Bearer token Vercel sends automatically when the env var
is set) so it can't be triggered by anyone who finds the URL.

**Known limitation**: Vercel Cron schedules are fixed at deploy time.
Changing the 3 daily times requires editing `vercel.json` and redeploying
— there's no way to make them editable from Admin Panel without
restructuring the cron to run more frequently and check a stored
"is this time active" setting. This was discussed and deliberately
deferred (not built) — see chat history from the Notifications Admin
Panel work if this becomes worth revisiting.

Every cron run logs itself to `system_health_log` (success or failure) —
this is what Admin Panel's Systems Health section reads to answer "is this
actually running." If a new scheduled check is added, wire it into the
same `logHealth()` call in `api/cron-notifications.js` rather than
building separate logging.

## Known constraints / things to check periodically

- **GitHub PAT expiry**: the fine-grained token used to push this repo
  expires ~60 days after creation. A reminder is set (see project memory
  for the exact date) but if working across a long gap, check
  `CONTRIBUTING.md`'s environment table or just try a push early.
- **Database storage**: currently well under the 500MB free-tier ceiling
  (~14-15MB as of this writing), but Invoice Scanning photos are the
  fastest-growing consumer. Admin Panel's Systems Health panel shows
  current usage; a notification fires automatically at 350MB.
- **Anthropic API spend**: a manual spend cap was set in the Anthropic
  Console (not enforced in-app) as the real backstop against runaway
  invoice-scanning costs. If that account's billing setup ever changes,
  reconfirm the cap is still in place.

## Where things are NOT yet built (deliberately deferred, not forgotten)

- Cron schedule times editable from Admin Panel (see "Known limitation"
  above)
- Object storage migration for files (only needed if storage growth
  becomes a real constraint — see Systems Health)
- Confidence-based auto-flagging beyond invoice scanning (the low-
  confidence badge pattern in `ScanInvoiceModal` could extend to other
  AI-assisted flows if any are added later)
