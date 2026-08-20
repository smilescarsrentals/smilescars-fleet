# SmilesCars Fleet Manager — Handoff Summary

Written for starting a fresh chat and continuing this project without
re-explaining context. Everything below was verified against the real repo
and live database as of this writing — commit `5bce681`, `main` branch,
working tree clean.

## What this is

**SmilesCars Fleet Manager** — internal fleet management web app for a car
rental company (Smiles Rent a Car Services Ltd), operating in Zanzibar and
Dar es Salaam, Tanzania. Ramzanali is Head of Marketing & Design and the
sole IT person; Claude acts as the implementation engineer, Ramzanali as
product owner.

**Live domain**: `fleet.smilescars.co.tz`
**Repo**: `smilescarsrentals/smilescars-fleet` on GitHub

## Stack

- **Frontend**: React + Vite, deployed on Vercel with GitHub auto-deploy
  (push to `main` → live in a few minutes)
- **Backend**: Node.js serverless function (`api/index.js`) on Vercel
- **Database**: Supabase Postgres, project ID `vqfjjmxyvxwdvlyivdfz`
  (region eu-west-1)
- **No separate backend server** — the Vercel function IS the backend

### Backend file layout (`lib/`)
- `core.js` — shared helpers (`q`/`q1`/`run`/`tx`, access-control checks,
  notification helpers, date/timezone helpers)
- `db.js` — the Postgres connection pool + `tx()` transaction wrapper
- `reads.js` — every `GET` action (all read/query functions)
- `writes.js` — every `POST` action (all mutation functions)
- `files.js` — binary file storage/serving (`storeFile`/`serveFile`),
  including the `?download=1` force-download query param
- `health.js` — system health check logic
- `invoiceScan.js` — Claude vision API call for invoice OCR
- `notificationTriggers.js` — the scheduled (cron) notification checks

### Frontend file layout (`src/`)
- `pages/*.jsx` — one file per page/route, most lazy-loaded via
  `React.lazy()` for bundle size (Dashboard and the public Signature page
  stay eager)
- `components/` — shared UI (Layout, AdminPanel, RentalAgreementModal,
  ActionModal, etc.)
- `lib/api.js` — the frontend's typed wrapper around every backend action
- `lib/*.js` — client-side utilities (image compression, CSV/ZIP/PDF
  parsing for bulk import features)

## What's been built (functional areas)

- **Fleet**: full CRUD, status tracking (Available/Rented/Maintenance/
  Staff Use), plate renaming with alias tracking (see below), location
  management
- **Checkout flow**: Rental vs. Transfer booking types, rental agreement
  generation (PDF + signature capture), driver assignment
- **Garage**: Work Orders (maintenance), Customer Jobs (outside-customer
  repairs), Parts Inventory with cost history, Suppliers/Vendors with
  per-location tracking, Service Templates, Checklists, Invoice Scanning
  (photo → Claude vision → structured data → Purchase Invoices, including
  bulk PDF-splitting)
- **Drivers** (a full HR-lite module built this project): profile photos,
  documents (License/National ID/TIN Certificate/Defensive Driving
  Cert/Others) with expiry tracking and 30/7-day reminder notifications,
  bulk CSV import (with a downloadable template) and bulk ZIP document
  import, PDF page-splitting into separate documents, client assignment
  history (derived from checkout data, not manually maintained), a full
  filter panel (Availability/Status/Document Status/Photo/Client), and a
  granular `can_manage_drivers` permission separate from role
- **Notifications**: in-app bell + Web Push (PWA), 7 trigger types (Fleet→
  Garage, Low Stock, mid-rental Garage moves, 24h reservation reminders,
  unpaid Customer Jobs, driver document expiry, disabled-trigger self-
  alerts), all individually toggleable in Admin Panel, plus a storage-
  threshold self-alert
- **Admin Panel**: 5 tabs (Fleet config, Staff, Notifications, Features,
  System/health)
- **Dashboard**: daily summary stats + a Revenue widget (booking value +
  amount paid, broken out per currency, filterable by month — built with
  an honest "X of Y bookings had an amount recorded" caveat since the
  underlying data is genuinely incomplete)
- **Reservations, Sub-Hire, Fuel, History, Blacklist, Leads, Clients,
  Sold** — standard CRUD/list pages, most sharing the `sc-filter-row`
  mobile-responsive filter pattern

## Key architectural decisions (see `PROJECT_NOTES.md` for full detail)

Read `PROJECT_NOTES.md` in the repo root before making non-trivial
changes — it has the *why* behind these, not just the *what*:

1. **Files live in Postgres** (`bytea` in the `files` table), not object
   storage — a deliberate simplicity tradeoff. Client-side image
   compression exists specifically to keep this sustainable. Storage
   usage is monitored (Admin Panel → System) with a threshold alert.
2. **Hardcoded UTC+3** timezone assumption throughout (`nowTZ()` in
   `core.js`). Correct as long as the business operates in one timezone.
3. **Access control is server-side**, checked at the top of write
   functions (`requireManagerOrAdmin`, `requireDriverManageAccess`, etc.)
   — never rely on the frontend hiding a button.
4. **Notifications route through one function** (`createNotification`/
   `notifyRole` in `core.js`) — never build a parallel notification path.
