# Contributing / Pre-Push Checklist

This is the discipline that's kept this project's live database and production
deploy safe across a long build history. It's written down here so it survives
between sessions — whoever (or whatever) is working on this repo next should
follow it, not just whoever happened to build the last feature.

## Before every push

Run these in order. Do not skip steps because a change "looks small" — several
real bugs this project has shipped were caught by exactly these checks on
changes that looked trivial.

### 1. Sync first
```bash
git fetch origin main && git status
```
Confirm you're up to date with `origin/main` and see exactly which files are
modified before touching anything further. If there are unexpected local
changes you don't recognize, investigate before assuming they're safe —
don't overwrite work you don't understand.

### 2. Syntax-check every touched backend file, after EVERY edit
```bash
node --check lib/core.js
node --check lib/reads.js
node --check lib/writes.js
node --check api/index.js
# ...and any other backend file you touched
```
Not just once at the end — after each individual `str_replace`/edit. `str_replace`
near function or call-site boundaries has repeatedly consumed or duplicated
adjacent code in this project's history. Catching it one edit later is a
30-second fix; catching it after ten more edits is a much longer unwind.

### 3. Bracket-balance check every touched frontend file
```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('PATH_TO_FILE.jsx','utf8');
const pairs = {'(' : ')', '{':'}', '[':']'};
const stack = [];
for (const ch of src) {
  if ('([{'.includes(ch)) stack.push(ch);
  else if (')]}'.includes(ch)) {
    const open = stack.pop();
    if (!open || pairs[open] !== ch) { console.log('MISMATCH'); process.exit(1); }
  }
}
console.log('Balanced. Stack:', stack.length);
"
```
A useful fast signal, but not a substitute for step 4.

### 4. Full build — the real authority
```bash
npx vite build
```
This is what actually confirms JSX/imports/exports are correct. The bracket
check can pass while the build still fails (e.g. a missing import, a
component referenced before it's defined). Always run this before pushing,
not just when something feels risky.

### 5. Verify new/changed backend logic directly against Supabase
For any new write function, schema change, or altered query — before trusting
it:
- Run the exact SQL the function executes, with disposable test data
- Confirm the actual behavior (inserts land correctly, updates apply, joins
  return the right shape, dedupe/conflict logic works as intended)
- **Clean up every test row you created** — verify the cleanup worked with a
  follow-up `count(*)` query, don't just assume the DELETE succeeded
- If you touched a REAL existing row to test an update path (not a disposable
  test row), always revert it to its original value and confirm the revert

If Supabase access is unavailable (connection/permission errors), do not
skip this step silently — say so explicitly, and treat anything pushed under
those conditions as unverified until it can be checked.

### 6. Final full check, then push
```bash
npx vite build 2>&1 | tail -15   # one more time, after all changes
git fetch origin main && git status   # confirm still in sync
git add -A
git commit -m "..."
git push origin main
```

If a commit message contains special characters (quotes, backticks) that
might break shell parsing, write it to a temp file and use `git commit -F
/tmp/commit_msg.txt` rather than fighting shell escaping inline.

## If a tool-call batch gets interrupted or aborted mid-flight

Don't assume anything landed or didn't. Before continuing:
1. `git status` — see what's actually on disk
2. Grep for markers of the specific change you expected to see
3. Bracket-check + full build to confirm current state is genuinely valid
4. Only then continue or redo work

This project has recovered cleanly from aborted batches this way more than
once — checking first is faster than guessing wrong and having to unwind it.

## Environment / secrets

Current required environment variables (see `.env.example` for the full
annotated list):

| Variable | Purpose | Where it's used |
|---|---|---|
| `DATABASE_URL` | Supabase Postgres connection | All backend reads/writes |
| `VITE_VAPID_PUBLIC_KEY` | Web Push, public half | Frontend + server (both read it) |
| `VAPID_PRIVATE_KEY` | Web Push, signs outgoing pushes | Server only, never exposed |
| `ANTHROPIC_API_KEY` | Invoice scanning (Claude vision) | Server only, never exposed |
| `CRON_SECRET` | Locks down `/api/cron-notifications` | Server only |

Rotating or regenerating any of these requires updating them in Vercel's
Environment Variables and redeploying — there is no in-app way to change
them.

**Known expiry**: the GitHub fine-grained PAT used to push this repo expires
~60 days after creation. A reminder is set for ~1 week before the known
expiry date — see project memory for the exact date, and regenerate the
token in GitHub Developer Settings before it lapses.
