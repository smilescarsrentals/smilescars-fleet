# Google Sheets → Supabase migration

The app no longer talks to Google. Every read and write now goes to Supabase
Postgres through a serverless API that ships **inside this repo**, so the app
and its backend are one Vercel deployment.

```
Before:  Browser ──▶ Apps Script /exec ──▶ Google Sheet + Drive
After:   Browser ──▶ /api (this repo)  ──▶ Supabase Postgres
```

The connection string lives only on the server. A browser cannot speak the
Postgres protocol, and the password must never ship to users — that is why the
variable is `DATABASE_URL` and **not** `VITE_DATABASE_URL` (Vite only exposes
`VITE_*` to the browser).

---

## Go live in four steps

### 1. Create/reconcile the schema

In Supabase: **SQL Editor → New query** → paste
[`db/schema.sql`](./db/schema.sql) → **Run**.

It is safe to re-run and safe on tables that already hold data: every statement
is `CREATE TABLE IF NOT EXISTS` or `ADD COLUMN IF NOT EXISTS`, and there is no
`DROP`, `DELETE`, or `UPDATE` of business data. It fills the gaps the sheet
export left behind (`config.active`, `blacklist.file_id`, a surrogate
`history.id`) and adds the tables that replace Drive (`files`, `agreements`,
`signature_tokens`, `staff_signatures`, `export_log`).

Then run [`db/harden_rls.sql`](./db/harden_rls.sql) — **recommended**. Supabase
publishes every `public` table through its own REST API using the *anon* key,
which is public by design. Without RLS, anyone holding that key can read your
fleet, your client list, and the staff passwords in `config`. Enabling RLS with
no policies slams that door; this API is unaffected because it connects as the
table owner.

### 2. Set two environment variables in Vercel

**Project → Settings → Environment Variables** (all environments):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres.vqfjjmxyvxwdvlyivdfz:YOUR_REAL_PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres` |
| `VITE_SCRIPT_URL` | **Delete it.** With it gone the app calls `/api` on its own domain. |

Port `6543` is the transaction pooler — the right choice for serverless, where
many short-lived connections appear at once. Port `5432` (session pooler) also
works if you prefer it; just swap the port.

Copy [`.env.example`](./.env.example) to `.env.local` for local runs.

### 3. Deploy

Push this branch and let Vercel build, or `npx vercel --prod`. Nothing else to
configure — `vercel.json` already routes `/api` to the function and everything
else to the SPA.

### 4. Verify

Open `https://<your-app>.vercel.app/api?action=health`. You want:

```json
{ "success": true, "connected": true, "problems": [], "tables": { … } }
```

Every table reports `exists: true`, a `rowCount`, and an empty
`missingColumns`. Anything in `problems` names the exact table and column to
fix — re-run `db/schema.sql` and check again. Then spot-check the app itself:
log in, open Fleet, check a car out, return it, and confirm the row moved in
Supabase's table editor.

