// src/components/ActionModal.jsx
import { useState } from "react";

const ACTIONS = {
  checkOut:       { title: "Check Out Car",      color: "#16a34a", btnLabel: "Confirm Check Out" },
  extendBooking:  { title: "Extend Booking",     color: "#0284c7", btnLabel: "Confirm Extension" },
  markReturned:   { title: "Mark as Returned",   color: "#2563eb", btnLabel: "Confirm Return"    },
  setMaintenance: { title: "Send to Maintenance",color: "#d97706", btnLabel: "Confirm"           },
  setGarage:      { title: "Send to Garage",     color: "#7c3aed", btnLabel: "Confirm"           },
  setAvailable:   { title: "Mark as Available",  color: "#16a34a", btnLabel: "Confirm"           },
};

const FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Empty"];

export default function ActionModal({ car, action, locations, staffName, onConfirm, onClose, loading }) {
  const cfg = ACTIONS[action];
  const today = new Date().toISOString().split("T")[0];

  const [client,      setClient]      = useState(car.currentClient || "");
  const [clientPhone, setClientPhone] = useState(car.clientPhone   || "");
  const [bookedFrom,  setBookedFrom]  = useState(today);
  const [returnDate,  setReturnDate]  = useState(action === "extendBooking" ? car.returnDate : "");
  const [location,    setLocation]    = useState(car.location || "");
  const [remarks,     setRemarks]     = useState("");
  const [fuelOut,     setFuelOut]     = useState("");
  const [fuelIn,      setFuelIn]      = useState("");
  const [amount,      setAmount]      = useState("");
  const [policeFine,  setPoliceFine]  = useState("");
  const [parkingFine, setParkingFine] = useState("");
  const [newLoc,      setNewLoc]      = useState("");
  const [addingLoc,   setAddingLoc]   = useState(false);
  const [err,         setErr]         = useState("");

  const needsClient = action === "checkOut";
  const isExtend    = action === "extendBooking";
  const isReturn    = action === "markReturned";

  const handleSubmit = () => {
    setErr("");
    if (needsClient && !client.trim()) { setErr("Client name is required."); return; }
    if (needsClient && !bookedFrom)    { setErr("Booked from date is required."); return; }
    if ((needsClient || isExtend) && !returnDate) { setErr("Return date is required."); return; }
    const loc = addingLoc ? newLoc.trim() : location;
    onConfirm({ client, clientPhone, bookedFrom, returnDate, location: loc, remarks, fuelOut, fuelIn, amount, policeFine, parkingFine, newLocation: addingLoc ? loc : null });
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...styles.modalHeader, background: cfg.color }}>
          <div>
            <p style={styles.modalPlate}>{car.plate}</p>
            <p style={styles.modalType}>{car.type}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.modalBody}>
          <p style={styles.actionTitle}>{cfg.title}</p>

          {/* Staff */}
          <div style={styles.field}>
            <label style={styles.label}>Staff</label>
            <div style={styles.readOnly}>{staffName}</div>
          </div>

          {/* Client fields */}
          {needsClient && (
            <>
              <div style={styles.field}>
                <label style={styles.label}>Client Name *</label>
                <input style={styles.input} value={client}
                  onChange={e => setClient(e.target.value)} placeholder="Full name" autoFocus />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Client Phone</label>
                <input style={styles.input} value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)} placeholder="+255..." />
              </div>
              <div style={styles.twoCol}>
                <div style={styles.field}>
                  <label style={styles.label}>Booked From *</label>
                  <input style={styles.input} type="date" value={bookedFrom}
                    onChange={e => setBookedFrom(e.target.value)} />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Return Date *</label>
                  <input style={styles.input} type="date" value={returnDate}
                    onChange={e => setReturnDate(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* Extend — show current client + new date */}
          {isExtend && (
            <>
              <div style={styles.field}>
                <label style={styles.label}>Client</label>
                <div style={styles.readOnly}>{car.currentClient} {car.clientPhone ? `· ${car.clientPhone}` : ""}</div>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>New Return Date *</label>
                {car.returnDate && <p style={{ fontSize: 12, color: "#888", margin: "0 0 4px" }}>Current: {car.returnDate}</p>}
                <input style={styles.input} type="date" value={returnDate}
                  onChange={e => setReturnDate(e.target.value)} />
              </div>
            </>
          )}

          {/* Fuel Out — checkout only */}
          {needsClient && (
            <div style={styles.twoCol}>
              <div style={styles.field}>
                <label style={styles.label}>Fuel Level Out</label>
                <select style={styles.input} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Amount Charged (TZS)</label>
                <input style={styles.input} type="number" value={amount}
                  onChange={e => setAmount(e.target.value)} placeholder="e.g. 150000" />
              </div>
            </div>
          )}

          {/* Return fields */}
          {isReturn && (
            <>
              <div style={styles.twoCol}>
                <div style={styles.field}>
                  <label style={styles.label}>Fuel Level In</label>
                  <select style={styles.input} value={fuelIn} onChange={e => setFuelIn(e.target.value)}>
                    <option value="">— Select —</option>
                    {FUEL_LEVELS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Amount Charged (TZS)</label>
                  <input style={styles.input} type="number" value={amount}
                    onChange={e => setAmount(e.target.value)} placeholder="e.g. 150000" />
                </div>
              </div>
              <div style={styles.twoCol}>
                <div style={styles.field}>
                  <label style={styles.label}>Police Fine (TZS)</label>
                  <input style={styles.input} type="number" value={policeFine}
                    onChange={e => setPoliceFine(e.target.value)} placeholder="0" />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Parking Fine (TZS)</label>
                  <input style={styles.input} type="number" value={parkingFine}
                    onChange={e => setParkingFine(e.target.value)} placeholder="0" />
                </div>
              </div>
            </>
          )}

          {/* Location */}
          <div style={styles.field}>
            <label style={styles.label}>Location</label>
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

          {/* Remarks */}
          <div style={styles.field}>
            <label style={styles.label}>Remarks / Notes</label>
            <textarea style={styles.textarea} rows={2}
              value={remarks} onChange={e => setRemarks(e.target.value)}
              placeholder={
                action === "checkOut"       ? "e.g. Client heading to Mombasa" :
                action === "extendBooking"  ? "e.g. Client requested 3 more days" :
                action === "setMaintenance" ? "e.g. Engine oil leak" :
                action === "setGarage"      ? "e.g. Taken to Mwangi Garage" :
                action === "markReturned"   ? "e.g. Returned with minor scratch" :
                "Optional note"
              }
            />
          </div>

          {err && <p style={styles.error}>{err}</p>}

          <button
            style={{ ...styles.confirmBtn, background: cfg.color, opacity: loading ? 0.65 : 1 }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Saving…" : cfg.btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:       { background: "#fff", borderRadius: 14, width: 460, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" },
  modalHeader: { padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  modalPlate:  { fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 },
  modalType:   { fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" },
  closeBtn:    { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  modalBody:   { padding: "1.25rem" },
  actionTitle: { fontSize: 15, fontWeight: 600, color: "#111", marginBottom: "1rem" },
  field:       { marginBottom: "0.85rem" },
  twoCol:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  label:       { fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 },
  input:       { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", boxSizing: "border-box" },
  textarea:    { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  readOnly:    { padding: "9px 11px", fontSize: 14, background: "#f3f4f6", borderRadius: 7, color: "#555", border: "1.5px solid #e5e7eb" },
  confirmBtn:  { width: "100%", padding: "11px", fontSize: 15, fontWeight: 600, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4 },
  cancelSmall: { padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#666" },
  error:       { color: "#dc2626", fontSize: 13, margin: "6px 0" },
};
