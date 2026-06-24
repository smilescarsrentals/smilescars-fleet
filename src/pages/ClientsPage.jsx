// src/pages/ClientsPage.jsx
import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

function fmtDate(val) {
  if (!val) return "—";
  const d = String(val).split("T")[0];
  if (!d || d.length < 10) return val;
  const [y, m, dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}

function fmtMoney(val, cur) {
  if (!val) return "—";
  return `${cur || "TZS"} ${Number(val).toLocaleString("en-US")}`;
}

const PAY_STYLE = {
  Paid:           { bg: "#dcfce7", color: "#15803d" },
  "Partial Paid": { bg: "#fef3c7", color: "#92400e" },
  Unpaid:         { bg: "#fee2e2", color: "#b91c1c" },
  "Long Term":    { bg: "#ede9fe", color: "#6d28d9" },
};

export default function ClientsPage() {
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null); // client detail view

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await api.getClients();
      setClients(res.data || []);
    } catch (e) {
      setError("Failed to load clients: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter(c =>
      !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)
    );
  }, [clients, search]);

  if (loading) return <div style={styles.center}>Building client directory…</div>;
  if (error)   return <div style={styles.center}><p style={{ color: "#dc2626" }}>{error}</p><button onClick={load} style={styles.retryBtn}>Retry</button></div>;

  return (
    <div>
      {selected ? (
        <ClientDetail client={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
            <div>
              <h2 style={styles.pageTitle}>Client Directory</h2>
              <p style={styles.pageSubtitle}>{clients.length} clients · auto-built from rental history</p>
            </div>
            <button style={styles.refreshBtn} onClick={load}>↻ Refresh</button>
          </div>

          <div className="sc-filter-row" style={{ marginBottom: "1rem" }}>
            <input className="sc-search" style={styles.search} placeholder="Search name or phone…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>{filtered.length} clients</span>
          </div>

          <div className="sc-table-wrap">
            <table style={styles.table}>
              <thead>
                <tr>{["Client","Phone","Total Rentals","Last Rental","Total Charged","Unpaid"].map(h =>
                  <th key={h} style={styles.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={6} style={styles.empty}>No clients found.</td></tr>}
                {filtered.map((c, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                    onClick={() => setSelected(c)}>
                    <td data-label="Client" style={{ ...styles.td, fontWeight: 600 }}>{c.name}</td>
                    <td data-label="Phone" style={{ ...styles.td, color: "#555" }}>{c.phone || "—"}</td>
                    <td data-label="Rentals" style={{ ...styles.td, textAlign: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 16, color: "#1d4ed8" }}>{c.totalRentals}</span>
                    </td>
                    <td data-label="Last Rental" style={{ ...styles.td, fontSize: 12, color: "#555" }}>{fmtDate(c.lastRentalDate)}</td>
                    <td data-label="Total" style={{ ...styles.td, fontSize: 13 }}>{fmtMoney(c.totalAmount, c.currency)}</td>
                    <td data-label="Unpaid" style={styles.td}>
                      {c.unpaidCount > 0
                        ? <span style={{ ...styles.badge, background: "#fee2e2", color: "#b91c1c" }}>{c.unpaidCount} unpaid</span>
                        : <span style={{ ...styles.badge, background: "#dcfce7", color: "#15803d" }}>✓ Clear</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ClientDetail({ client, onBack }) {
  return (
    <div>
      <button style={styles.backBtn} onClick={onBack}>← Back to directory</button>

      <div style={styles.clientCard}>
        <div style={styles.clientAvatar}>{client.name.charAt(0).toUpperCase()}</div>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#111" }}>{client.name}</h2>
          {client.phone && <p style={{ fontSize: 14, color: "#888", margin: "4px 0 0" }}>{client.phone}</p>}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, textAlign: "center" }}>
          <div style={styles.statPill}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1d4ed8" }}>{client.totalRentals}</div>
            <div style={{ fontSize: 11, color: "#888" }}>Rentals</div>
          </div>
          <div style={styles.statPill}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#15803d" }}>{fmtMoney(client.totalAmount, client.currency)}</div>
            <div style={{ fontSize: 11, color: "#888" }}>Total Charged</div>
          </div>
          {client.unpaidCount > 0 && (
            <div style={styles.statPill}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#b91c1c" }}>{client.unpaidCount}</div>
              <div style={{ fontSize: 11, color: "#888" }}>Unpaid</div>
            </div>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#555", margin: "1.5rem 0 0.75rem", textTransform: "uppercase", letterSpacing: ".4px" }}>Rental History</h3>

      <div className="sc-table-wrap">
        <table style={styles.table}>
          <thead>
            <tr>{["Date","Plate","Type","Return Date","Amount","Payment","Location","Staff"].map(h =>
              <th key={h} style={styles.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {client.rentals.length === 0 && <tr><td colSpan={8} style={styles.empty}>No rentals found.</td></tr>}
            {[...client.rentals].sort((a, b) => b.date.localeCompare(a.date)).map((r, i) => {
              const ps = PAY_STYLE[r.payStatus];
              return (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td data-label="Date" style={{ ...styles.td, fontSize: 12, color: "#888" }}>{fmtDate(r.date)}</td>
                  <td data-label="Plate" style={{ ...styles.td, fontWeight: 600 }}>{r.plate}</td>
                  <td data-label="Type" style={{ ...styles.td, color: "#555" }}>{r.type}</td>
                  <td data-label="Return" style={{ ...styles.td, fontSize: 12, color: "#555" }}>{fmtDate(r.returnDate)}</td>
                  <td data-label="Amount" style={{ ...styles.td, fontSize: 13 }}>{fmtMoney(r.amount, r.currency)}</td>
                  <td data-label="Payment" style={styles.td}>
                    {r.payStatus ? <span style={{ ...styles.badge, ...(ps || {}) }}>{r.payStatus}</span> : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                  <td data-label="Location" style={{ ...styles.td, fontSize: 12 }}>
                    {r.location ? <span style={styles.locChip}>{r.location}</span> : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                  <td data-label="Staff" style={{ ...styles.td, fontSize: 12, color: "#555" }}>{r.staff || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  center:      { textAlign: "center", padding: "3rem", color: "#666" },
  retryBtn:    { marginTop: 12, padding: "8px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" },
  pageTitle:   { fontSize: 20, fontWeight: 700, color: "#111", margin: 0 },
  pageSubtitle:{ fontSize: 13, color: "#888", margin: "4px 0 0" },
  refreshBtn:  { padding: "8px 14px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" },
  search:      { padding: "8px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", width: 260 },
  table:       { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:          { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb", background: "#fafafa", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td:          { padding: "10px 12px", verticalAlign: "middle" },
  badge:       { display: "inline-block", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99 },
  locChip:     { fontSize: 12, background: "#f3f4f6", color: "#374151", borderRadius: 5, padding: "2px 8px" },
  empty:       { textAlign: "center", padding: "2.5rem", color: "#aaa", fontSize: 14 },
  backBtn:     { fontSize: 13, color: "#1d4ed8", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.25rem", fontWeight: 500 },
  clientCard:  { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.25rem", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: "0.5rem" },
  clientAvatar:{ width: 52, height: 52, borderRadius: "50%", background: "#1d4ed8", color: "#fff", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  statPill:    { background: "#f9fafb", borderRadius: 10, padding: "10px 16px", minWidth: 80 },
};
