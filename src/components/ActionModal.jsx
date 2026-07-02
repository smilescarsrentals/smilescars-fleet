import { useState } from "react";

const ACTIONS = {
  checkOut:       { title: "Check Out Car",      color: "#16a34a", btnLabel: "Confirm Check Out"   },
  extendBooking:  { title: "Extend Booking",      color: "#0284c7", btnLabel: "Confirm Extension"   },
  markReturned:   { title: "Mark as Returned",    color: "#2563eb", btnLabel: "Confirm Return"      },
  setMaintenance: { title: "Send to Maintenance", color: "#d97706", btnLabel: "Confirm"             },
  setAvailable:   { title: "Mark as Available",   color: "#16a34a", btnLabel: "Confirm"             },
  setStaffUse:    { title: "Assign to Staff",     color: "#2563eb", btnLabel: "Confirm Assignment"  },
  markSold:       { title: "Mark Car as Sold",    color: "#dc2626", btnLabel: "Confirm Sale"        },
};

const FUEL_LEVELS      = ["Full", "3/4", "1/2", "1/4", "Empty"];
const CURRENCIES       = ["TZS", "USD", "EUR"];
const PAYMENT_STATUSES = ["Paid", "Partial Paid", "Unpaid", "Long Term"];

function fmt(raw) {
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}
function unformat(val) { return String(val || "").replace(/,/g, ""); }

function MoneyInput({ value, onChange, placeholder, style }) {
  return <input style={style} type="text" inputMode="numeric" value={value}
    placeholder={placeholder} onChange={e => onChange(fmt(e.target.value))} />;
}

function FineInput({ value, onChange, label }) {
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <label style={S.label}>{label} <span style={{ color: "#aaa", fontWeight: 400 }}>(TZS)</span></label>
      <MoneyInput style={S.input} value={value} onChange={onChange} placeholder="0" />
    </div>
  );
}

