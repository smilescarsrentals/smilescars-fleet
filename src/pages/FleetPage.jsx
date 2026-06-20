// src/pages/FleetPage.jsx
import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import ActionModal from "../components/ActionModal";

function fmtDate(val) {
  if (!val) return "—";
  const datePart = String(val).split("T")[0];
  if (!datePart || datePart.length < 10) return val;
  const [yyyy, mm, dd] = datePart.split("-");
  return `${dd}-${mm}-${yyyy}`;
}

const STATUS_STYLES = {
  Available:   { bg: "#dcfce7", color: "#15803d" },
  Rented:      { bg: "#fef9c3", color: "#854d0e" },
  Maintenance: { bg: "#ffedd5", color: "#c2410c" },
};

export default function FleetPage({ staffName }) {
  const [fleet,     setFleet]     = useState([]);
  const [config,    setConfig]    = useState({ staff: [], locations: [], garages: [] });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [search,    setSearch]    = useState("");
  const [fStatus,   setFStatus]   = useState("");
  const [fLocation, setFLocation] = useState("");
  const [fType,     setFType]     = useState("");
  const [modal,     setModal]     = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState("");
  const [page,      setPage]      = useState(1);
  const PER_PAGE = 25;

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [f, c] = await Promise.all([api.getFleet(), api.getConfig()]);
      setFleet(f.data || []);
      setConfig(c);
    } catch (e) {
      setError("Failed to load fleet: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const handleConfirm = async (fields) => {
    if (!modal) return;
    setSaving(true);
    try {
      const { car, action } = modal;
      const payload = { plate: car.plate, type: car.type, staffName, ...fields };
      if (action === "checkOut")       await api.checkOut(payload);
      if (action === "markReturned")   await api.markReturned(payload);
      if (action === "extendBooking")  await api.extendBooking(payload);
      if (action === "setMaintenance") await api.setMaintenance(payload);
      if (action === "setAvailable")   await api.setAvailable(payload);
      if (fields.newLocation) await api.addLocation(fields.newLocation);
      if (fields.newGarage)   await api.addGarage(fields.newGarage);
      setModal(null);
      showToast("✅ Saved successfully");
      await load();
    } catch (e) {
      showToast("❌ Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(() => ({
    available:   fleet.filter(c => c.status === "Available").length,
    rented:      fleet.filter(c => c.status === "Rented").length,
    maintenance: fleet.filter(c => c.status === "Maintenance").length,
  }), [fleet]);

  const types     = useMemo(() => [...new Set(fleet.map(c => c.type))].sort(), [fleet]);
  const locations = useMemo(() => [...new Set(fleet.map(c => c.location).filter(Boolean))].sort(), [fleet]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return fleet.filter(c =>
      (!q || c.plate.toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || (c.currentClient||"").toLowerCase().includes(q)) &&
      (!fStatus   || c.status   === fStatus) &&
      (!fLocation || c.location === fLocation) &&
      (!fType     || c.type     === fType)
    );
  }, [fleet, search, fStatus, fLocation, fType]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  if (loading) return <div style={styles.center}>Loading fleet…</div>;
  if (error)   return <div style={styles.center}><p style={{ color: "#dc2626" }}>{error}</p><button onClick={load} style={styles.retryBtn}>Retry</button></div>;

  return (
    <div>
      {toast && <div style={styles.toast}>{toast}</div>}

      {/* Stats — now 3 cards */}
      <div style={styles.statsRow}>
        {[
          { label: "Available",   value: stats.available,   color: "#15803d", bg: "#dcfce7" },
          { label: "Rented",      value: stats.rented,      color: "#854d0e", bg: "#fef9c3" },
          { label: "Maintenance", value: stats.maintenance, color: "#c2410c", bg: "#ffedd5" },
        ].map(s => (
          <div key={s.label} style={{ ...styles.statCard, background: s.bg }}
            onClick={() => { setFStatus(fStatus === s.label ? "" : s.label); setPage(1); }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: s.color, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={styles.filterRow}>
        <input style={styles.search} placeholder="Search plate, type or client…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select style={styles.sel} value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {["Available","Rented","Maintenance"].map(s => <option key={s}>{s}</option>)}
        </select>
        <select style={styles.sel} value={fLocation} onChange={e => { setFLocation(e.target.value); setPage(1); }}>
          <option value="">All locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <select style={styles.sel} value={fType} onChange={e => { setFType(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        {(search || fStatus || fLocation || fType) &&
          <button style={styles.clearBtn} onClick={() => { setSearch(""); setFStatus(""); setFLocation(""); setFType(""); setPage(1); }}>Clear</button>}
        <span style={styles.countLabel}>{filtered.length} of {fleet.length}</span>
        <button style={styles.refreshBtn} onClick={load}>↻</button>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>{["Plate","Type","Location","Status","Client","Return Date","Remarks","Action"].map(h =>
              <th key={h} style={styles.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && <tr><td colSpan={8} style={styles.empty}>No vehicles match your filters.</td></tr>}
            {paginated.map(car => {
              const ss = STATUS_STYLES[car.status] || STATUS_STYLES.Available;
              return (
                <tr key={car.plate}>
                  <td style={{ ...styles.td, fontWeight: 600, fontSize: 13 }}>{car.plate}</td>
                  <td style={styles.td}>{car.type}</td>
                  <td style={styles.td}>
                    {car.location ? <span style={styles.locChip}>{car.location}</span> : <span style={styles.dim}>—</span>}
                  </td>
                  <td style={styles.td}>
                    <div><span style={{ ...styles.badge, background: ss.bg, color: ss.color }}>{car.status}</span>
                    {car.status === "Maintenance" && car.garage &&
                      <div style={{ fontSize: 11, color: "#c2410c", marginTop: 3, fontWeight: 500 }}>🔧 {car.garage}</div>}
                    </div>
                  </td>
                  <td style={styles.td}>
                    {car.currentClient
                      ? <div><div style={{ fontWeight: 500, fontSize: 13 }}>{car.currentClient}</div>
                          {car.clientPhone && <div style={{ fontSize: 12, color: "#888" }}>{car.clientPhone}</div>}</div>
                      : <span style={styles.dim}>—</span>}
                  </td>
                  <td style={{ ...styles.td, fontSize: 13, color: "#555" }}>{fmtDate(car.returnDate)}</td>
                  <td style={{ ...styles.td, fontSize: 12, color: "#777", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={car.remarks}>{car.remarks || "—"}</td>
                  <td style={styles.td}><ActionButtons car={car} onAction={(c,a) => setModal({car:c,action:a})} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={styles.pager}>
          <button style={styles.pgBtn} onClick={() => setPage(p => p-1)} disabled={page===1}>‹ Prev</button>
          <span style={{ fontSize: 13, color: "#555" }}>Page {page} of {totalPages}</span>
          <button style={styles.pgBtn} onClick={() => setPage(p => p+1)} disabled={page===totalPages}>Next ›</button>
        </div>
      )}

      {modal && (
        <ActionModal
          car={modal.car}
          action={modal.action}
          locations={config.locations}
          garages={config.garages}
          staffName={staffName}
          onConfirm={handleConfirm}
          onClose={() => !saving && setModal(null)}
          loading={saving}
        />
      )}
    </div>
  );
}

function ActionButtons({ car, onAction }) {
  const btn = (label, action, color, bg) => (
    <button key={action}
      style={{ fontSize: 11, padding: "4px 9px", borderRadius: 6, border: `1px solid ${color}`,
               background: bg, color, cursor: "pointer", marginRight: 4, marginBottom: 4, fontWeight: 500 }}
      onClick={() => onAction(car, action)}>
      {label}
    </button>
  );
  if (car.status === "Available") return (
    <div>
      {btn("Check Out",   "checkOut",       "#15803d", "#dcfce7")}
      {btn("Maintenance", "setMaintenance", "#c2410c", "#fff7ed")}
    </div>
  );
  if (car.status === "Rented") return (
    <div>
      {btn("Returned",       "markReturned",  "#2563eb", "#eff6ff")}
      {btn("Extend Booking", "extendBooking", "#0284c7", "#e0f2fe")}
    </div>
  );
  if (car.status === "Maintenance") return btn("Mark Available", "setAvailable", "#15803d", "#dcfce7");
  return null;
}

const styles = {
  center:     { textAlign: "center", padding: "3rem", color: "#666" },
  retryBtn:   { marginTop: 12, padding: "8px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" },
  toast:      { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 14, zIndex: 200, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" },
  statsRow:   { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "1.25rem" },
  statCard:   { borderRadius: 10, padding: "16px", textAlign: "center", cursor: "pointer" },
  filterRow:  { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "1rem" },
  search:     { padding: "8px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", width: 220 },
  sel:        { padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111" },
  clearBtn:   { padding: "8px 12px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" },
  countLabel: { fontSize: 12, color: "#888", marginLeft: "auto" },
  refreshBtn: { padding: "8px 12px", fontSize: 16, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#555" },
  tableWrap:  { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" },
  table:      { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:         { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb", background: "#fafafa", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td:         { padding: "11px 12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
  badge:      { display: "inline-block", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 99 },
  locChip:    { fontSize: 12, color: "#374151", background: "#f3f4f6", borderRadius: 5, padding: "2px 8px" },
  dim:        { color: "#ccc", fontSize: 13 },
  empty:      { textAlign: "center", padding: "2.5rem", color: "#aaa", fontSize: 14 },
  pager:      { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "1rem 0" },
  pgBtn:      { padding: "7px 16px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer" },
};
