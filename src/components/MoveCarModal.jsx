// src/components/MoveCarModal.jsx
import { useState } from "react";

export default function MoveCarModal({ car, locations, staffName, onConfirm, onClose, loading }) {
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <p style={styles.modalPlate}>{car.plate}</p>
            <p style={styles.modalType}>{car.type}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.modalBody}>
          <p style={styles.actionTitle}>Move Car</p>
          <div style={styles.field}>
            <label style={styles.label}>Staff</label>
            <div style={styles.readOnly}>{staffName}</div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Current Location</label>
            <div style={styles.readOnly}>{car.location || "Not set"}</div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>New Location *</label>
            {!addingLoc ? (
              <select style={styles.input} value={location} onChange={e => {
                if (e.target.value === "__new__") setAddingLoc(true);
                else setLocation(e.target.value);
              }}>
                <option value="">— Select location —</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
                <option value="__new__">+ Add new location</option>
              </select>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <input style={{ ...styles.input, flex: 1 }}
                  placeholder="New location name"
                  value={newLoc} onChange={e => setNewLoc(e.target.value)} autoFocus />
                <button style={styles.cancelSmall} onClick={() => setAddingLoc(false)}>✕</button>
              </div>
            )}
          </div>
          {err && <p style={styles.error}>{err}</p>}
          <button style={{ ...styles.confirmBtn, opacity: loading ? 0.65 : 1 }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : "Confirm Move"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:       { background: "#fff", borderRadius: 14, width: 380, maxWidth: "100%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" },
  modalHeader: { padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#1d4ed8" },
  modalPlate:  { fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 },
  modalType:   { fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" },
  closeBtn:    { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  modalBody:   { padding: "1.25rem" },
  actionTitle: { fontSize: 15, fontWeight: 600, color: "#111", marginBottom: "1rem" },
  field:       { marginBottom: "0.85rem" },
  label:       { fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 },
  input:       { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", boxSizing: "border-box" },
  readOnly:    { padding: "9px 11px", fontSize: 14, background: "#f3f4f6", borderRadius: 7, color: "#555", border: "1.5px solid #e5e7eb" },
  confirmBtn:  { width: "100%", padding: "11px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#1d4ed8", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4 },
  cancelSmall: { padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#666" },
  error:       { color: "#dc2626", fontSize: 13, margin: "6px 0" },
};
