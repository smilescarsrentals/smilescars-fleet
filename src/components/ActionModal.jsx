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
// Type-ahead over real Drivers (name + phone), with an always-visible
// "Add new driver" option — not buried at the bottom of a dropdown you
// have to scroll to discover, per instruction. Phone is required when
// adding a new driver inline, so every driver in the system genuinely
// has one for the rental agreement to print.
function DriverPicker({ drivers, value, onChange, onDriverAdded, staffName }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const selected = drivers.find(d => d.name === value);
  const filtered = query.trim().length > 0
    ? drivers.filter(d => d.name.toLowerCase().includes(query.toLowerCase()))
    : drivers;

  const handleAddNew = async () => {
    if (!newName.trim()) { setErr("Driver name is required."); return; }
    if (!newPhone.trim()) { setErr("Phone number is required."); return; }
    setSaving(true); setErr("");
    try {
      await api.addDriverV2({ name: newName.trim(), phone: newPhone.trim(), staffName });
      const added = { name: newName.trim(), phone: newPhone.trim() };
      onDriverAdded(added);
      onChange(added.name);
      setNewName(""); setNewPhone(""); setAddingNew(false); setQuery("");
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {!addingNew ? (
        <div style={{ position: "relative" }}>
          <input style={{ width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, boxSizing: "border-box", fontFamily: "inherit", background: selected ? "var(--blue-bg)" : "#fff" }}
            placeholder="Type to search drivers…" autoComplete="off"
            value={selected ? `${selected.name}${selected.phone ? " — " + selected.phone : ""}` : query}
            onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
              <div style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f3f4f6", color: "#888" }}
                onMouseDown={() => { onChange(""); setQuery(""); setOpen(false); }}>
                — No driver —
              </div>
              {filtered.slice(0, 20).map(d => (
                <div key={d.name} style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}
                  onMouseDown={() => { onChange(d.name); setQuery(""); setOpen(false); }}>
                  {d.name}{d.phone && <span style={{ color: "#999", fontSize: 12 }}> — {d.phone}</span>}
                </div>
              ))}
              <div style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--sc-blue, #04519B)" }}
                onMouseDown={() => { setAddingNew(true); setOpen(false); }}>
                + Add new driver
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: err ? 6 : 0 }}>
            <input style={{ flex: 1, padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit" }}
              placeholder="Driver name" value={newName} onChange={e => setNewName(e.target.value)} onBlur={e => setNewName(toTitleCase(e.target.value))} autoFocus />
            <input style={{ flex: 1, padding: "9px 11px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit" }}
              placeholder="Phone number" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
          </div>
          {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 6px" }}>{err}</p>}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => { setAddingNew(false); setNewName(""); setNewPhone(""); setErr(""); }}
              style={{ padding: "0 10px", fontSize: 12, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 6, cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" disabled={saving} onClick={handleAddNew}
              style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.65 : 1 }}>
              {saving ? "Adding…" : "Add Driver"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const nowHHMM = new Date().toTimeString().slice(0, 5);
  const canAddLocGarage = role === "Admin" || role === "Manager";

  // Richer than the drivers prop (plain strings from config.drivers) — this
  // is what DriverPicker actually needs (name + phone) for the type-ahead
  // and the rental agreement print-out.
  const [richDrivers, setRichDrivers] = useState([]);
  useEffect(() => {
    api.getDriversV2().then(res => setRichDrivers(res?.data || [])).catch(() => {});
  }, []);

  const [client,        setClient]       = useState(car.currentClient || "");
  const [clientPhone,   setClientPhone]  = useState(car.clientPhone || "");
  const [bookedFrom,    setBookedFrom]   = useState(today);
  const [transferTime,  setTransferTime] = useState(nowHHMM); // actual time a Transfer happened, since it's often logged well after the fact
  // Extra legs for "same car, same client, several trips today" — logged
  // after the fact, since staff can't realistically be on the system for
  // a 2am transfer. Leg 1 is the fields above; this holds legs 2+.
  const [extraLegs, setExtraLegs] = useState([]);
  const [leg1Completed, setLeg1Completed] = useState(false); // only relevant once a 2nd leg is added
  const [leg1InDate, setLeg1InDate] = useState(today);
  const [leg1InTime, setLeg1InTime] = useState(nowHHMM);
  const [returnDate,    setReturnDate]   = useState(action === "extendBooking" && car.returnDate ? String(car.returnDate).split("T")[0] : "");
  const [actualReturn,  setActualReturn] = useState(today);
  const [returnTime,    setReturnTime]   = useState(nowHHMM); // same idea, for when a Transfer/Rental is completed
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

  const addLeg = () => setExtraLegs(ls => [...ls, {
    pickupFrom: "", dropoffTo: "", outDate: today, outTime: nowHHMM,
    completed: false, inDate: today, inTime: nowHHMM,
  }]);
  const updateLeg = (i, patch) => setExtraLegs(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));

  const handleSubmit = () => {
    setErr("");
    if (needsClient && !client.trim()) { setErr("Client name is required."); return; }
    if (needsClient && bookingType === "Rental" && !bookedFrom) { setErr("Booked from date is required."); return; }
    if (isTransfer && !bookedFrom)   { setErr("Transfer date is required."); return; }
    if (isTransfer && !pickupFrom.trim()) { setErr("Pick-up location is required."); return; }
    if (isTransfer && !dropoffTo.trim())  { setErr("Drop-off location is required."); return; }
    if (isTransfer && !driver) { setErr("Driver Allocated is required for a Transfer."); return; }
    if (isTransfer && extraLegs.length > 0) {
      for (const [i, leg] of extraLegs.entries()) {
        if (!leg.pickupFrom.trim() || !leg.dropoffTo.trim() || !leg.outDate || !leg.outTime) {
          setErr(`Leg ${i + 2} needs a pickup, dropoff, date, and time.`); return;
        }
      }
    }
    if ((needsClient && bookingType === "Rental") || isExtend) { if (!returnDate) { setErr("Return date is required."); return; } }
    if (isMaintenance && serviceLocationType === "External" && !externalVendorId) { setErr("Please select a garage."); return; }
    if (isMaintenance && !kmOut.trim()) { setErr("Odometer (KM) is required."); return; }
    if (isMaintenance && !fuelOut) { setErr("Fuel Level is required."); return; }
    if (needsClient && paymentStatus === "Partial Paid" && !amountPaid) { setErr("Please enter amount paid."); return; }
    if (isStaffUse && !assignedTo) { setErr("Please select a staff member."); return; }
    const loc = addingLoc    ? newLoc.trim()    : location;
    const driverPhone = richDrivers.find(d => d.name === driver)?.phone || "";
    onConfirm({
      client, clientPhone,
      bookedFrom, returnDate: isTransfer ? bookedFrom : returnDate, actualReturn,
      // Combined date+time, only when it's actually meaningful (Transfers,
      // where "logged at 9am" and "happened at 2am" are genuinely
      // different things worth recording separately). Left undefined for
      // Rentals so their checkout/return timestamps behave exactly as
      // before — stamped at whatever moment they're actually entered.
      // isTransfer is only ever true during checkOut (it depends on
      // needsClient, which is false for markReturned) — so the return
      // side has to check car.bookingType instead, the Fleet row's own
      // record of what this booking actually is.
      actualTimestamp:
        isTransfer && bookedFrom ? `${bookedFrom}T${transferTime || "00:00"}:00`
        : (isReturn && car.bookingType === "Transfer" && actualReturn) ? `${actualReturn}T${returnTime || "00:00"}:00`
        : undefined,
      location: loc, remarks, fuelOut, fuelIn, kmOut, kmIn,
      amount: unformat(amount), currency,
      policeFine: unformat(policeFine), parkingFine: unformat(parkingFine),
      paymentStatus, amountPaid: unformat(amountPaid),
      serviceLocationType, internalLocation, externalVendorId, externalVendorLocation, driver, driverPhone, assignedTo,
      newLocation: addingLoc    ? loc : null,
      bookingType: needsClient ? bookingType : undefined,
      pickupFrom: isTransfer ? pickupFrom.trim() : undefined,
      dropoffTo:  isTransfer ? dropoffTo.trim()  : undefined,
      // Only present when "+ Add another leg" was actually used — FleetPage
      // routes to a different backend action (logMultiLegTransfer) when
      // this is set, otherwise the normal single-leg checkOut is unchanged.
      multiLeg: isTransfer && extraLegs.length > 0 ? true : undefined,
      legs: isTransfer && extraLegs.length > 0 ? [
        {
          pickupFrom: pickupFrom.trim(), dropoffTo: dropoffTo.trim(),
          outTimestamp: `${bookedFrom}T${transferTime || "00:00"}:00`,
          inTimestamp: leg1Completed ? `${leg1InDate}T${leg1InTime || "00:00"}:00` : null,
        },
        ...extraLegs.map((l) => ({
          pickupFrom: l.pickupFrom.trim(), dropoffTo: l.dropoffTo.trim(),
          outTimestamp: `${l.outDate}T${l.outTime || "00:00"}:00`,
          inTimestamp: l.completed ? `${l.inDate}T${l.inTime || "00:00"}:00` : null,
        })),
      ] : undefined,
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
                <DriverPicker drivers={richDrivers} value={driver} onChange={setDriver} staffName={staffName}
                  onDriverAdded={d => setRichDrivers(list => [...list, d])} />
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
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Transfer Date *</label>
                  <input style={S.input} type="date" value={bookedFrom} onChange={e => setBookedFrom(e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Actual Time</label>
                  <input style={S.input} type="time" value={transferTime} onChange={e => setTransferTime(e.target.value)} /></div>
              </div>
              <p style={{ fontSize:11.5, color:"#94a3b8", margin:"-8px 0 8px" }}>
                Logging this after the fact (e.g. a 2am transfer entered in the morning)? Set the actual time here
                so it's recorded correctly, not just when you happened to enter it.
              </p>

              {extraLegs.length > 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:8, margin:"-4px 0 12px" }}>
                  <input type="checkbox" id="leg1completed" checked={leg1Completed} onChange={e => setLeg1Completed(e.target.checked)} />
                  <label htmlFor="leg1completed" style={{ fontSize:12.5, color:"#374151" }}>This first leg is already completed</label>
                </div>
              )}
              {extraLegs.length > 0 && leg1Completed && (
                <div style={S.two}>
                  <div style={S.field}><label style={S.label}>Returned Date</label>
                    <input style={S.input} type="date" value={leg1InDate} onChange={e => setLeg1InDate(e.target.value)} /></div>
                  <div style={S.field}><label style={S.label}>Returned Time</label>
                    <input style={S.input} type="time" value={leg1InTime} onChange={e => setLeg1InTime(e.target.value)} /></div>
                </div>
              )}

              {extraLegs.map((leg, i) => (
                <div key={i} style={{ border:"1.5px solid #e5e7eb", borderRadius:10, padding:"0.75rem", margin:"0 0 12px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:12.5, fontWeight:700, color:"#374151" }}>Leg {i + 2}</span>
                    <button type="button" onClick={() => setExtraLegs(ls => ls.filter((_, j) => j !== i))}
                      style={{ padding:0, background:"none", border:"none", color:"#dc2626", fontSize:12.5, cursor:"pointer" }}>Remove</button>
                  </div>
                  <div style={S.two}>
                    <div style={S.field}><label style={S.label}>PickUp From *</label>
                      <input style={S.input} value={leg.pickupFrom} onChange={e => updateLeg(i, { pickupFrom: e.target.value })} placeholder="e.g. Hotel" /></div>
                    <div style={S.field}><label style={S.label}>DropOff To *</label>
                      <input style={S.input} value={leg.dropoffTo} onChange={e => updateLeg(i, { dropoffTo: e.target.value })} placeholder="e.g. Restaurant" /></div>
                  </div>
                  <div style={S.two}>
                    <div style={S.field}><label style={S.label}>Date</label>
                      <input style={S.input} type="date" value={leg.outDate} onChange={e => updateLeg(i, { outDate: e.target.value })} /></div>
                    <div style={S.field}><label style={S.label}>Time Out</label>
                      <input style={S.input} type="time" value={leg.outTime} onChange={e => updateLeg(i, { outTime: e.target.value })} /></div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, margin:"4px 0" }}>
                    <input type="checkbox" id={`legcompleted${i}`} checked={leg.completed} onChange={e => updateLeg(i, { completed: e.target.checked })} />
                    <label htmlFor={`legcompleted${i}`} style={{ fontSize:12.5, color:"#374151" }}>This leg is already completed</label>
                  </div>
                  {leg.completed && (
                    <div style={S.two}>
                      <div style={S.field}><label style={S.label}>Returned Date</label>
                        <input style={S.input} type="date" value={leg.inDate} onChange={e => updateLeg(i, { inDate: e.target.value })} /></div>
                      <div style={S.field}><label style={S.label}>Returned Time</label>
                        <input style={S.input} type="time" value={leg.inTime} onChange={e => updateLeg(i, { inTime: e.target.value })} /></div>
                    </div>
                  )}
                </div>
              ))}
              <button type="button" onClick={addLeg}
                style={{ padding:"7px 12px", fontSize:12.5, fontWeight:600, background:"#fff", color:"#111", border:"1.5px solid #e5e7eb", borderRadius:8, cursor:"pointer", marginBottom:12 }}>
                + Add another leg (same car, same client, later today)
              </button>
              <div style={S.field}><label style={S.label}>Driver Allocated *</label>
                <DriverPicker drivers={richDrivers} value={driver} onChange={setDriver} staffName={staffName}
                  onDriverAdded={d => setRichDrivers(list => [...list, d])} />
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
            {car.bookingType === "Transfer" && (
              <div style={S.field}><label style={S.label}>Actual Time</label>
                <input style={S.input} type="time" value={returnTime} onChange={e => setReturnTime(e.target.value)} />
                <p style={{ fontSize:11.5, color:"#94a3b8", margin:"4px 0 0" }}>
                  Same idea as the transfer's start time — set this if you're logging the completion later than
                  when it actually happened.
                </p>
              </div>
            )}
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
