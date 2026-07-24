// src/pages/SoldPage.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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

  if (loading) return <div className="loading-screen"><div className="spinner" />Loading sold cars…</div>;
  if (error)   return <div style={styles.center}><p style={{ color: "var(--red)" }}>{error}</p><button type="button" className="btn btn-ghost" onClick={load}>Retry</button></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap:"wrap", gap:12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Sold Cars</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop:2 }}>{sold.length} cars sold and removed from active fleet. Tap a plate to see its rental history and revenue before sale.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-success btn-sm" onClick={handleExport}>⬇ Export</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      <div className="sc-filter-row">
        <input className="sc-search" style={styles.search} placeholder="Search plate or type…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <span className="result-count">{filtered.length} entries</span>
      </div>

      <div className="table-wrap">
        <table style={styles.table}>
          <thead>
            <tr>{["Sold On","Plate","Type","Remarks","Staff"].map(h =>
              <th key={h} data-label={h} style={styles.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} style={styles.empty}>No sold cars yet.</td></tr>}
            {filtered.map((s, i) => (
              <tr key={i}>
                <td data-label="Sold On" style={{ ...styles.td, fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(s.saleDate || s.timestamp)}</td>
                <td data-label="Plate" style={{ ...styles.td, fontWeight: 600, fontSize: 13 }}>
                  <span style={{ cursor:"pointer", color:"var(--sc-blue)", textDecoration:"underline" }}
                    onClick={() => navigate(`/car/${encodeURIComponent(s.plate)}`)}>
                    {s.plate}
                  </span>
                </td>
                <td data-label="Type" style={{ ...styles.td, color: "var(--text-muted)" }}>{s.type}</td>
                <td data-label="Remarks" style={{ ...styles.td, fontSize: 12, color: "var(--text-muted)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.remarks}>{s.remarks || "—"}</td>
                <td data-label="Staff" style={{ ...styles.td, fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{s.staffName || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  center:       { textAlign: "center", padding: "3rem", color: "var(--text-muted)" },
  search:       { padding: "8px 11px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--surface)" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", borderBottom: "1px solid var(--border)", background: "var(--bg)", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td:           { padding: "10px 12px", verticalAlign: "middle" },
  empty:        { textAlign: "center", padding: "2.5rem", color: "var(--text-faint)", fontSize: 14 },
};