5. **Plate renames don't rewrite history** — a `plate_history` table
   tracks aliases so a car's full History/Fuel/Maintenance stays
   findable under either its old or new plate, while old records keep
   showing the plate as it actually was at the time. See
   `getPlateAliases()`/`renameFleetPlate()` in `lib/reads.js`/`writes.js`.
6. **`str_replace` near function boundaries is a known failure mode** —
   has caused real bugs multiple times (consuming/duplicating adjacent
   code). Always re-view a file immediately after editing it, and run a
   full build, not just a bracket check, before trusting a large edit.

## The verification discipline (see `CONTRIBUTING.md` for the full checklist)

This project's safety net has been: sync → edit → syntax-check every
touched file after *every* individual edit (not just at the end) →
bracket-check JSX → **full `vite build`** (the bracket checker alone has
missed real bugs a build catches) → verify any new/changed backend logic
directly against Supabase with disposable test data, confirming cleanup
afterward → final build → push. This has caught genuine bugs before they
shipped, repeatedly. Don't skip it, even for small-looking changes.

## Known risk-list items — status as of this doc

A full risk assessment was done earlier in this project and every item
was addressed with a real mechanism (not just awareness):

| Risk | Status |
|---|---|
| Storage growth | Monitored, alerts at 350MB (of 500MB free tier) |
| Anthropic API cost | Spend cap set by Ramzanali on console.anthropic.com |
| Invoice scan accuracy | Low-confidence fields flagged on the review screen |
| Silent secret/integration failures | Admin Panel → System health panel |
| GitHub PAT expiry | See "Git access" below — **this is the one thing that needs attention soon** |
| No automated tests | `CONTRIBUTING.md` documents the manual discipline used instead |
| Notification trigger audit trail | Tracked (`updated_by` on toggle) |
| Bundle size | Route-level lazy loading + dynamic imports for heavy libs (`xlsx`, `pdfjs-dist`) |
| Supabase/GitHub connection drops | Have recurred a few times this project — see below |
| Undocumented tribal knowledge | `PROJECT_NOTES.md` + this file |

---

# What you (Ramzanali) need to do to continue smoothly

## 1. Git / GitHub — the PAT problem (do this first)

Claude does **not** have persistent access to push to GitHub. Every work
session in this project so far has needed the fine-grained Personal
Access Token pasted fresh into the chat before Claude can push — this
has happened repeatedly because Claude's working environment gets reset
between sessions (and sometimes mid-session), which wipes stored git
credentials.

**What to do**: Have your GitHub fine-grained PAT ready (Settings →
Developer settings → Fine-grained tokens, scoped to
`smilescarsrentals/smilescars-fleet`, Contents: Read and write). When
Claude asks for it to push, paste it directly in chat — Claude uses it
only for that push and removes it from its local config immediately
after.

**Known expiry**: the current token was created ~2026-08-04 with a
60-day expiration → **expires ~2026-10-03**. A reminder was set (Claude's
reminder tool) for ~2026-09-26 to prompt regenerating it, but if you're
starting a new chat after that date, generate a **new** fine-grained
token before starting work, rather than waiting to be asked.

## 2. Supabase access

Claude connects to Supabase via an MCP integration, not the PAT above.
This connection has dropped and needed reconnecting a few times during
this project (unrelated to the GitHub PAT issue). **If Claude reports it
can't reach Supabase** (a permissions error on even a simple query):
check the connector under your Claude account's connected
integrations/apps settings, and reconnect/re-authorize it if needed —
separate from checking that the Supabase project itself is "Active" in
Supabase's own dashboard (both have been true independently at different
points).

## 3. Vercel

No action needed from you day-to-day — pushing to `main` auto-deploys.
If Claude ever needs to confirm a deployment actually went live (e.g.
after reporting a bug that turns out to be a caching/deploy-lag issue),
you may be asked to check the Vercel dashboard's Deployments tab and
confirm the latest one shows "Ready" in Production.

**Environment variables** (set in Vercel, not committed to the repo —
see `.env.example` for the annotated list): `DATABASE_URL` (Supabase
connection string), `VITE_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (Web
Push), `ANTHROPIC_API_KEY` (invoice scanning), `CRON_SECRET` (locks the
notification cron endpoint). None of these need to change unless one is
rotated.

## 4. Starting a new chat

Paste this file's content (or attach it) at the start of a new
conversation, along with a description of what you want done next.
Claude will re-sync with the actual repo (`git fetch origin main`) and
re-verify state itself before making changes — it doesn't need to trust
this document blindly, and neither should you if something here turns
out to be stale by the time you read it. The real repo (`db/schema.sql`,
`PROJECT_NOTES.md`, `CONTRIBUTING.md`, the git log) is always the source
of truth; this file is a map to it, not a replacement for it.

## 5. What to have ready when you ask for something new

- If it touches real production data (like the Fleet plate reconciliation
  done earlier), have your source data ready (spreadsheet, etc.) and
  expect Claude to ask clarifying questions before touching anything —
  that's deliberate, not a stall.
- If it's a bug report, a screenshot is the single most useful thing you
  can provide — several real bugs this project were only found because
  a screenshot revealed something code review alone didn't.
- If Claude proposes a design decision (e.g. "should X count as Y"),
  answering precisely up front has consistently avoided rework later in
  this project — worth the extra thirty seconds.
