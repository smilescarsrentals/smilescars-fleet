// src/components/ActionModal.jsx
import { useState } from "react";

const ACTIONS = {
  checkOut:       { title: "Check Out Car",       color: "#16a34a", btnLabel: "Confirm Check Out" },
  extendBooking:  { title: "Extend Booking",      color: "#0284c7", btnLabel: "Confirm Extension" },
  markReturned:   { title: "Mark as Returned",    color: "#2563eb", btnLabel: "Confirm Return"    },
  setMaintenance: { title: "Send to Maintenance", color: "#d97706", btnLabel: "Confirm"           },
  setAvailable:   { title: "Mark as Available",   color: "#16a34a", btnLabel: "Confirm"           },
  markSold:       { title: "Mark Car as Sold",    color: "#dc2626", btnLabel: "Confirm Sale"      },
};

const FUEL_LEVELS      = ["Full", "3/4", "1/2", "1/4", "Empty"];
const CURRENCIES       = ["TZS", "USD", "EUR"];
// Fix #3: Added "Long Term" to payment statuses
const PAYMENT_STATUSES = ["Paid", "Partial Paid", "Unpaid", "Long Term"];

function fmt(raw) {
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}
function unformat(val) { return String(val || "").replace(/,/g, ""); }

// Fix #4: wider fine input — removed cramped suffix box, now inline label
function MoneyInput({ value, onChange, placeholder, style }) {
  return (
    <input style={style} type="text" inputMode="numeric" value={value}
      placeholder={placeholder}
      onChange={e => onChange(fmt(e.target.value))} />
  );
}

function FineInput({ value, onChange, label }) {
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <label style={styles.label}>{label} <span style={{ color: "#aaa", fontWeight: 400 }}>(TZS)</span></label>
      <MoneyInput style={styles.input} value={value} onChange={onChange} placeholder="0" />
    </div>
  );
}

