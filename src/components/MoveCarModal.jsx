import { useState } from "react";

export default function MoveCarModal({ car, locations, staffName, role, onConfirm, onClose, loading }) {
  const canAddLoc = role === "Admin" || role === "Manager";
  const [location,  setLocation]  = useState(car.location || "");
  const [newLoc,    setNewLoc]    = useState("");
  const [addingLoc, setAddingLoc] = useState(false);
  const [err,       setErr]       = useState("");

  const handleSubmit = () => {
    const loc = addingLoc ? newLoc.trim() : location;
    if (!loc) { setErr("Please select or enter a location."); return; }
    onConfirm({ location: loc, newLocation: addingLoc ? loc : null });
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div><p style={S.plate}>{car.plate}</p><p style={S.type}>{car.type}</p></div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <p style={S.actionTitle}>Move Car</p>
          <div style={S.field}><label style={S.label}>Staff</label><div style={S.readOnly}>{staffName}</div></div>
          <div style={S.field}><label style={S.label}>Current Location</label><div style={S.readOnly}>{car.location || "Not set"}</div></div>
          <div style={S.field}>
            <label style={S.label}>New Location *</label>
            {!addingLoc ? (
              <select style={S.input} value={location} onChange={e => {
                if (e.target.value === "__new__") setAddingLoc(true); else setLocation(e.target.value);
              }}>
                <option value="">— Select location —</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
                {canAddLoc && <option value="__new__">+ Add new location</option>}
              </select>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="New location name"
                  value={newLoc} onChange={e => setNewLoc(e.target.value)} autoFocus />
                <button style={S.cancelSmall} onClick={() => setAddingLoc(false)}>✕</button>
              </div>
            )}
          </div>
          {err && <p style={S.error}>{err}</p>}
          <button style={{ ...S.confirmBtn, opacity: loading ? 0.65 : 1 }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : "Confirm Move"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:    { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:      { background: "#fff", borderRadius: 14, width: 380, maxWidth: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" },
  header:     { padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#1d4ed8" },
  plate:      { fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 },
  type:       { fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" },
  closeBtn:   { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  body:       { padding: "1.25rem" },
  actionTitle:{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: "1rem" },
  field:      { marginBottom: "0.85rem" },
  label:      { fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 },
  input:      { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", boxSizing: "border-box", fontFamily: "inherit" },
  readOnly:   { padding: "9px 11px", fontSize: 14, background: "#f3f4f6", borderRadius: 7, color: "#555", border: "1.5px solid #e5e7eb" },
  confirmBtn: { width: "100%", padding: "11px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#1d4ed8", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4 },
  cancelSmall:{ padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#666" },
  error:      { color: "#dc2626", fontSize: 13, margin: "6px 0" },
};
