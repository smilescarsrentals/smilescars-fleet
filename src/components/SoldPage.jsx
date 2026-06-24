// src/pages/SoldPage.jsx
import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { exportToExcel } from "../lib/exportExcel";

function fmtDate(val) {
  if (!val) return "—";
  const datePart = String(val).split("T")[0];
  if (!datePart || datePart.length < 10) return val;
  const [yyyy, mm, dd] = datePart.split("-");
  return `${dd}-${mm}-${yyyy}`;
}

export default function SoldPage() {
  const [sold,    setSold]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [search,  setSearch]  = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await api.getSold();
      setSold(res.data || []);
    } catch (e) {
      setError("Failed to load sold cars: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sold.filter(s => !q || s.plate.toLowerCase().includes(q) || s.type.toLowerCase().includes(q));
  }, [sold, search]);

  const handleExport = () => {
    const rows = filtered.map(s => ({
      "Sold On": fmtDate(s.saleDate || s.timestamp), Plate: s.plate, Type: s.type,
      Remarks: s.remarks, Staff: s.staffName,
    }));
    exportToExcel(`SmilesCars_Sold_${new Date().toISOString().split("T")[0]}.xlsx`, [{ name: "Sold Cars", rows }]);
  };

  if (loading) return <div style={styles.center}>Loading sold cars…</div>;
  if (error)   return <div style={styles.center}><p style={{ color: "#dc2626" }}>{error}</p><button onClick={load} style={styles.retryBtn}>Retry</button></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={styles.pageTitle}>Sold Cars</h2>
          <p style={styles.pageSubtitle}>{sold.length} cars sold and removed from active fleet</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.exportBtn} onClick={handleExport}>⬇ Export</button>
          <button style={styles.refreshBtn} onClick={load}>↻ Refresh</button>
        </div>
      </div>

      <div className="sc-filter-row">
        <input style={styles.search} placeholder="Search plate or type…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>{filtered.length} entries</span>
      </div>

      <div className="sc-table-wrap">
        <table style={styles.table}>
          <thead>
            <tr>{["Sold On","Plate","Type","Remarks","Staff"].map(h =>
              <th key={h} style={styles.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} style={styles.empty}>No sold cars yet.</td></tr>}
            {filtered.map((s, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ ...styles.td, fontSize: 12, color: "#888" }}>{fmtDate(s.saleDate || s.timestamp)}</td>
                <td style={{ ...styles.td, fontWeight: 600, fontSize: 13 }}>{s.plate}</td>
                <td style={{ ...styles.td, color: "#555" }}>{s.type}</td>
                <td style={{ ...styles.td, fontSize: 12, color: "#777", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.remarks}>{s.remarks || "—"}</td>
                <td style={{ ...styles.td, fontSize: 12, fontWeight: 500, color: "#374151" }}>{s.staffName || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  center:       { textAlign: "center", padding: "3rem", color: "#666" },
  retryBtn:     { marginTop: 12, padding: "8px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" },
  pageTitle:    { fontSize: 20, fontWeight: 700, color: "#111", margin: 0 },
  pageSubtitle: { fontSize: 13, color: "#888", margin: "4px 0 0" },
  exportBtn:    { padding: "8px 14px", fontSize: 13, border: "1.5px solid #16a34a", borderRadius: 7, background: "#f0fdf4", cursor: "pointer", color: "#15803d", fontWeight: 500 },
  refreshBtn:   { padding: "8px 14px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" },
  filterRow:    { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" },
  search:       { padding: "8px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", width: 240 },
  tableWrap:    { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb", background: "#fafafa", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td:           { padding: "10px 12px", verticalAlign: "middle" },
  empty:        { textAlign: "center", padding: "2.5rem", color: "#aaa", fontSize: 14 },
};
