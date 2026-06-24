// src/pages/HistoryPage.jsx
import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { cache } from "../lib/cache";
import { exportToExcel } from "../lib/exportExcel";

const ACTION_COLORS = {
  "Checked Out":        { bg: "#fef9c3", color: "#854d0e" },
  "Returned":           { bg: "#dcfce7", color: "#15803d" },
  "Booking Extended":   { bg: "#e0f2fe", color: "#0369a1" },
  "Sent to Maintenance":{ bg: "#ffedd5", color: "#c2410c" },
  "Marked Available":   { bg: "#dcfce7", color: "#15803d" },
  "Location Updated":   { bg: "#f3f4f6", color: "#374151" },
  "Payment Updated":    { bg: "#ede9fe", color: "#6d28d9" },
  "Sold":                { bg: "#fee2e2", color: "#b91c1c" },
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

function fmtNum(val) {
  if (val === "" || val === null || val === undefined) return "";
  const n = Number(val);
  if (isNaN(n)) return val;
  return n.toLocaleString("en-US");
}

function fmtMoney(val, currency) {
  if (!val) return "—";
  return `${currency || "TZS"} ${fmtNum(val)}`;
}

export default function HistoryPage({ role }) {
  const canExport = role === "Admin" || role === "Manager";
  const [history,    setHistory]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [search,     setSearch]     = useState("");
  const [fAction,    setFAction]    = useState("");
  const [fLocation,  setFLocation]  = useState("");
  const [fType,      setFType]      = useState("");
  const [fStaff,     setFStaff]     = useState("");
  const [fDate,      setFDate]      = useState("");
  const [showExport, setShowExport] = useState(false);
  // export-only filters
  const [exPlate,    setExPlate]    = useState("");
  const [exType,     setExType]     = useState("");
  const [exLocation, setExLocation] = useState("");
  const [exFrom,     setExFrom]     = useState("");
  const [exTo,       setExTo]       = useState("");
  const [page,       setPage]       = useState(1);
  const PER_PAGE = 30;

  const load = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = cache.get("history", 120000); // 2 min cache for history
      if (cached) { setHistory(cached); setLoading(false); return; }
    }
    setLoading(true); setError("");
    try {
      const res = await api.getHistory();
      const data = res.data || [];
      setHistory(data);
      cache.set("history", data);
    } catch (e) {
      setError("Failed to load history: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const actions   = useMemo(() => [...new Set(history.map(h => h.action).filter(Boolean))].sort(), [history]);
  const types     = useMemo(() => [...new Set(history.map(h => h.type).filter(Boolean))].sort(), [history]);
  const locations = useMemo(() => [...new Set(history.map(h => h.location).filter(Boolean))].sort(), [history]);
  const staff     = useMemo(() => [...new Set(history.map(h => h.staffName).filter(Boolean))].sort(), [history]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return history.filter(h => {
      const ts = h.timestamp ? h.timestamp.split("T")[0] : "";
      return (
        (!q || h.plate.toLowerCase().includes(q) || h.type.toLowerCase().includes(q) || (h.client||"").toLowerCase().includes(q)) &&
        (!fAction   || h.action    === fAction) &&
        (!fLocation || h.location  === fLocation) &&
        (!fType     || h.type      === fType) &&
        (!fStaff    || h.staffName === fStaff) &&
        (!fDate     || ts === fDate)
      );
    });
  }, [history, search, fAction, fLocation, fType, fStaff, fDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const exportRows = useMemo(() => {
    const q = exPlate.toLowerCase();
    return history.filter(h => {
      const ts = h.timestamp ? h.timestamp.split("T")[0] : "";
      return (!q || h.plate.toLowerCase().includes(q)) &&
        (!exType     || h.type     === exType) &&
        (!exLocation || h.location === exLocation) &&
        (!exFrom     || ts >= exFrom) &&
        (!exTo       || ts <= exTo);
    });
  }, [history, exPlate, exType, exLocation, exFrom, exTo]);

  const handleExport = () => {
    const rows = exportRows.map(h => ({
      Time: fmt(h.timestamp), Plate: h.plate, Type: h.type, Action: h.action,
      Client: h.client, Phone: h.clientPhone, "Booked From": fmtDate(h.bookedFrom),
      "Return Date": fmtDate(h.returnDate), "Fuel Out": h.fuelOut, "Fuel In": h.fuelIn,
      Amount: fmtNum(h.amount), Currency: h.currency,
      "Police Fine": fmtNum(h.policeFine), "Parking Fine": fmtNum(h.parkingFine),
      Garage: h.garage, Location: h.location, "Payment Status": h.paymentStatus,
      "Amount Paid": fmtNum(h.amountPaid), Remarks: h.remarks, Staff: h.staffName,
    }));
    const label = exFrom || exTo ? `${exFrom||"start"}_to_${exTo||"now"}` :
                  exPlate ? exPlate.replace(/\s/g,"") :
                  exLocation ? exLocation.replace(/\s/g,"") : "all";
    exportToExcel(`SmilesCars_History_${label}.xlsx`, [{ name: "History", rows }]);
    setShowExport(false);
  };

  if (loading) return <div style={styles.center}>Loading history…</div>;
  if (error)   return <div style={styles.center}><p style={{ color: "#dc2626" }}>{error}</p><button onClick={load} style={styles.retryBtn}>Retry</button></div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={styles.pageTitle}>Activity History</h2>
          <p style={styles.pageSubtitle}>{history.length} total entries · most recent first</p>
        </div>
      </div>

      {showExport && canExport && (
        <div style={styles.exportPanel}>
          <p style={styles.exportTitle}>Export History to Excel</p>
          <div style={styles.exportGrid}>
            <div>
              <label style={styles.exportLabel}>Car (plate)</label>
              <input style={styles.exportSel} placeholder="Search plate…" value={exPlate} onChange={e => setExPlate(e.target.value)} />
            </div>
            <div>
              <label style={styles.exportLabel}>Type</label>
              <select style={styles.exportSel} value={exType} onChange={e => setExType(e.target.value)}>
                <option value="">All types</option>
                {types.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.exportLabel}>Location</label>
              <select style={styles.exportSel} value={exLocation} onChange={e => setExLocation(e.target.value)}>
                <option value="">All locations</option>
                {locations.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.exportLabel}>From date</label>
              <input type="date" style={styles.exportSel} value={exFrom} onChange={e => setExFrom(e.target.value)} />
            </div>
            <div>
              <label style={styles.exportLabel}>To date</label>
              <input type="date" style={styles.exportSel} value={exTo} onChange={e => setExTo(e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#888", margin: "10px 0" }}>
            Exports {exportRows.length} entries matching the filters above.
          </p>
          <button style={styles.exportConfirmBtn} onClick={handleExport}>⬇ Download Excel ({exportRows.length} rows)</button>
        </div>
      )}

      <div className="sc-filter-row">
        <input style={styles.search} placeholder="Search plate, type or client…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select style={styles.sel} value={fAction} onChange={e => { setFAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>
          {actions.map(a => <option key={a}>{a}</option>)}
        </select>
        <select style={styles.sel} value={fLocation} onChange={e => { setFLocation(e.target.value); setPage(1); }}>
          <option value="">All locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <select style={styles.sel} value={fType} onChange={e => { setFType(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={styles.sel} value={fStaff} onChange={e => { setFStaff(e.target.value); setPage(1); }}>
          <option value="">All staff</option>
          {staff.map(s => <option key={s}>{s}</option>)}
        </select>
        <input type="date" style={styles.sel} value={fDate}
          onChange={e => { setFDate(e.target.value); setPage(1); }}
          title="Filter by date" />
        {(search || fAction || fLocation || fType || fStaff || fDate) && (
          <button style={styles.clearBtn} onClick={() => { setSearch(""); setFAction(""); setFLocation(""); setFType(""); setFStaff(""); setFDate(""); setPage(1); }}>Clear</button>
        )}
        <span style={styles.countLabel}>{filtered.length} of {history.length}</span>
        {canExport && <button style={styles.exportBtn} onClick={() => setShowExport(v => !v)}>⬇ Export</button>}
        <button style={styles.refreshBtn} onClick={() => { cache.clear("history"); load(true); }}>↻</button>
      </div>

      <div className="sc-table-wrap">
        <table style={styles.table}>
          <thead>
            <tr>
              {["Time","Plate","Type","Action","Client","Return Date","Garage","Fuel Out","Fuel In","Amount","Payment","Location","Remarks","Staff"].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr><td colSpan={14} style={styles.empty}>No history entries found.</td></tr>
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
                  <td style={{ ...styles.td, fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>{fmtDate(h.returnDate)}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#c2410c", fontWeight: 500 }}>{h.garage || "—"}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555" }}>{h.fuelOut || "—"}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555" }}>{h.fuelIn || "—"}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>
                    {fmtMoney(h.amount, h.currency)}
                    {(h.policeFine || h.parkingFine) && (
                      <div style={{ fontSize: 10, color: "#dc2626", marginTop: 2 }}>
                        {h.policeFine ? `Police: ${fmtMoney(h.policeFine, h.currency)}` : ""}
                        {h.policeFine && h.parkingFine ? " · " : ""}
                        {h.parkingFine ? `Parking: ${fmtMoney(h.parkingFine, h.currency)}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ ...styles.td, fontSize: 11 }}>
                    {h.paymentStatus
                      ? <span>{h.paymentStatus}{h.amountPaid ? ` (${fmtMoney(h.amountPaid, h.currency)})` : ""}</span>
                      : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                  <td style={styles.td}>
                    {h.location ? <span style={styles.locChip}>{h.location}</span> : <span style={{ color: "#ccc" }}>—</span>}
                  </td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#777", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
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
  center:        { textAlign: "center", padding: "3rem", color: "#666" },
  retryBtn:      { marginTop: 12, padding: "8px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" },
  pageTitle:     { fontSize: 20, fontWeight: 700, color: "#111", margin: 0 },
  pageSubtitle:  { fontSize: 13, color: "#888", margin: "4px 0 0" },
  exportPanel:   { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "1rem", marginBottom: "1.25rem" },
  exportTitle:   { fontSize: 14, fontWeight: 600, color: "#15803d", marginBottom: 10 },
  exportGrid:    { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 },
  exportLabel:   { fontSize: 11, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 },
  exportConfirmBtn: { padding: "9px 18px", fontSize: 13, fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" },
  filterRow:     { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" },
  search:        { padding: "8px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", width: 220 },
  sel:           { padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111" },
  exportSel:     { padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", width: "100%", boxSizing: "border-box", color: "#111" },
  countLabel:    { fontSize: 12, color: "#888", marginLeft: "auto" },
  clearBtn:      { padding: "8px 12px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" },
  exportBtn:     { padding: "8px 12px", fontSize: 13, border: "1.5px solid #16a34a", borderRadius: 7, background: "#f0fdf4", cursor: "pointer", color: "#15803d", fontWeight: 500 },
  refreshBtn:    { padding: "8px 12px", fontSize: 16, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" },
  tableWrap:     { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" },
  table:         { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:            { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb", background: "#fafafa", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td:            { padding: "10px 12px", verticalAlign: "middle" },
  badge:         { display: "inline-block", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" },
  locChip:       { fontSize: 12, background: "#f3f4f6", color: "#374151", borderRadius: 5, padding: "2px 8px" },
  empty:         { textAlign: "center", padding: "2.5rem", color: "#aaa", fontSize: 14 },
  pager:         { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "1rem 0" },
  pgBtn:         { padding: "7px 16px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer" },
};
