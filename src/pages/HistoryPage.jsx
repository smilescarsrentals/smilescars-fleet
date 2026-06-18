// src/pages/HistoryPage.jsx
import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

const ACTION_COLORS = {
  "Checked Out":        { bg: "#fef9c3", color: "#854d0e" },
  "Returned":           { bg: "#dcfce7", color: "#15803d" },
  "Booking Extended":   { bg: "#e0f2fe", color: "#0369a1" },
  "Sent to Maintenance":{ bg: "#ffedd5", color: "#c2410c" },
  "Sent to Garage":     { bg: "#ede9fe", color: "#6d28d9" },
  "Marked Available":   { bg: "#dcfce7", color: "#15803d" },
  "Location Updated":   { bg: "#f3f4f6", color: "#374151" },
};

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-TZ", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-TZ", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(val) {
  if (!val) return "—";
  const datePart = String(val).split("T")[0];
  if (!datePart || datePart.length < 10) return val;
  const [yyyy, mm, dd] = datePart.split("-");
  return `${dd}-${mm}-${yyyy}`;
}

function fmtMoney(val) {
  if (!val) return "—";
  return "TZS " + Number(val).toLocaleString();
}

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [search,  setSearch]  = useState("");
  const [fAction, setFAction] = useState("");
  const [fStaff,  setFStaff]  = useState("");
  const [page,    setPage]    = useState(1);
  const PER_PAGE = 30;

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await api.getHistory();
      setHistory(res.data || []);
    } catch (e) {
      setError("Failed to load history: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const actions = useMemo(() => [...new Set(history.map(h => h.action).filter(Boolean))].sort(), [history]);
  const staff   = useMemo(() => [...new Set(history.map(h => h.staffName).filter(Boolean))].sort(), [history]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return history.filter(h =>
      (!q || h.plate.toLowerCase().includes(q) || (h.client||"").toLowerCase().includes(q) || (h.staffName||"").toLowerCase().includes(q)) &&
      (!fAction || h.action    === fAction) &&
      (!fStaff  || h.staffName === fStaff)
    );
  }, [history, search, fAction, fStaff]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  if (loading) return <div style={styles.center}>Loading history…</div>;
  if (error)   return <div style={styles.center}><p style={{ color: "#dc2626" }}>{error}</p><button onClick={load} style={styles.retryBtn}>Retry</button></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={styles.pageTitle}>Activity History</h2>
          <p style={styles.pageSubtitle}>{history.length} total entries · most recent first</p>
        </div>
        <button style={styles.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      <div style={styles.filterRow}>
        <input style={styles.search} placeholder="Search plate, client or staff…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select style={styles.sel} value={fAction} onChange={e => { setFAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>
          {actions.map(a => <option key={a}>{a}</option>)}
        </select>
        <select style={styles.sel} value={fStaff} onChange={e => { setFStaff(e.target.value); setPage(1); }}>
          <option value="">All staff</option>
          {staff.map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>{filtered.length} entries</span>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Time","Plate","Type","Action","Client","Return Date","KM Out","KM In","Amount","Location","Remarks","Staff"].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr><td colSpan={12} style={styles.empty}>No history entries found.</td></tr>
            )}
            {paginated.map((h, i) => {
              const ac = ACTION_COLORS[h.action] || { bg: "#f3f4f6", color: "#374151" };
              return (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ ...styles.td, whiteSpace: "nowrap", color: "#888", fontSize: 12 }}>{fmt(h.timestamp)}</td>
                  <td style={{ ...styles.td, fontWeight: 600, fontSize: 13 }}>{h.plate}</td>
                  <td style={{ ...styles.td, color: "#555" }}>{h.type}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: ac.bg, color: ac.color }}>{h.action}</span>
                  </td>
                  <td style={{ ...styles.td, fontSize: 13 }}>
                    {h.client
                      ? <div>
                          <div style={{ fontWeight: 500 }}>{h.client}</div>
                          {h.clientPhone && <div style={{ fontSize: 12, color: "#888" }}>{h.clientPhone}</div>}
                        </div>
                      : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                 <td style={{ ...styles.td, fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>
  {fmtDate(h.returnDate)}
</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555" }}>{h.kmOut || "—"}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555" }}>{h.kmIn  || "—"}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>
                    {fmtMoney(h.amountCharged)}
                  </td>
                  <td style={styles.td}>
                    {h.location ? <span style={styles.locChip}>{h.location}</span> : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#777", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={h.remarks}>{h.remarks || "—"}</td>
                  <td style={{ ...styles.td, fontSize: 12, fontWeight: 500, color: "#374151" }}>{h.staffName || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={styles.pager}>
          <button style={styles.pgBtn} onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹ Prev</button>
          <span style={{ fontSize: 13, color: "#555" }}>Page {page} of {totalPages}</span>
          <button style={styles.pgBtn} onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next ›</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  center:      { textAlign: "center", padding: "3rem", color: "#666" },
  retryBtn:    { marginTop: 12, padding: "8px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" },
  pageTitle:   { fontSize: 20, fontWeight: 700, color: "#111", margin: 0 },
  pageSubtitle:{ fontSize: 13, color: "#888", margin: "4px 0 0" },
  refreshBtn:  { padding: "8px 14px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" },
  filterRow:   { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" },
  search:      { padding: "8px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", width: 240 },
  sel:         { padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff" },
  tableWrap:   { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:          { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb", background: "#fafafa", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td:          { padding: "10px 12px", verticalAlign: "middle" },
  badge:       { display: "inline-block", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" },
  locChip:     { fontSize: 12, background: "#f3f4f6", color: "#374151", borderRadius: 5, padding: "2px 8px" },
  empty:       { textAlign: "center", padding: "2.5rem", color: "#aaa", fontSize: 14 },
  pager:       { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "1rem 0" },
  pgBtn:       { padding: "7px 16px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer" },
};
