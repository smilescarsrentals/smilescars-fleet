// src/pages/CarProfilePage.jsx
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-TZ", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-TZ", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_COLORS = {
  Available:   { bg: "#dcfce7", color: "#15803d" },
  Rented:      { bg: "#fef9c3", color: "#854d0e" },
  Reserved:    { bg: "#f5f3ff", color: "#6d28d9" },
  Maintenance: { bg: "#ffedd5", color: "#c2410c" },
};

const ACTION_COLORS = {
  "Checked Out":         { bg: "#fef9c3", color: "#854d0e" },
  "Returned":            { bg: "#dcfce7", color: "#15803d" },
  "Booking Extended":    { bg: "#e0f2fe", color: "#0369a1" },
  "Sent to Maintenance": { bg: "#ffedd5", color: "#c2410c" },
  "Marked Available":    { bg: "#dcfce7", color: "#15803d" },
  "Reserved":            { bg: "#f5f3ff", color: "#6d28d9" },
  "Reservation Activated":{ bg: "#dcfce7", color: "#15803d" },
  "Reservation Cancelled":{ bg: "#fee2e2", color: "#b91c1c" },
  "Location Updated":    { bg: "#f3f4f6", color: "#374151" },
  "Payment Updated":     { bg: "#ede9fe", color: "#6d28d9" },
  "Sold":                { bg: "#fee2e2", color: "#b91c1c" },
};

