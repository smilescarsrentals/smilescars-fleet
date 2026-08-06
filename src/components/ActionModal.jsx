import { useState, useEffect } from "react";
import { toTitleCase } from "../lib/textFormat";
import { api } from "../lib/api";

const ACTIONS = {
  checkOut:       { title: "Check Out Car",      color: "#16a34a", btnLabel: "Confirm Check Out"  },
  extendBooking:  { title: "Extend Booking",      color: "#0284c7", btnLabel: "Confirm Extension"  },
  markReturned:   { title: "Mark as Returned",    color: "#2563eb", btnLabel: "Confirm Return"     },
  setMaintenance: { title: "Send to Maintenance", color: "#d97706", btnLabel: "Confirm"            },
  sendRentedToMaintenance: { title: "Send for Quick Service", color: "#d97706", btnLabel: "Confirm" },
  setAvailable:   { title: "Mark as Available",   color: "#16a34a", btnLabel: "Confirm"            },
  setStaffUse:    { title: "Assign to Staff",     color: "#2563eb", btnLabel: "Confirm Assignment" },
  markSold:       { title: "Mark Car as Sold",    color: "#dc2626", btnLabel: "Confirm Sale"       },
};

export const FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Empty"];
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

// Replaces the old free-text garage list. Internal = your own garage;
// External = a real Vendor (Service Provider or Both), searched type-ahead
// rather than picked from a giant dropdown. No "add new" escape hatch here
// on purpose — vendors are managed in Garage -> Vendors now, so this stays
// a single source of truth instead of drifting back into free text.
export function GarageLocationPicker({ serviceLocationType, internalLocation, externalVendorId, externalVendorLocation, onChange }) {
  const [vendors, setVendors] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getVendors().then(res => {
      const all = res?.data || [];
      setVendors(all.filter(v => v.active && (v.vendorType === "Service Provider" || v.vendorType === "Both")));
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const selectedVendor = vendors.find(v => v.id === externalVendorId);
  const filtered = query.trim().length > 0
    ? vendors.filter(v => v.name.toLowerCase().includes(query.toLowerCase()))
    : vendors;

  const isExternal = serviceLocationType === "External";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {[["Internal", "Our Garage"], ["External", "Outside Garage"]].map(([val, lab]) => (
          <button key={val} type="button"
            onClick={() => onChange({ serviceLocationType: val, internalLocation: val === "Internal" ? (internalLocation || "SmilesCars Garage") : "", externalVendorId: "", externalVendorLocation: "" })}
            style={{ flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
              border: `1.5px solid ${serviceLocationType === val ? "var(--sc-blue)" : "#e5e7eb"}`,
              background: serviceLocationType === val ? "var(--blue-bg)" : "#fff",
              color: serviceLocationType === val ? "var(--sc-blue)" : "#666" }}>
            {lab}
          </button>
        ))}
      </div>

      {isExternal ? (
        <div>
          <div style={{ position: "relative" }}>
            <input style={{ width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, boxSizing: "border-box", fontFamily: "inherit", background: selectedVendor ? "var(--blue-bg)" : "#fff" }}
              placeholder="Type to search suppliers…" autoComplete="off"
              value={selectedVendor ? selectedVendor.name : query}
              onChange={e => { setQuery(e.target.value); onChange({ serviceLocationType, internalLocation, externalVendorId: "", externalVendorLocation: "" }); setOpen(true); }}
              onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
            {open && filtered.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 50, maxHeight: 180, overflowY: "auto" }}>
                {filtered.slice(0, 20).map(v => (
                  <div key={v.id} style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}
                    onMouseDown={() => { onChange({ serviceLocationType, internalLocation, externalVendorId: v.id, externalVendorLocation: "" }); setQuery(""); setOpen(false); }}>
                    {v.name}
                  </div>
                ))}
              </div>
            )}
            {loaded && vendors.length === 0 && (
              <p style={{ fontSize: 11.5, color: "#999", margin: "6px 0 0" }}>
                No suppliers set up yet — add one under Garage → Supplier (set type to Service Provider).
              </p>
            )}
          </div>

          {selectedVendor && selectedVendor.locationList && selectedVendor.locationList.length > 0 && (
            <select style={{ width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, boxSizing: "border-box", fontFamily: "inherit", marginTop: 6 }}
              value={externalVendorLocation || ""} onChange={e => onChange({ serviceLocationType, internalLocation, externalVendorId, externalVendorLocation: e.target.value })}>
              <option value="">Select {selectedVendor.name}'s location…</option>
              {selectedVendor.locationList.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          )}
        </div>
      ) : (
        <select style={{ width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, boxSizing: "border-box", fontFamily: "inherit" }}
          value={internalLocation || "SmilesCars Garage"}
          onChange={e => onChange({ serviceLocationType, internalLocation: e.target.value, externalVendorId })}>
          <option value="SmilesCars Garage">SmilesCars Garage</option>
          <option value="SmilesCars Office">SmilesCars Office</option>
        </select>
      )}
    </div>
  );
}