export default function ActionModal({ car, action, locations, garages, staffName, onConfirm, onClose, loading }) {
  const cfg  = ACTIONS[action];
  const today = new Date().toISOString().split("T")[0];

  const [client,        setClient]       = useState(car.currentClient || "");
  const [clientPhone,   setClientPhone]  = useState(car.clientPhone   || "");
  const [bookedFrom,    setBookedFrom]   = useState(today);
  // Fix #1: store dates as plain strings, never pass through Date() constructor
  const rawReturn = action === "extendBooking" ? (car.returnDate ? String(car.returnDate).split("T")[0] : "") : "";
  const [returnDate,    setReturnDate]   = useState(rawReturn);
  const [actualReturn,  setActualReturn] = useState(today); // Fix #2: returned date in return modal
  const [location,      setLocation]     = useState(car.location || "");
  const [remarks,       setRemarks]      = useState("");
  const [fuelOut,       setFuelOut]      = useState("");
  const [fuelIn,        setFuelIn]       = useState("");
  const [kmOut,         setKmOut]        = useState("");
  const [kmIn,          setKmIn]         = useState("");
  const [amount,        setAmount]       = useState("");
  const [currency,      setCurrency]     = useState("TZS");
  const [policeFine,    setPoliceFine]   = useState("");
  const [parkingFine,   setParkingFine]  = useState("");
  const [paymentStatus, setPaymentStatus]= useState("Unpaid");
  const [amountPaid,    setAmountPaid]   = useState("");
  const [newLoc,        setNewLoc]       = useState("");
  const [addingLoc,     setAddingLoc]    = useState(false);
  const [garage,        setGarage]       = useState("");
  const [newGarage,     setNewGarage]    = useState("");
  const [addingGarage,  setAddingGarage] = useState(false);
  const [err,           setErr]          = useState("");

  const needsClient   = action === "checkOut";
  const isExtend       = action === "extendBooking";
  const isReturn        = action === "markReturned";
  const isMaintenance    = action === "setMaintenance";
  const isAvailable       = action === "setAvailable";
  const isSold              = action === "markSold";

  const handleSubmit = () => {
    setErr("");
    if (needsClient && !client.trim()) { setErr("Client name is required."); return; }
    if (needsClient && !bookedFrom)    { setErr("Booked from date is required."); return; }
    if ((needsClient || isExtend) && !returnDate) { setErr("Return date is required."); return; }
    if (isMaintenance) {
      const g = addingGarage ? newGarage.trim() : garage;
      if (!g) { setErr("Please select or add a garage."); return; }
    }
    if (needsClient && (paymentStatus === "Paid" || paymentStatus === "Partial Paid") && !amountPaid) {
      setErr("Please enter amount paid."); return;
    }
    const loc = addingLoc ? newLoc.trim() : location;
    const gar = addingGarage ? newGarage.trim() : garage;
    onConfirm({
      client, clientPhone, bookedFrom,
      returnDate,        // scheduled return date (checkout / extend)
      actualReturn,      // Fix #2: actual date returned (return modal)
      location: loc, remarks,
      fuelOut, fuelIn, kmOut, kmIn,
      amount: unformat(amount), currency,
      policeFine: unformat(policeFine), parkingFine: unformat(parkingFine),
      paymentStatus, amountPaid: unformat(amountPaid), garage: gar,
      newLocation: addingLoc ? loc : null,
      newGarage:   addingGarage ? gar : null,
    });
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

          <div style={styles.field}>
            <label style={styles.label}>Staff</label>
            <div style={styles.readOnly}>{staffName}</div>
          </div>

          {/* ── Check Out ── */}
          {needsClient && (<>
            <div style={styles.field}>
              <label style={styles.label}>Client Name *</label>
              <input style={styles.input} value={client} onChange={e => setClient(e.target.value)} placeholder="Full name" autoFocus />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Client Phone</label>
              <input style={styles.input} value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+255..." />
            </div>
            {/* Fix #1: plain string date inputs */}
            <div style={styles.twoCol}>
              <div style={styles.field}>
                <label style={styles.label}>Booked From *</label>
                <input style={styles.input} type="date" value={bookedFrom} onChange={e => setBookedFrom(e.target.value)} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Return Date *</label>
                <input style={styles.input} type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
              </div>
            </div>
            <div style={styles.twoCol}>
              <div style={styles.field}>
                <label style={styles.label}>Amount Charged</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <MoneyInput style={{ ...styles.input, flex: 1 }} value={amount} onChange={setAmount} placeholder="e.g. 150,000" />
                  <select style={{ ...styles.input, width: 76, fontFamily: "inherit" }} value={currency} onChange={e => setCurrency(e.target.value)}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={styles.field}>
                {/* Fix #3: consistent font + Long Term added */}
                <label style={styles.label}>Payment Status</label>
                <select style={{ ...styles.input, fontFamily: "inherit" }} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                  {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
                </select>
                {(paymentStatus === "Paid" || paymentStatus === "Partial Paid") && (
                  <MoneyInput style={{ ...styles.input, marginTop: 6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
                )}
              </div>
            </div>
            <div style={styles.threeCol}>
              <div style={styles.field}>
                <label style={styles.label}>Location</label>
                {!addingLoc ? (
                  <select style={{ ...styles.input, fontFamily: "inherit" }} value={location} onChange={e => { if (e.target.value === "__new__") setAddingLoc(true); else setLocation(e.target.value); }}>
                    <option value="">— Select —</option>
                    {locations.map(l => <option key={l}>{l}</option>)}
                    <option value="__new__">+ Add new</option>
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input style={{ ...styles.input, flex: 1 }} placeholder="New location" value={newLoc} onChange={e => setNewLoc(e.target.value)} autoFocus />
                    <button style={styles.cancelSmall} onClick={() => setAddingLoc(false)}>✕</button>
                  </div>
                )}
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Fuel Out</label>
                <select style={{ ...styles.input, fontFamily: "inherit" }} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>KM Out</label>
                <input style={styles.input} type="text" inputMode="numeric" value={kmOut}
                  onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" />
              </div>
            </div>
            {/* Fix #4: fines with label suffix instead of cramped box */}
            <div style={styles.twoCol}>
              <FineInput label="Police Fine" value={policeFine} onChange={setPoliceFine} />
              <FineInput label="Parking Fine" value={parkingFine} onChange={setParkingFine} />
            </div>
          </>)}

          {/* ── Extend ── */}
          {isExtend && (<>
            <div style={styles.field}>
              <label style={styles.label}>Client</label>
              <div style={styles.readOnly}>{car.currentClient}{car.clientPhone ? ` · ${car.clientPhone}` : ""}</div>
            </div>
            <div style={styles.field}>
              {/* Fix #1: show current as plain string, input stays as string */}
              <label style={styles.label}>New Return Date *</label>
              {car.returnDate && <p style={{ fontSize: 12, color: "#888", margin: "0 0 4px" }}>Current: {String(car.returnDate).split("T")[0]}</p>}
              <input style={styles.input} type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
            </div>
          </>)}

          {/* ── Return ── */}
          {isReturn && (<>
            {/* Fix #2: Returned Date field added */}
            <div style={styles.twoCol}>
              <div style={styles.field}>
                <label style={styles.label}>Returned Date</label>
                <input style={styles.input} type="date" value={actualReturn} onChange={e => setActualReturn(e.target.value)} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>KM In</label>
                <input style={styles.input} type="text" inputMode="numeric" value={kmIn}
                  onChange={e => setKmIn(fmt(e.target.value))} placeholder="e.g. 45,300" />
              </div>
            </div>
            <div style={styles.twoCol}>
              <div style={styles.field}>
                <label style={styles.label}>Fuel In</label>
                <select style={{ ...styles.input, fontFamily: "inherit" }} value={fuelIn} onChange={e => setFuelIn(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div style={styles.field}>
                {/* Fix #3 */}
                <label style={styles.label}>Payment Status</label>
                <select style={{ ...styles.input, fontFamily: "inherit" }} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                  <option value="">— Keep ({car.paymentStatus || "Unpaid"}) —</option>
                  {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
                </select>
                {(paymentStatus === "Paid" || paymentStatus === "Partial Paid") && (
                  <MoneyInput style={{ ...styles.input, marginTop: 6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
                )}
              </div>
            </div>
            {/* Fix #4 */}
            <div style={styles.twoCol}>
              <FineInput label="Police Fine (on return)" value={policeFine} onChange={setPoliceFine} />
              <FineInput label="Parking Fine (on return)" value={parkingFine} onChange={setParkingFine} />
            </div>
          </>)}

          {/* ── Maintenance ── */}
          {isMaintenance && (
            <div style={styles.field}>
              <label style={styles.label}>Garage *</label>
              {!addingGarage ? (
                <select style={{ ...styles.input, fontFamily: "inherit" }} value={garage} onChange={e => { if (e.target.value === "__new__") setAddingGarage(true); else setGarage(e.target.value); }}>
                  <option value="">— Select garage —</option>
                  {(garages || []).map(g => <option key={g}>{g}</option>)}
                  <option value="__new__">+ Add new garage</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...styles.input, flex: 1 }} placeholder="New garage name" value={newGarage} onChange={e => setNewGarage(e.target.value)} autoFocus />
                  <button style={styles.cancelSmall} onClick={() => setAddingGarage(false)}>✕</button>
                </div>
              )}
            </div>
          )}

          {/* ── Mark Available — Fix #6: KM Out added ── */}
          {isAvailable && (
            <div style={styles.field}>
              <label style={styles.label}>KM Out (from garage)</label>
              <input style={styles.input} type="text" inputMode="numeric" value={kmOut}
                onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" />
            </div>
          )}

          {/* ── Sold ── */}
          {isSold && (
            <div style={styles.field}>
              <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
                This will remove {car.plate} from the active fleet and record it in the Sold Cars tab.
              </p>
            </div>
          )}

          {/* Location — non-checkout, non-sold actions */}
          {!isSold && !needsClient && (
            <div style={styles.field}>
              <label style={styles.label}>Location</label>
              {!addingLoc ? (
                <select style={{ ...styles.input, fontFamily: "inherit" }} value={location} onChange={e => { if (e.target.value === "__new__") setAddingLoc(true); else setLocation(e.target.value); }}>
                  <option value="">— Select location —</option>
                  {locations.map(l => <option key={l}>{l}</option>)}
                  <option value="__new__">+ Add new location</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...styles.input, flex: 1 }} placeholder="New location" value={newLoc} onChange={e => setNewLoc(e.target.value)} autoFocus />
                  <button style={styles.cancelSmall} onClick={() => setAddingLoc(false)}>✕</button>
                </div>
              )}
            </div>
          )}

          {/* Remarks */}
          <div style={styles.field}>
            <label style={styles.label}>Remarks / Notes</label>
            <textarea style={styles.textarea} rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
              placeholder={
                action === "checkOut"       ? "e.g. Client heading to Mombasa" :
                action === "extendBooking"  ? "e.g. Client requested 3 more days" :
                action === "setMaintenance" ? "e.g. Engine oil leak, brake service" :
                action === "markReturned"   ? "e.g. Returned with minor scratch" :
                action === "setAvailable"   ? "e.g. Repaired, ready for hire" :
                action === "markSold"       ? "e.g. Sold with full service history" :
                "Optional note"
              }
            />
          </div>

          {err && <p style={styles.error}>{err}</p>}

          <button style={{ ...styles.confirmBtn, background: cfg.color, opacity: loading ? 0.65 : 1 }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : cfg.btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:       { background: "#fff", borderRadius: 14, width: 500, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" },
  modalHeader: { padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  modalPlate:  { fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 },
  modalType:   { fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" },
  closeBtn:    { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  modalBody:   { padding: "1.25rem" },
  actionTitle: { fontSize: 15, fontWeight: 600, color: "#111", marginBottom: "1rem" },
  field:       { marginBottom: "0.85rem" },
  twoCol:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  threeCol:    { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  label:       { fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4, fontFamily: "inherit" },
  input:       { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", boxSizing: "border-box", fontFamily: "inherit" },
  textarea:    { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  readOnly:    { padding: "9px 11px", fontSize: 14, background: "#f3f4f6", borderRadius: 7, color: "#555", border: "1.5px solid #e5e7eb" },
  confirmBtn:  { width: "100%", padding: "11px", fontSize: 15, fontWeight: 600, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4, fontFamily: "inherit" },
  cancelSmall: { padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#666" },
  error:       { color: "#dc2626", fontSize: 13, margin: "6px 0" },
};