export default function ActionModal({ car, action, locations, garages, drivers, staff, staffName, role, onConfirm, onClose, loading }) {
  const cfg        = ACTIONS[action];
  const today      = new Date().toISOString().split("T")[0];
  const canAddLocGarage = role === "Admin" || role === "Manager";

  const [client,        setClient]       = useState(car.currentClient || "");
  const [clientPhone,   setClientPhone]  = useState(car.clientPhone   || "");
  const [bookedFrom,    setBookedFrom]   = useState(today);
  const rawReturn = action === "extendBooking" ? (car.returnDate ? String(car.returnDate).split("T")[0] : "") : "";
  const [returnDate,    setReturnDate]   = useState(rawReturn);
  const [actualReturn,  setActualReturn] = useState(today);
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
  const [driver,        setDriver]       = useState(car.driver || "");
  const [newDriver,     setNewDriver]    = useState("");
  const [addingDriver,  setAddingDriver] = useState(false);
  const [newLoc,        setNewLoc]       = useState("");
  const [addingLoc,     setAddingLoc]    = useState(false);
  const [garage,        setGarage]       = useState("");
  const [newGarage,     setNewGarage]    = useState("");
  const [addingGarage,  setAddingGarage] = useState(false);
  const [err,           setErr]          = useState("");
  const [assignedTo,    setAssignedTo]   = useState("");
  const [assignedQuery, setAssignedQuery]= useState("");
  const [assignedOpen,  setAssignedOpen] = useState(false);
  const filteredStaff = assignedQuery.trim()
    ? (staff || []).filter(s => s.toLowerCase().includes(assignedQuery.toLowerCase()))
    : (staff || []);

  const needsClient   = action === "checkOut";
  const isExtend      = action === "extendBooking";
  const isReturn      = action === "markReturned";
  const isMaintenance = action === "setMaintenance";
  const isAvailable   = action === "setAvailable";
  const isSold        = action === "markSold";
  const isStaffUse    = action === "setStaffUse";

  const handleSubmit = () => {
    setErr("");
    if (needsClient && !client.trim()) { setErr("Client name is required."); return; }
    if (needsClient && !bookedFrom)    { setErr("Booked from date is required."); return; }
    if ((needsClient || isExtend) && !returnDate) { setErr("Return date is required."); return; }
    if (isMaintenance && !addingGarage && !garage) { setErr("Please select or add a garage."); return; }
    if (needsClient && paymentStatus === "Partial Paid" && !amountPaid) { setErr("Please enter amount paid."); return; }
    if (isStaffUse && !assignedTo) { setErr("Please select a staff member to assign."); return; }
    const loc = addingLoc    ? newLoc.trim()    : location;
    const gar = addingGarage ? newGarage.trim() : garage;
    const drv = addingDriver ? newDriver.trim() : driver;
    onConfirm({
      client, clientPhone, bookedFrom, returnDate, actualReturn,
      location: loc, remarks, fuelOut, fuelIn, kmOut, kmIn,
      amount: unformat(amount), currency,
      policeFine: unformat(policeFine), parkingFine: unformat(parkingFine),
      paymentStatus, amountPaid: unformat(amountPaid),
      garage: gar, driver: drv, assignedTo,
      newLocation: addingLoc    ? loc : null,
      newGarage:   addingGarage ? gar : null,
      newDriver:   addingDriver ? drv : null,
    });
  };

  const selStyle = { ...S.input, fontFamily: "inherit" };

  const LocationPicker = ({ label = "Location" }) => (
    <div style={S.field}><label style={S.label}>{label}</label>
      {!addingLoc ? (
        <select style={selStyle} value={location} onChange={e => {
          if (e.target.value === "__new__") setAddingLoc(true); else setLocation(e.target.value);
        }}>
          <option value="">— Select —</option>
          {locations.map(l => <option key={l}>{l}</option>)}
          {canAddLocGarage && <option value="__new__">+ Add new location</option>}
        </select>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="New location name" value={newLoc}
            onChange={e => setNewLoc(e.target.value)} autoFocus />
          <button style={S.cancelSmall} onClick={() => setAddingLoc(false)}>✕</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={S.overlay} className="sc-overlay" onClick={onClose}>
      <div style={S.modal} className="sc-modal" onClick={e => e.stopPropagation()}>
        <div style={{ ...S.modalHeader, background: cfg.color }}>
          <div><p style={S.modalPlate}>{car.plate}</p><p style={S.modalType}>{car.type}</p></div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.modalBody}>
          <p style={S.actionTitle}>{cfg.title}</p>
          <div style={S.field}><label style={S.label}>Staff</label><div style={S.readOnly}>{staffName}</div></div>

          {needsClient && (<>
            <div style={S.field}><label style={S.label}>Client Name *</label>
              <input style={S.input} value={client} onChange={e => setClient(e.target.value)} placeholder="Full name" autoFocus /></div>
            <div style={S.field}><label style={S.label}>Client Phone</label>
              <input style={S.input} value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+255..." /></div>
            <div style={S.twoCol}>
              <div style={S.field}><label style={S.label}>Booked From *</label>
                <input style={S.input} type="date" value={bookedFrom} onChange={e => setBookedFrom(e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Return Date *</label>
                <input style={S.input} type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} /></div>
            </div>
            <div style={S.twoCol}>
              <div style={S.field}><label style={S.label}>Amount Charged</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <MoneyInput style={{ ...S.input, flex: 1 }} value={amount} onChange={setAmount} placeholder="e.g. 150,000" />
                  <select style={{ ...selStyle, width: 76 }} value={currency} onChange={e => setCurrency(e.target.value)}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={S.field}><label style={S.label}>Payment Status</label>
                <select style={selStyle} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                  {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
                </select>
                {paymentStatus === "Partial Paid" && (
                  <MoneyInput style={{ ...S.input, marginTop: 6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
                )}
              </div>
            </div>
            <div style={S.field}><label style={S.label}>Driver (optional)</label>
              {!addingDriver ? (
                <select style={selStyle} value={driver} onChange={e => { if (e.target.value === "__new__") setAddingDriver(true); else setDriver(e.target.value); }}>
                  <option value="">— No driver assigned —</option>
                  {(drivers || []).length > 0 && <optgroup label="Drivers">{(drivers || []).map(d => <option key={d} value={d}>{d}</option>)}</optgroup>}
                  <option value="__new__">+ Add new driver</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...S.input, flex: 1 }} placeholder="Driver full name" value={newDriver} onChange={e => setNewDriver(e.target.value)} autoFocus />
                  <button style={S.cancelSmall} onClick={() => setAddingDriver(false)}>✕</button>
                </div>
              )}
            </div>
            <div style={S.threeCol}>
              <LocationPicker label="Location" />
              <div style={S.field}><label style={S.label}>Fuel Out</label>
                <select style={selStyle} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div style={S.field}><label style={S.label}>KM Out</label>
                <input style={S.input} type="text" inputMode="numeric" value={kmOut} onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" />
              </div>
            </div>
            <div style={S.twoCol}>
              <FineInput label="Police Fine"  value={policeFine}  onChange={setPoliceFine}  />
              <FineInput label="Parking Fine" value={parkingFine} onChange={setParkingFine} />
            </div>
          </>)}

          {isExtend && (<>
            <div style={S.field}><label style={S.label}>Client</label>
              <div style={S.readOnly}>{car.currentClient}{car.clientPhone ? ` · ${car.clientPhone}` : ""}</div></div>
            <div style={S.field}><label style={S.label}>New Return Date *</label>
              {car.returnDate && <p style={{ fontSize: 12, color: "#888", margin: "0 0 4px" }}>Current: {String(car.returnDate).split("T")[0]}</p>}
              <input style={S.input} type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} /></div>
          </>)}

          {isReturn && (<>
            <div style={S.twoCol}>
              <div style={S.field}><label style={S.label}>Returned Date</label>
                <input style={S.input} type="date" value={actualReturn} onChange={e => setActualReturn(e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>KM In</label>
                <input style={S.input} type="text" inputMode="numeric" value={kmIn} onChange={e => setKmIn(fmt(e.target.value))} placeholder="e.g. 45,300" /></div>
            </div>
            <div style={S.twoCol}>
              <div style={S.field}><label style={S.label}>Fuel In</label>
                <select style={selStyle} value={fuelIn} onChange={e => setFuelIn(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div style={S.field}><label style={S.label}>Payment Status</label>
                <select style={selStyle} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                  <option value="">— Keep ({car.paymentStatus || "Unpaid"}) —</option>
                  {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
                </select>
                {paymentStatus === "Partial Paid" && (
                  <MoneyInput style={{ ...S.input, marginTop: 6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
                )}
              </div>
            </div>
            <div style={S.twoCol}>
              <FineInput label="Police Fine (on return)"  value={policeFine}  onChange={setPoliceFine}  />
              <FineInput label="Parking Fine (on return)" value={parkingFine} onChange={setParkingFine} />
            </div>
          </>)}

          {isMaintenance && (
            <div style={S.field}><label style={S.label}>Garage *</label>
              {!addingGarage ? (
                <select style={selStyle} value={garage} onChange={e => { if (e.target.value === "__new__") setAddingGarage(true); else setGarage(e.target.value); }}>
                  <option value="">— Select garage —</option>
                  {(garages || []).map(g => <option key={g}>{g}</option>)}
                  {canAddLocGarage && <option value="__new__">+ Add new garage</option>}
                </select>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ ...S.input, flex: 1 }} placeholder="New garage name" value={newGarage} onChange={e => setNewGarage(e.target.value)} autoFocus />
                  <button style={S.cancelSmall} onClick={() => setAddingGarage(false)}>✕</button>
                </div>
              )}
            </div>
          )}

          {isAvailable && (
            <div style={S.field}><label style={S.label}>KM Out (from garage)</label>
              <input style={S.input} type="text" inputMode="numeric" value={kmOut} onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" /></div>
          )}

          {isStaffUse && (<>
            <div style={S.field}>
              <label style={S.label}>Assigned To *</label>
              <div style={{ position: "relative" }}>
                <input style={{ ...S.input, paddingRight: assignedTo ? 32 : 14 }}
                  placeholder="Type staff name…" value={assignedQuery} autoComplete="off"
                  onChange={e => { setAssignedQuery(e.target.value); setAssignedTo(""); setAssignedOpen(true); }}
                  onFocus={() => setAssignedOpen(true)}
                  onBlur={() => setTimeout(() => setAssignedOpen(false), 150)} />
                {assignedTo && <span style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#16a34a",fontWeight:700 }}>✓</span>}
                {assignedOpen && filteredStaff.length > 0 && (
                  <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:8,boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:50,maxHeight:180,overflowY:"auto" }}>
                    {filteredStaff.map(s => (
                      <div key={s} style={{ padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #f3f4f6",color:"#111" }}
                        onMouseDown={() => { setAssignedTo(s); setAssignedQuery(s); setAssignedOpen(false); }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={S.twoCol}>
              <LocationPicker label="Location" />
              <div style={S.field}><label style={S.label}>Fuel Out</label>
                <select style={selStyle} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div style={S.field}><label style={S.label}>KM Out</label>
              <input style={S.input} type="text" inputMode="numeric" value={kmOut} onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" />
            </div>
          </>)}

          {isSold && (
            <div style={S.field}><p style={{ fontSize: 13, color: "#888", margin: 0 }}>
              This will remove {car.plate} from the active fleet and record it in the Sold Cars tab.</p></div>
          )}

          {!isSold && !needsClient && !isStaffUse && <LocationPicker label="Location" />}

          <div style={S.field}><label style={S.label}>Remarks / Notes</label>
            <textarea style={S.textarea} rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
              placeholder={
                action === "checkOut" ? "e.g. Client heading to Mombasa" :
                action === "extendBooking" ? "e.g. Client requested 3 more days" :
                action === "setMaintenance" ? "e.g. Engine oil leak, brake service" :
                action === "markReturned" ? "e.g. Returned with minor scratch" :
                action === "setAvailable" ? "e.g. Repaired, ready for hire" :
                action === "markSold" ? "e.g. Sold with full service history" :
                action === "setStaffUse" ? "e.g. Going to Arusha for company errand" : "Optional note"
              } />
          </div>

          {err && <p style={S.error}>{err}</p>}
          <button style={{ ...S.confirmBtn, background: cfg.color, opacity: loading ? 0.65 : 1 }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : cfg.btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:    { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:      { background: "#fff", borderRadius: 14, width: 500, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" },
  modalHeader:{ padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  modalPlate: { fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 },
  modalType:  { fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "2px 0 0" },
  closeBtn:   { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  modalBody:  { padding: "1.25rem" },
  actionTitle:{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: "1rem" },
  field:      { marginBottom: "0.85rem" },
  twoCol:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  threeCol:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  label:      { fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 },
  input:      { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", boxSizing: "border-box", fontFamily: "inherit" },
  textarea:   { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  readOnly:   { padding: "9px 11px", fontSize: 14, background: "#f3f4f6", borderRadius: 7, color: "#555", border: "1.5px solid #e5e7eb" },
  confirmBtn: { width: "100%", padding: "11px", fontSize: 15, fontWeight: 600, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4, fontFamily: "inherit" },
  cancelSmall:{ padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", color: "#666" },
  error:      { color: "#dc2626", fontSize: 13, margin: "6px 0" },
};