export default function ActionModal({ car, action, locations, garages, drivers, staff, staffName, role, blacklist, onConfirm, onClose, loading, embedded }) {
  const today = new Date().toISOString().split("T")[0];
  const canAddLocGarage = role === "Admin" || role === "Manager";

  const [client,        setClient]       = useState(car.currentClient || "");
  const [clientPhone,   setClientPhone]  = useState(car.clientPhone || "");
  const [bookedFrom,    setBookedFrom]   = useState(today);
  const [returnDate,    setReturnDate]   = useState(action === "extendBooking" && car.returnDate ? String(car.returnDate).split("T")[0] : "");
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
  const [serviceLocationType, setServiceLocationType] = useState("Internal");
  const [internalLocation,    setInternalLocation]    = useState("SmilesCars Garage");
  const [externalVendorId,    setExternalVendorId]    = useState("");
  const [externalVendorLocation, setExternalVendorLocation] = useState("");
  const [assignedTo,    setAssignedTo]   = useState("");
  const [assignedQuery, setAssignedQuery]= useState("");
  const [assignedOpen,  setAssignedOpen] = useState(false);
  const [blOverride,    setBlOverride]   = useState(false);
  const [err,           setErr]          = useState("");
  const [bookingType,   setBookingType]  = useState("Rental"); // "Rental" | "Transfer"
  const [pickupFrom,    setPickupFrom]   = useState("");
  const [dropoffTo,     setDropoffTo]    = useState("");

  const cfg = ACTIONS[action] || { title: "", color: "#16a34a", btnLabel: "Confirm" };
  const sel = { ...S.input, fontFamily: "inherit" };

  // Guards against duplicate rows in the Config sheet (e.g. the same driver or
  // staff name listed twice) causing React "duplicate key" warnings, which can
  // destabilize this component's identity mid-render and reset its state.
  const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));
  const locationsList = uniq(locations);
  const driversList   = uniq(drivers);
  const staffList     = uniq(staff);

  const needsClient   = action === "checkOut";
  const isExtend      = action === "extendBooking";
  const isReturn      = action === "markReturned";
  const isMaintenance = action === "setMaintenance" || action === "sendRentedToMaintenance";
  const isAvailable   = action === "setAvailable";
  const isSold        = action === "markSold";
  const isStaffUse    = action === "setStaffUse";

  const filteredStaff = assignedQuery.trim()
    ? staffList.filter(s => s.toLowerCase().includes(assignedQuery.toLowerCase()))
    : staffList;

  const isTransfer = needsClient && bookingType === "Transfer";

  const handleSubmit = () => {
    setErr("");
    if (needsClient && !client.trim()) { setErr("Client name is required."); return; }
    if (needsClient && bookingType === "Rental" && !bookedFrom) { setErr("Booked from date is required."); return; }
    if (isTransfer && !bookedFrom)   { setErr("Transfer date is required."); return; }
    if (isTransfer && !pickupFrom.trim()) { setErr("Pick-up location is required."); return; }
    if (isTransfer && !dropoffTo.trim())  { setErr("Drop-off location is required."); return; }
    if (isTransfer && !(addingDriver ? newDriver.trim() : driver)) { setErr("Driver Allocated is required for a Transfer."); return; }
    if ((needsClient && bookingType === "Rental") || isExtend) { if (!returnDate) { setErr("Return date is required."); return; } }
    if (isMaintenance && serviceLocationType === "External" && !externalVendorId) { setErr("Please select a garage."); return; }
    if (isMaintenance && !kmOut.trim()) { setErr("Odometer (KM) is required."); return; }
    if (isMaintenance && !fuelOut) { setErr("Fuel Level is required."); return; }
    if (needsClient && paymentStatus === "Partial Paid" && !amountPaid) { setErr("Please enter amount paid."); return; }
    if (isStaffUse && !assignedTo) { setErr("Please select a staff member."); return; }
    const loc = addingLoc    ? newLoc.trim()    : location;
    const drv = addingDriver ? newDriver.trim() : driver;
    onConfirm({
      client, clientPhone,
      bookedFrom, returnDate: isTransfer ? bookedFrom : returnDate, actualReturn,
      location: loc, remarks, fuelOut, fuelIn, kmOut, kmIn,
      amount: unformat(amount), currency,
      policeFine: unformat(policeFine), parkingFine: unformat(parkingFine),
      paymentStatus, amountPaid: unformat(amountPaid),
      serviceLocationType, internalLocation, externalVendorId, externalVendorLocation, driver: drv, assignedTo,
      newLocation: addingLoc    ? loc : null,
      newDriver:   addingDriver ? drv : null,
      bookingType: needsClient ? bookingType : undefined,
      pickupFrom: isTransfer ? pickupFrom.trim() : undefined,
      dropoffTo:  isTransfer ? dropoffTo.trim()  : undefined,
    });
  };

  const locationField = (
    <div style={S.field}><label style={S.label}>Location</label>
      {!addingLoc ? (
        <select style={sel} value={location} onChange={e => { if (e.target.value === "__new__") setAddingLoc(true); else setLocation(e.target.value); }}>
          <option value="">— Select —</option>
          {locationsList.map(l => <option key={l}>{l}</option>)}
          {canAddLocGarage && <option value="__new__">+ Add new location</option>}
        </select>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="New location name" value={newLoc} onChange={e => setNewLoc(e.target.value)} onBlur={e => setNewLoc(toTitleCase(e.target.value))} autoFocus />
          <button type="button" style={S.cancelSmall} onClick={() => setAddingLoc(false)}>✕</button>
        </div>
      )}
    </div>
  );

  const content = (
    <>
        <div style={{ ...S.header, background: cfg.color }}>
          <div><p style={S.plate}>{car.plate}</p><p style={S.type}>{car.type}</p></div>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <p style={S.title}>{cfg.title}</p>
          <div style={S.field}><label style={S.label}>Staff</label><div style={S.readOnly}>{staffName}</div></div>

          {/* Check Out */}
          {needsClient && (<>
            <div style={S.field}>
              <label style={S.label}>Booking Type *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["Rental", "Transfer"].map(t => (
                  <button type="button" key={t} onClick={() => setBookingType(t)}
                    style={{ flex: 1, padding: "10px", fontSize: 13, fontWeight: 600, borderRadius: 8,
                      border: `1.5px solid ${bookingType === t ? cfg.color : "#e5e7eb"}`,
                      background: bookingType === t ? "#f0fdf4" : "#fff",
                      color: bookingType === t ? "#15803d" : "#555", cursor: "pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.field}><label style={S.label}>Client Name *</label>
              <input style={S.input} value={client} onChange={e => setClient(e.target.value)} onBlur={e => setClient(toTitleCase(e.target.value))} placeholder="Full name" autoFocus /></div>
            <div style={S.field}><label style={S.label}>Client Phone</label>
              <input style={S.input} value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+255..." /></div>

            {/* Blacklist check */}
            {(() => {
              const normalize = str => (str||"").toLowerCase().trim();
              const words = str => normalize(str).split(/\s+/).filter(w => w.length >= 3);
              const blMatch = (blacklist||[]).find(b => {
                const blWords    = words(b.name);
                const cWords     = words(client);
                const matchCount = blWords.filter(w => normalize(client).includes(w)).length +
                                   cWords.filter(w => normalize(b.name).includes(w)).length;
                const phoneMatch = b.phone && clientPhone.trim() &&
                  clientPhone.replace(/\s/g,"").includes(b.phone.replace(/\s/g,""));
                return matchCount >= 1 || phoneMatch;
              });
              if (!blMatch) return null;
              return (
                <div style={{ background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:10,padding:"14px 16px",marginBottom:8 }}>
                  <div style={{ fontSize:14,fontWeight:700,color:"#b91c1c",marginBottom:4 }}>⛔ There is a person with this name on the Blacklist</div>
                  <div style={{ fontSize:12,color:"#dc2626",marginBottom:6 }}>Please check and confirm before checking out.</div>
                  {blMatch.licenseNo && <div style={{ fontSize:12,color:"#888",marginBottom:10 }}>License: <strong>{blMatch.licenseNo}</strong></div>}
                  <label style={{ display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",fontSize:13,color:"#374151" }}>
                    <input type="checkbox" checked={!!blOverride} onChange={e => setBlOverride(e.target.checked)}
                      style={{ width:16,height:16,marginTop:1,cursor:"pointer",flexShrink:0 }} />
                    I confirm this is a different person and want to proceed
                  </label>
                </div>
              );
            })()}
            {bookingType === "Rental" ? (<>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Booked From *</label>
                  <input style={S.input} type="date" value={bookedFrom} onChange={e => setBookedFrom(e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Return Date *</label>
                  <input style={S.input} type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} /></div>
              </div>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Amount Charged</label>
                  <div style={{ display:"flex", gap:6 }}>
                    <MoneyInput style={{ ...S.input, flex:1 }} value={amount} onChange={setAmount} placeholder="e.g. 150,000" />
                    <select style={{ ...sel, width:76 }} value={currency} onChange={e => setCurrency(e.target.value)}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={S.field}><label style={S.label}>Payment Status</label>
                  <select style={sel} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                    {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
                  </select>
                  {paymentStatus === "Partial Paid" && (
                    <MoneyInput style={{ ...S.input, marginTop:6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
                  )}
                </div>
              </div>
              <div style={S.field}><label style={S.label}>Driver (optional)</label>
                {!addingDriver ? (
                  <select style={sel} value={driver} onChange={e => { if (e.target.value === "__new__") setAddingDriver(true); else setDriver(e.target.value); }}>
                    <option value="">— No driver —</option>
                    {driversList.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="__new__">+ Add new driver</option>
                  </select>
                ) : (
                  <div style={{ display:"flex", gap:6 }}>
                    <input style={{ ...S.input, flex:1 }} placeholder="Driver name" value={newDriver} onChange={e => setNewDriver(e.target.value)} onBlur={e => setNewDriver(toTitleCase(e.target.value))} autoFocus />
                    <button type="button" style={S.cancelSmall} onClick={() => setAddingDriver(false)}>✕</button>
                  </div>
                )}
              </div>
              <div style={S.three}>
                {locationField}
                <div style={S.field}><label style={S.label}>Fuel Out</label>
                  <select style={sel} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                    <option value="">— Select —</option>
                    {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div style={S.field}><label style={S.label}>KM Out</label>
                  <input style={S.input} type="text" inputMode="numeric" value={kmOut} onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" />
                </div>
              </div>
              <div style={S.two}>
                <FineInput label="Police Fine"  value={policeFine}  onChange={setPoliceFine}  />
                <FineInput label="Parking Fine" value={parkingFine} onChange={setParkingFine} />
              </div>
            </>) : (<>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>PickUp From *</label>
                  <input style={S.input} value={pickupFrom} onChange={e => setPickupFrom(e.target.value)} onBlur={e => setPickupFrom(toTitleCase(e.target.value))} placeholder="e.g. Airport" /></div>
                <div style={S.field}><label style={S.label}>DropOff To *</label>
                  <input style={S.input} value={dropoffTo} onChange={e => setDropoffTo(e.target.value)} onBlur={e => setDropoffTo(toTitleCase(e.target.value))} placeholder="e.g. Hotel name" /></div>
              </div>
              <div style={S.field}><label style={S.label}>Transfer Date *</label>
                <input style={S.input} type="date" value={bookedFrom} onChange={e => setBookedFrom(e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Driver Allocated *</label>
                {!addingDriver ? (
                  <select style={sel} value={driver} onChange={e => { if (e.target.value === "__new__") setAddingDriver(true); else setDriver(e.target.value); }}>
                    <option value="">— Select —</option>
                    {driversList.map(d => <option key={d} value={d}>{d}</option>)}
                    <option value="__new__">+ Add new driver</option>
                  </select>
                ) : (
                  <div style={{ display:"flex", gap:6 }}>
                    <input style={{ ...S.input, flex:1 }} placeholder="Driver name" value={newDriver} onChange={e => setNewDriver(e.target.value)} onBlur={e => setNewDriver(toTitleCase(e.target.value))} autoFocus />
                    <button type="button" style={S.cancelSmall} onClick={() => setAddingDriver(false)}>✕</button>
                  </div>
                )}
              </div>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Amount Charged</label>
                  <div style={{ display:"flex", gap:6 }}>
                    <MoneyInput style={{ ...S.input, flex:1 }} value={amount} onChange={setAmount} placeholder="e.g. 150,000" />
                    <select style={{ ...sel, width:76 }} value={currency} onChange={e => setCurrency(e.target.value)}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={S.field}><label style={S.label}>Payment Status</label>
                  <select style={sel} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                    {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
                  </select>
                  {paymentStatus === "Partial Paid" && (
                    <MoneyInput style={{ ...S.input, marginTop:6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
                  )}
                </div>
              </div>
              <div style={S.three}>
                {locationField}
                <div style={S.field}><label style={S.label}>Fuel</label>
                  <select style={sel} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                    <option value="">— Select —</option>
                    {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div style={S.field}><label style={S.label}>KM Out</label>
                  <input style={S.input} type="text" inputMode="numeric" value={kmOut} onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" />
                </div>
              </div>
            </>)}
          </>)}

          {/* Extend */}
          {isExtend && (<>
            <div style={S.field}><label style={S.label}>Client</label>
              <div style={S.readOnly}>{car.currentClient}{car.clientPhone ? ` · ${car.clientPhone}` : ""}</div></div>
            <div style={S.field}><label style={S.label}>New Return Date *</label>
              {car.returnDate && <p style={{ fontSize:12, color:"#888", margin:"0 0 4px" }}>Current: {String(car.returnDate).split("T")[0]}</p>}
              <input style={S.input} type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} /></div>
            <div style={S.two}>
              <div style={S.field}><label style={S.label}>Amount Charged</label>
                <div style={{ display:"flex", gap:6 }}>
                  <MoneyInput style={{ ...S.input, flex:1 }} value={amount} onChange={setAmount} placeholder="e.g. 150,000" />
                  <select style={{ ...sel, width:76 }} value={currency} onChange={e => setCurrency(e.target.value)}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={S.field}><label style={S.label}>Payment Status</label>
                <select style={sel} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                  {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
                </select>
                {paymentStatus === "Partial Paid" && (
                  <MoneyInput style={{ ...S.input, marginTop:6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
                )}
              </div>
            </div>
          </>)}

          {/* Return */}
          {isReturn && (<>
            <div style={S.two}>
              <div style={S.field}><label style={S.label}>Returned Date</label>
                <input style={S.input} type="date" value={actualReturn} onChange={e => setActualReturn(e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>KM In</label>
                <input style={S.input} type="text" inputMode="numeric" value={kmIn} onChange={e => setKmIn(fmt(e.target.value))} placeholder="e.g. 45,300" /></div>
            </div>
            <div style={S.two}>
              <div style={S.field}><label style={S.label}>Fuel In</label>
                <select style={sel} value={fuelIn} onChange={e => setFuelIn(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div style={S.field}><label style={S.label}>Payment Status</label>
                <select style={sel} value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                  <option value="">— Keep ({car.paymentStatus || "Unpaid"}) —</option>
                  {PAYMENT_STATUSES.map(p => <option key={p}>{p}</option>)}
                </select>
                {paymentStatus === "Partial Paid" && (
                  <MoneyInput style={{ ...S.input, marginTop:6 }} value={amountPaid} onChange={setAmountPaid} placeholder="Amount paid" />
                )}
              </div>
            </div>
            <div style={S.two}>
              <FineInput label="Police Fine (on return)"  value={policeFine}  onChange={setPoliceFine}  />
              <FineInput label="Parking Fine (on return)" value={parkingFine} onChange={setParkingFine} />
            </div>
          </>)}

          {/* Maintenance */}
          {isMaintenance && (
            <div style={S.field}><label style={S.label}>Send to *</label>
              <GarageLocationPicker
                serviceLocationType={serviceLocationType} internalLocation={internalLocation} externalVendorId={externalVendorId} externalVendorLocation={externalVendorLocation}
                onChange={({ serviceLocationType: t, internalLocation: il, externalVendorId: ev, externalVendorLocation: evl }) => {
                  setServiceLocationType(t); setInternalLocation(il); setExternalVendorId(ev); setExternalVendorLocation(evl || "");
                }} />
              {action === "sendRentedToMaintenance" && (
                <p style={{ fontSize: 11.5, color: "#666", margin: "6px 0 0" }}>
                  {car.currentClient ? `${car.currentClient}'s booking stays intact` : "The client's booking stays intact"} — this car comes straight back to them once the service is done.
                </p>
              )}
            </div>
          )}
          {isMaintenance && (
            <div style={S.two}>
              <div style={S.field}><label style={S.label}>Odometer (KM) *</label>
                <input style={S.input} type="text" inputMode="numeric" value={kmOut} onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" />
              </div>
              <div style={S.field}><label style={S.label}>Fuel Level *</label>
                <select style={sel} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Mark Available */}
          {isAvailable && (
            <div style={S.field}><label style={S.label}>KM Out (from garage)</label>
              <input style={S.input} type="text" inputMode="numeric" value={kmOut} onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" /></div>
          )}

          {/* Staff Use */}
          {isStaffUse && (<>
            <div style={S.field}>
              <label style={S.label}>Assigned To *</label>
              <div style={{ position:"relative" }}>
                <input style={{ ...S.input, paddingRight: assignedTo ? 32 : 14 }}
                  placeholder="Type staff name…" value={assignedQuery} autoComplete="off"
                  onChange={e => { setAssignedQuery(e.target.value); setAssignedTo(""); setAssignedOpen(true); }}
                  onFocus={() => setAssignedOpen(true)}
                  onBlur={() => setTimeout(() => setAssignedOpen(false), 150)} />
                {assignedTo && <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", color:"#16a34a", fontWeight:700 }}>✓</span>}
                {assignedOpen && filteredStaff.length > 0 && (
                  <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:8, boxShadow:"0 4px 12px rgba(0,0,0,0.1)", zIndex:50, maxHeight:180, overflowY:"auto" }}>
                    {filteredStaff.map(s => (
                      <div key={s} style={{ padding:"9px 12px", cursor:"pointer", fontSize:13, borderBottom:"1px solid #f3f4f6" }}
                        onMouseDown={() => { setAssignedTo(s); setAssignedQuery(s); setAssignedOpen(false); }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={S.two}>
              {locationField}
              <div style={S.field}><label style={S.label}>Fuel Out</label>
                <select style={sel} value={fuelOut} onChange={e => setFuelOut(e.target.value)}>
                  <option value="">— Select —</option>
                  {FUEL_LEVELS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
            <div style={S.field}><label style={S.label}>KM Out</label>
              <input style={S.input} type="text" inputMode="numeric" value={kmOut} onChange={e => setKmOut(fmt(e.target.value))} placeholder="e.g. 45,000" />
            </div>
          </>)}

          {/* Sold */}
          {isSold && (
            <div style={S.field}><p style={{ fontSize:13, color:"#888", margin:0 }}>
              This will remove {car.plate} from the active fleet and record it in the Sold Cars tab.</p></div>
          )}

          {/* Location for other actions */}
          {!isSold && !needsClient && !isStaffUse && locationField}

          <div style={S.field}><label style={S.label}>Remarks / Notes</label>
            <textarea style={S.textarea} rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
              placeholder={
                isTransfer                  ? "e.g. Client requested early pickup" :
                action === "checkOut"       ? "e.g. Client heading to Mombasa" :
                action === "extendBooking"  ? "e.g. Client requested 3 more days" :
                action === "setMaintenance" ? "e.g. Engine oil leak, brake service" :
                action === "markReturned"   ? "e.g. Returned with minor scratch" :
                action === "setAvailable"   ? "e.g. Repaired, ready for hire" :
                action === "markSold"       ? "e.g. Sold with full service history" :
                action === "setStaffUse"    ? "e.g. Going to Arusha for company errand" : "Optional note"
              } />
          </div>

          {err && <p style={S.error}>{err}</p>}
          {(() => {
            const normalize = str => (str||"").toLowerCase().trim();
            const words     = str => normalize(str).split(/\s+/).filter(w => w.length >= 3);
            const hasMatch  = needsClient && (blacklist||[]).some(b => {
              const matchCount = words(b.name).filter(w => normalize(client).includes(w)).length +
                                 words(client).filter(w => normalize(b.name).includes(w)).length;
              const phoneMatch = b.phone && clientPhone.trim() &&
                clientPhone.replace(/\s/g,"").includes(b.phone.replace(/\s/g,""));
              return matchCount >= 1 || phoneMatch;
            });
            const isBlocked = hasMatch && !blOverride;
            return (
              <button type="button" style={{ ...S.confirmBtn, background: cfg.color,
                opacity: (loading || isBlocked) ? 0.65 : 1,
                cursor: isBlocked ? "not-allowed" : "pointer" }}
                onClick={isBlocked ? undefined : handleSubmit}
                disabled={loading || isBlocked}>
                {loading ? "Saving…" : isBlocked ? "⚠️ Tick checkbox to confirm" : cfg.btnLabel}
              </button>
            );
          })()}
        </div>
    </>
  );

  if (embedded) return <div style={S.embeddedWrap}>{content}</div>;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>{content}</div>
    </div>
  );
}

const S = {
  overlay:    { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 },
  modal:      { background:"#fff", borderRadius:14, width:500, maxWidth:"100%", maxHeight:"92vh", overflow:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.18)" },
  embeddedWrap: { flex:1, minHeight:0, overflowY:"auto" },
  header:     { padding:"1rem 1.25rem", borderRadius:"14px 14px 0 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start" },
  plate:      { fontSize:18, fontWeight:700, color:"#fff", margin:0 },
  type:       { fontSize:13, color:"rgba(255,255,255,0.8)", margin:"2px 0 0" },
  closeBtn:   { background:"rgba(255,255,255,0.25)", border:"none", color:"#fff", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:14 },
  body:       { padding:"1.25rem" },
  title:      { fontSize:15, fontWeight:600, color:"#111", marginBottom:"1rem" },
  field:      { marginBottom:"0.85rem" },
  two:        { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  three:      { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
  label:      { fontSize:12, fontWeight:500, color:"#555", display:"block", marginBottom:4 },
  input:      { width:"100%", padding:"9px 11px", fontSize:13, border:"1.5px solid #e5e7eb", borderRadius:7, background:"#fff", color:"#111", boxSizing:"border-box", fontFamily:"inherit" },
  textarea:   { width:"100%", padding:"9px 11px", fontSize:13, border:"1.5px solid #e5e7eb", borderRadius:7, background:"#fff", color:"#111", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box" },
  readOnly:   { padding:"9px 11px", fontSize:14, background:"#f3f4f6", borderRadius:7, color:"#555", border:"1.5px solid #e5e7eb" },
  confirmBtn: { width:"100%", padding:"11px", fontSize:15, fontWeight:600, color:"#fff", border:"none", borderRadius:8, cursor:"pointer", marginTop:4, fontFamily:"inherit" },
  cancelSmall:{ padding:"9px 12px", border:"1.5px solid #e5e7eb", borderRadius:7, background:"#fff", cursor:"pointer", color:"#666" },
  error:      { color:"#dc2626", fontSize:13, margin:"6px 0" },
};