export default function CarProfilePage({ staffName, role }) {
  const canSeeFullProfile = role === "Admin" || role === "Manager";
  const { plate } = useParams();
  const navigate  = useNavigate();
  const decodedPlate = decodeURIComponent(plate);

  const [car,       setCar]       = useState(null);
  const [history,   setHistory]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [note,      setNote]      = useState("");
  const [savingNote,setSavingNote]= useState(false);
  const [noteToast, setNoteToast] = useState("");
  const [activeTab, setActiveTab] = useState("overview"); // overview | history | maintenance | notes

  const load = async () => {
    setLoading(true); setError("");
    try {
      const fleetRes = await api.getFleet();
      const found = (fleetRes.data || []).find(c =>
        c.plate.trim().toLowerCase() === decodedPlate.trim().toLowerCase()
      );
      if (!found) { setError(`Car "${decodedPlate}" not found in fleet.`); setLoading(false); return; }
      setCar(found);
      // Only load history for Admin/Manager
      if (canSeeFullProfile) {
        const histRes = await api.getHistory();
        const carHistory = (histRes.data || []).filter(h =>
          h.plate.trim().toLowerCase() === decodedPlate.trim().toLowerCase()
        );
        setHistory(carHistory);
      }
    } catch (e) {
      setError("Failed to load car profile: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [decodedPlate]);

  const stats = useMemo(() => {
    const rentals     = history.filter(h => h.action === "Checked Out");
    const maintenance = history.filter(h => h.action === "Sent to Maintenance");
    const totalRev    = {};
    rentals.forEach(h => {
      if (h.amount) {
        const c = h.currency || "TZS";
        totalRev[c] = (totalRev[c] || 0) + (Number(h.amount) || 0);
      }
    });
    const lastRental = rentals[0]; // already sorted newest first
    return { totalRentals: rentals.length, maintenance: maintenance.length, totalRev, lastRental };
  }, [history]);

  const maintenanceHistory = useMemo(() =>
    history.filter(h => h.action === "Sent to Maintenance" || h.action === "Marked Available"),
    [history]
  );

  const rentalHistory = useMemo(() =>
    history.filter(h => ["Checked Out","Returned","Booking Extended","Reserved","Reservation Activated","Reservation Cancelled"].includes(h.action)),
    [history]
  );

  const noteHistory = useMemo(() =>
    history.filter(h => h.action === "Note Added"),
    [history]
  );

  const handleSaveNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await api.addCarNote({ plate: decodedPlate, type: car?.type || "", note: note.trim(), staffName });
      setNote("");
      setNoteToast("✅ Note saved");
      setTimeout(() => setNoteToast(""), 3000);
      await load();
    } catch (e) {
      setNoteToast("❌ " + e.message);
      setTimeout(() => setNoteToast(""), 3000);
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) return <div style={styles.center}>Loading car profile…</div>;
  if (error)   return <div style={styles.center}><p style={{ color: "#dc2626" }}>{error}</p><button onClick={() => navigate("/")} style={styles.backBtn}>← Back to Fleet</button></div>;
  if (!car)    return null;

  const ss = STATUS_COLORS[car.status] || STATUS_COLORS.Available;

  // ── Staff View — stripped down card ──────────────────────
  if (!canSeeFullProfile) {
    return (
      <div>
        <button style={styles.backBtn} onClick={() => navigate("/")}>← Back to Fleet</button>
        <div style={styles.staffCard}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={styles.plateHero}>{car.plate}</div>
              <div style={styles.typeHero}>{car.type}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ ...styles.badge, background: ss.bg, color: ss.color }}>{car.status}</span>
                {car.location && <span style={styles.locChip}>📍 {car.location}</span>}
                {car.driver && <span style={styles.locChip}>🚗 {car.driver}</span>}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {car.regCardUrl
                ? <a href={car.regCardUrl} target="_blank" rel="noopener noreferrer" style={styles.docBtnLarge}>📄 Registration Card</a>
                : <span style={styles.docBtnLargeOff}>📄 No Registration Card</span>}
              {car.photosUrl
                ? <a href={car.photosUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.docBtnLarge, background: "#eff6ff", color: "#2563eb", borderColor: "#bfdbfe" }}>📷 Car Photos</a>
                : <span style={styles.docBtnLargeOff}>📷 No Photos</span>}
            </div>
          </div>

          {/* Current rental info — useful for staff */}
          {car.status === "Rented" && car.currentClient && (
            <div style={styles.staffRentalBox}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#111", marginBottom: 8 }}>Current Rental</div>
              <div style={styles.staffInfoRow}><span style={styles.staffInfoLabel}>Client</span><span>{car.currentClient}</span></div>
              {car.clientPhone && <div style={styles.staffInfoRow}><span style={styles.staffInfoLabel}>Phone</span><span>{car.clientPhone}</span></div>}
              <div style={styles.staffInfoRow}><span style={styles.staffInfoLabel}>Booked From</span><span>{fmtDate(car.bookedFrom)}</span></div>
              <div style={styles.staffInfoRow}><span style={styles.staffInfoLabel}>Return Date</span><span>{fmtDate(car.returnDate)}</span></div>
              <div style={styles.staffInfoRow}><span style={styles.staffInfoLabel}>Payment</span>
                <span style={{ fontWeight: 600, color: car.paymentStatus === "Unpaid" ? "#b91c1c" : "#15803d" }}>{car.paymentStatus || "—"}</span>
              </div>
            </div>
          )}

          {car.status === "Maintenance" && car.garage && (
            <div style={styles.staffRentalBox}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#c2410c", marginBottom: 4 }}>🔧 In Maintenance</div>
              <div style={styles.staffInfoRow}><span style={styles.staffInfoLabel}>Garage</span><span>{car.garage}</span></div>
              {car.remarks && <div style={styles.staffInfoRow}><span style={styles.staffInfoLabel}>Remarks</span><span>{car.remarks}</span></div>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Admin / Manager Full Profile ──────────────────────────
    <div>
      {/* Back button */}
      <button style={styles.backBtn} onClick={() => navigate("/")}>← Back to Fleet</button>

      {/* Hero card */}
      <div style={styles.heroCard}>
        <div style={styles.heroLeft}>
          <div style={styles.plateHero}>{car.plate}</div>
          <div style={styles.typeHero}>{car.type}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ ...styles.badge, background: ss.bg, color: ss.color }}>{car.status}</span>
            {car.location && <span style={styles.locChip}>📍 {car.location}</span>}
            {car.driver && <span style={styles.locChip}>🚗 {car.driver}</span>}
          </div>
        </div>

        {/* Quick stats */}
        <div style={styles.heroStats}>
          <div style={styles.statBox}>
            <div style={styles.statVal}>{stats.totalRentals}</div>
            <div style={styles.statLbl}>Total Rentals</div>
          </div>
          <div style={styles.statBox}>
            <div style={styles.statVal}>{stats.maintenance}</div>
            <div style={styles.statLbl}>Maintenance Trips</div>
          </div>
          <div style={styles.statBox}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>
              {Object.entries(stats.totalRev).map(([c, v]) =>
                <div key={c}>{c} {v.toLocaleString("en-US")}</div>
              )}
              {Object.keys(stats.totalRev).length === 0 && <div style={{ color: "#aaa" }}>—</div>}
            </div>
            <div style={styles.statLbl}>Total Revenue</div>
          </div>
          {stats.lastRental && (
            <div style={styles.statBox}>
              <div style={styles.statVal}>{fmtDate(stats.lastRental.bookedFrom)}</div>
              <div style={styles.statLbl}>Last Rental</div>
            </div>
          )}
        </div>

        {/* Document links */}
        <div style={styles.docLinks}>
          {car.regCardUrl ? (
            <a href={car.regCardUrl} target="_blank" rel="noopener noreferrer" style={styles.docBtn}>
              📄 Registration Card
            </a>
          ) : (
            <span style={styles.docBtnDisabled}>📄 No Reg Card</span>
          )}
          {car.photosUrl ? (
            <a href={car.photosUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.docBtn, background: "#eff6ff", color: "#2563eb", borderColor: "#bfdbfe" }}>
              📷 Car Photos
            </a>
          ) : (
            <span style={styles.docBtnDisabled}>📷 No Photos</span>
          )}
        </div>
      </div>

      {/* Current rental banner */}
      {car.status === "Rented" && car.currentClient && (
        <div style={styles.rentalBanner}>
          <div>
            <span style={{ fontWeight: 600 }}>Currently rented to: </span>
            {car.currentClient}
            {car.clientPhone && <span style={{ color: "#888", marginLeft: 8 }}>{car.clientPhone}</span>}
          </div>
          <div style={{ fontSize: 13, color: "#555" }}>
            {fmtDate(car.bookedFrom)} → {fmtDate(car.returnDate)}
            {car.paymentStatus && <span style={{ marginLeft: 12, fontWeight: 600, color: car.paymentStatus === "Unpaid" ? "#b91c1c" : "#15803d" }}>{car.paymentStatus}</span>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        {[
          { id: "overview",    label: "Overview"    },
          { id: "history",     label: `Rentals (${rentalHistory.length})`      },
          { id: "maintenance", label: `Maintenance (${maintenanceHistory.length})` },
          { id: "notes",       label: `Notes (${noteHistory.length})`          },
        ].map(t => (
          <button key={t.id} style={{ ...styles.tab, ...(activeTab === t.id ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === "overview" && (
        <div style={styles.tabContent}>
          <div style={styles.infoGrid}>
            {[
              { label: "Plate",          value: car.plate },
              { label: "Type",           value: car.type },
              { label: "Status",         value: car.status },
              { label: "Location",       value: car.location || "—" },
              { label: "Driver",         value: car.driver || "—" },
              { label: "Fuel Out",       value: car.fuelOut || "—" },
              { label: "KM Out",         value: car.kmOut ? Number(car.kmOut).toLocaleString("en-US") : "—" },
              { label: "Current Client", value: car.currentClient || "—" },
              { label: "Client Phone",   value: car.clientPhone || "—" },
              { label: "Booked From",    value: fmtDate(car.bookedFrom) },
              { label: "Return Date",    value: fmtDate(car.returnDate) },
              { label: "Payment Status", value: car.paymentStatus || "—" },
              { label: "Amount",         value: car.amount ? fmtMoney(car.amount, car.currency) : "—" },
              { label: "Garage",         value: car.garage || "—" },
              { label: "Remarks",        value: car.remarks || "—" },
            ].map(item => (
              <div key={item.label} style={styles.infoRow}>
                <div style={styles.infoLabel}>{item.label}</div>
                <div style={styles.infoValue}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rental History tab ── */}
      {activeTab === "history" && (
        <div style={styles.tabContent}>
          {rentalHistory.length === 0
            ? <p style={styles.empty}>No rental history yet.</p>
            : <div className="sc-table-wrap">
                <table style={styles.table}>
                  <thead>
                    <tr>{["Date","Action","Client","Booked From","Return Date","Amount","Payment","Driver","Staff"].map(h =>
                      <th key={h} style={styles.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rentalHistory.map((h, i) => {
                      const ac = ACTION_COLORS[h.action] || { bg: "#f3f4f6", color: "#374151" };
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td data-label="Date" style={{ ...styles.td, fontSize: 12, color: "#888" }}>{fmtDateTime(h.timestamp)}</td>
                          <td data-label="Action" style={styles.td}><span style={{ ...styles.badge, background: ac.bg, color: ac.color }}>{h.action}</span></td>
                          <td data-label="Client" style={{ ...styles.td, fontWeight: 500 }}>{h.client || "—"}</td>
                          <td data-label="Booked From" style={{ ...styles.td, fontSize: 12 }}>{fmtDate(h.bookedFrom)}</td>
                          <td data-label="Return Date" style={{ ...styles.td, fontSize: 12 }}>{fmtDate(h.returnDate)}</td>
                          <td data-label="Amount" style={{ ...styles.td, fontSize: 12 }}>{fmtMoney(h.amount, h.currency)}</td>
                          <td data-label="Payment" style={{ ...styles.td, fontSize: 12 }}>{h.paymentStatus || "—"}</td>
                          <td data-label="Driver" style={{ ...styles.td, fontSize: 12 }}>{h.driver || "—"}</td>
                          <td data-label="Staff" style={{ ...styles.td, fontSize: 12, color: "#555" }}>{h.staffName || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          }
        </div>
      )}

      {/* ── Maintenance tab ── */}
      {activeTab === "maintenance" && (
        <div style={styles.tabContent}>
          {maintenanceHistory.length === 0
            ? <p style={styles.empty}>No maintenance history yet.</p>
            : <div className="sc-table-wrap">
                <table style={styles.table}>
                  <thead>
                    <tr>{["Date","Action","Garage","Location","Remarks","Staff"].map(h =>
                      <th key={h} style={styles.th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceHistory.map((h, i) => {
                      const ac = ACTION_COLORS[h.action] || { bg: "#f3f4f6", color: "#374151" };
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td data-label="Date" style={{ ...styles.td, fontSize: 12, color: "#888" }}>{fmtDateTime(h.timestamp)}</td>
                          <td data-label="Action" style={styles.td}><span style={{ ...styles.badge, background: ac.bg, color: ac.color }}>{h.action}</span></td>
                          <td data-label="Garage" style={{ ...styles.td, color: "#c2410c", fontWeight: 500 }}>{h.garage || "—"}</td>
                          <td data-label="Location" style={styles.td}>{h.location || "—"}</td>
                          <td data-label="Remarks" style={{ ...styles.td, fontSize: 12, color: "#777" }}>{h.remarks || "—"}</td>
                          <td data-label="Staff" style={{ ...styles.td, fontSize: 12, color: "#555" }}>{h.staffName || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          }
        </div>
      )}

      {/* ── Notes tab ── */}
      {activeTab === "notes" && (
        <div style={styles.tabContent}>
          {noteToast && <div style={styles.toast}>{noteToast}</div>}

          {/* Add note */}
          <div style={styles.noteBox}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 8 }}>
              Add a note about this car
            </label>
            <textarea
              style={styles.noteInput}
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Tyres need replacing next service. AC making noise."
            />
            <button
              style={{ ...styles.saveNoteBtn, opacity: savingNote ? 0.65 : 1 }}
              onClick={handleSaveNote}
              disabled={savingNote || !note.trim()}
            >
              {savingNote ? "Saving…" : "Save Note"}
            </button>
          </div>

          {/* Existing notes */}
          {noteHistory.length === 0
            ? <p style={styles.empty}>No notes yet. Add one above.</p>
            : <div style={{ marginTop: "1.25rem" }}>
                {noteHistory.map((h, i) => (
                  <div key={i} style={styles.noteCard}>
                    <div style={styles.noteText}>{h.remarks}</div>
                    <div style={styles.noteMeta}>
                      {h.staffName} · {fmtDateTime(h.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
    </div>
  );
}

const styles = {
  staffCard:        { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "1.5rem", display: "flex", flexDirection: "column", gap: 16 },
  staffRentalBox:   { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem", marginTop: 4 },
  staffInfoRow:     { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 },
  staffInfoLabel:   { fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".3px" },
  docBtnLarge:      { display: "block", padding: "12px 20px", fontSize: 14, fontWeight: 600, background: "#f0fdf4", color: "#15803d", border: "1.5px solid #bbf7d0", borderRadius: 10, textDecoration: "none", textAlign: "center", minWidth: 200 },
  docBtnLargeOff:   { display: "block", padding: "12px 20px", fontSize: 14, background: "#f9fafb", color: "#aaa", border: "1.5px solid #e5e7eb", borderRadius: 10, textAlign: "center", minWidth: 200 },
  backBtn:      { fontSize: 13, color: "#1d4ed8", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.25rem", fontWeight: 500, display: "block" },
  heroCard:     { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "1.5rem", marginBottom: "1rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-start" },
  heroLeft:     { minWidth: 160 },
  plateHero:    { fontSize: 26, fontWeight: 800, color: "#111", letterSpacing: "-.5px" },
  typeHero:     { fontSize: 15, color: "#555", marginTop: 2 },
  badge:        { display: "inline-block", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 99 },
  locChip:      { fontSize: 12, background: "#f3f4f6", color: "#374151", borderRadius: 6, padding: "3px 10px", display: "inline-block" },
  heroStats:    { display: "flex", gap: "1rem", flex: 1, flexWrap: "wrap" },
  statBox:      { background: "#f9fafb", borderRadius: 10, padding: "12px 16px", minWidth: 100, textAlign: "center" },
  statVal:      { fontSize: 22, fontWeight: 700, color: "#111" },
  statLbl:      { fontSize: 11, color: "#888", marginTop: 2, textTransform: "uppercase", letterSpacing: ".3px" },
  docLinks:     { display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" },
  docBtn:       { display: "inline-block", padding: "10px 16px", fontSize: 13, fontWeight: 600, background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", borderRadius: 8, textDecoration: "none", textAlign: "center", whiteSpace: "nowrap" },
  docBtnDisabled:{ display: "inline-block", padding: "10px 16px", fontSize: 13, background: "#f9fafb", color: "#aaa", border: "1px solid #e5e7eb", borderRadius: 8, textAlign: "center", whiteSpace: "nowrap" },
  rentalBanner: { background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13 },
  tabs:         { display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb", marginBottom: "1.25rem", overflowX: "auto" },
  tab:          { padding: "10px 16px", fontSize: 13, fontWeight: 500, color: "#555", background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer", whiteSpace: "nowrap" },
  tabActive:    { color: "#16a34a", borderBottom: "2px solid #16a34a" },
  tabContent:   { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1.25rem" },
  infoGrid:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0" },
  infoRow:      { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f3f4f6", gap: 12 },
  infoLabel:    { fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: ".3px", flexShrink: 0 },
  infoValue:    { fontSize: 13, color: "#111", textAlign: "right" },
  table:        { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:           { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#888", borderBottom: "1px solid #e5e7eb", background: "#fafafa", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" },
  td:           { padding: "10px 12px", verticalAlign: "middle" },
  empty:        { textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 13 },
  noteBox:      { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "1rem" },
  noteInput:    { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10 },
  saveNoteBtn:  { padding: "9px 20px", fontSize: 13, fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer" },
  noteCard:     { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px", marginBottom: 8 },
  noteText:     { fontSize: 14, color: "#111", lineHeight: 1.5 },
  noteMeta:     { fontSize: 11, color: "#888", marginTop: 6 },
  toast:        { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#111", color: "#fff", padding: "10px 20px", borderRadius: 8, fontSize: 14, zIndex: 200 },
};
