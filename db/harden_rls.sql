-- ============================================================================
--  SmilesCars — lock the tables down to the API only  (RECOMMENDED, optional)
--  Run in the Supabase SQL editor AFTER db/schema.sql.
-- ============================================================================
--
--  Why this matters
--  ----------------
--  Supabase publishes every table in the `public` schema through its own REST
--  API (PostgREST), reachable with the project's *anon* key — a key that is
--  public by design. Row Level Security is what stops that key from reading or
--  writing your data. On a table with RLS disabled, anyone holding the anon key
--  can read the whole fleet, the client list, and the staff passwords in
--  `config`.
--
--  Enabling RLS *without adding any policy* denies PostgREST completely, which
--  is exactly what we want: this app never uses the anon key. Its only path to
--  the data is the serverless API in /api, which connects over the Postgres
--  protocol as the table owner — and the owner bypasses RLS.
--
--  To undo:  ALTER TABLE <name> DISABLE ROW LEVEL SECURITY;
-- ============================================================================

ALTER TABLE fleet            ENABLE ROW LEVEL SECURITY;
ALTER TABLE history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sold             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_hire         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE files            ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_signatures ENABLE ROW LEVEL SECURITY;

-- Verify: every row below should read rowsecurity = true.
SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE schemaname = 'public'
 ORDER BY tablename;