**Rollback**, if you need it: set `VITE_SCRIPT_URL` back to the Apps Script
`/exec` URL and redeploy. No code change. (Writes made against Supabase in the
meantime won't be in the Sheet, so roll back early or not at all.)

---

## What moved

**Native on Supabase — every structured read and write:**
`getFleet`, `getHistory`, `getCarByPlate`, `getCarHistory`, `getHistoryByStaff`,
`getSold`, `getConfig`, `getStaffList`, `getSettings`, `getClients`,
`getSubHire`, `getFuel`, `getFuelByPlate`, `getReservations`,
`getAllReservations`, `getBlacklist`, `getDashboard` · `verifyStaff`,
`checkOut`, `markReturned`, `extendBooking`, `setMaintenance`, `setAvailable`,
`setStaffUse`, `updateLocation`, `updatePayment`, `markSold`, `addCar`,
`addCarNote`, `replaceVehicle`, `addStaff`, `setStaffActive`, `addLocation`,
`addGarage`, `addDriver`, `updateConfigItem`, `deleteConfigItem`,
`updateSetting`, `addSubHire`, `returnSubHire`, `updateSubHirePayment`,
`addFuel`, `editFuel`, `addReservation`, `editReservation`,
`deleteReservation`, `addToBlacklist`, `deleteFromBlacklist`.

**Formerly Google Drive / Script Properties, now Supabase too:**
`uploadBlacklistImage`, `storeSignature`, `getSignature`,
`storeStaffSignature`, `getStaffSignature`, `deleteStaffSignature`,
`uploadAgreement`, `getNextAgreementRef`, `logExport`, `getExportLog`,
`createBackupSnapshot`.

Licence photos, signatures and agreement PDFs are stored as `bytea` in the
`files` table and served back at `/api?action=file&id=…`. Stored links are
relative on purpose, so they survive a domain change. **Rows created in the
Drive era keep their `googleusercontent.com` links and still display** — as long
as you don't delete those Drive files.

### The one thing that does not carry over

**Dropbox auto-sync.** It was an Apps Script time trigger that filled Reg Card /
Photos links into the *sheet*, and there is no sheet any more. The API answers
`available: false` and the Admin Panel hides the toggle instead of showing a
control that can only fail. Existing `reg_card_url` / `photos_url` values are
untouched and still show on car profiles; new cars take those links in the Add
Car form. If you want that automation back, it needs re-implementing against
Supabase with your Dropbox credentials — say the word.

### Things to expect on day one

- **Staff signatures need re-capturing, once each.** The old ones live in Drive
  behind Script Properties the new backend can't read. The first agreement a
  staff member creates prompts them to draw or upload it; after that it's reused
  automatically, same as before.
- **Backup snapshots are now a JSON download**, not a copy of the spreadsheet in
  Drive. The button in Admin → System produces a dated dump of every table.
  Supabase's own daily backups still cover the database itself.
- **Photo uploads are compressed in the browser** (max 1600px, JPEG q0.82)
  before upload. Drive didn't care about size; a serverless request caps at
  ~4.5 MB, and a raw phone photo can exceed that. The API rejects anything over
  3 MB with a message that says so.
- **Staff passwords are still stored in plain text** in `config.password` —
  unchanged behaviour, carried over as-is so nobody's login breaks. It is worth
  fixing (hash + verify on the server), but it is a separate change with its own
  cutover, not something to fold into this one.

---

## Local development

```bash
npm install
cp .env.example .env.local        # add your real DB password

npx vercel dev                    # app + /api together on http://localhost:3000
```

`npm run dev` (plain Vite) serves the frontend only — it has no `/api`, so
every request fails. Use `vercel dev` when you need the backend.

Against a throwaway local Postgres instead of Supabase:

```bash
export DATABASE_URL='postgresql://postgres@localhost:5432/smilescars'
psql "$DATABASE_URL" -f db/schema.sql
```

TLS is required for Supabase and skipped automatically for `localhost`.

---

## How it fits together

```
api/index.js     one serverless function; routes an action to a handler,
                 serves stored files, and answers ?action=health
lib/db.js        pg pool + type parsers (timestamps stay wall-clock strings)
lib/core.js      write coercion, date formatting, auth/roles, shared helpers
lib/reads.js     every GET action
lib/writes.js    every structured POST action
lib/files.js     files, signatures, agreements, export log, backup snapshot
lib/health.js    schema diagnostics
db/schema.sql    idempotent schema
db/harden_rls.sql  lock the tables to this API only
```

Two conventions worth knowing before you edit anything:

- **Timestamps are Tanzania local time (UTC+3, no DST)**, stored naive and read
  back as raw strings, exactly as the Sheet held them. `nowTZ()` in
  `lib/core.js` is the only place that decides "now".
- **Blank vs NULL matters.** The app clears a field by sending `""`. Postgres
  rejects that for numeric and timestamp columns, so `coerce()` in
  `lib/core.js` turns `""` into `NULL` for exactly the columns listed there. If
  you add a numeric or timestamp column, add it to those maps too.

Errors follow the old Apps Script contract — HTTP 200 with `{ "error": "…" }` —
because that is what `src/lib/api.js` checks for.

---

## Testing

The API was exercised end-to-end against a real PostgreSQL 16 database seeded to
look like a fresh sheet export (core tables present, `config.active`,
`blacklist.file_id` and `history.id` missing, no Drive-era tables). 135 checks
covering every action pass from a clean rebuild: schema reconciliation and
re-run idempotency, the full check-out → extend → pay → return cycle and its
history trail, transfers, vehicle replacement, sale, role enforcement,
deactivated logins, config/settings CRUD, sub-hire, fuel ref sequencing,
reservation id sequencing, file upload/serve/delete, signature capture and
replacement, agreement ref sequencing, backup contents, and the error contract.

It has **not** been run against your live Supabase — that needs the real
password, which stays with you. `?action=health` plus the app spot-check in
step 4 is how you confirm it there.
