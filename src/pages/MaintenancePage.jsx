import { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function MaintenancePage({ staffName, role }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const res = await api.getMaintenanceLog();
      setLogs(res?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load maintenance records.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Maintenance</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 0" }}>
          Logged in as {staffName} · {role}
        </p>
      </div>

      <div style={{
        background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 12,
        padding: "2.5rem 1.5rem", textAlign: "center", maxWidth: 520, margin: "0 auto",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: "var(--blue-bg)",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--sc-blue)" strokeWidth="1.8" width="22" height="22">
            <path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.8 2.8-2-2 2.8-2.8z" />
          </svg>
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>Work order board coming next</h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 4px", lineHeight: 1.5 }}>
          This page is connected and ready — the Maintenance table exists and is loading correctly.
          The work order board (Queued → In Progress → Awaiting Parts → Completed) is being built next.
        </p>

        {loading && <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 14 }}>Checking connection…</p>}
        {err && <p style={{ fontSize: 12, color: "var(--red)", marginTop: 14 }}>{err}</p>}
        {!loading && !err && (
          <p style={{ fontSize: 12, color: "var(--green)", marginTop: 14, fontWeight: 600 }}>
            ✓ Connected — {logs.length} work order{logs.length !== 1 ? "s" : ""} on file
          </p>
        )}
      </div>
    </div>
  );
}
