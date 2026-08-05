import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { toTitleCase } from "../lib/textFormat";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const COLORS  = ["#3b82f6","var(--green)","#d97706","var(--red)","var(--sc-blue)","#0284c7","#be185d","#b45309"];

function colorFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function pad(n) { return String(n).padStart(2,"0"); }
// "2026-07-22" via new Date(str) parses as UTC midnight, not local midnight —
// in a UTC+3 timezone (Tanzania) that silently adds most of a day to every
// "days until pickup" calculation, making "Tomorrow" show as "In 2 days" etc.
// Parsing the parts manually always constructs local midnight instead.
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDate(d) {
  if (!d) return "—";
  const [y,m,dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}

const CITIES = ["Dar es Salaam", "Mwanza", "Arusha", "Zanzibar"];
const LOCATION_OPTIONS = {
  "Dar es Salaam": ["SmilesCars Office", "Airport", "Others"],
  "Mwanza":         ["SmilesCars Office", "Airport", "Others"],
  "Zanzibar":       ["SmilesCars Office", "Airport", "Others"],
  "Arusha":         ["SmilesCars Office", "KIA Airport", "Arusha Airport", "Others"],
};

// Two-part location picker: city on the left, specific location on the
// right. The right box's options depend on the chosen city (Arusha splits
// Airport into KIA/Arusha Airport); picking "Others" swaps it to free text.
function LocationPicker({ city, location, onCityChange, onLocationChange }) {
  const options = LOCATION_OPTIONS[city] || [];
  const isOther = location !== "" && !options.includes(location) && city !== "";
  // Once a city is picked, "Others" was chosen if the stored location isn't
  // one of that city's preset options (covers free text carried over on edit).
  const showFreeText = city && (location === "Others" || isOther);

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select style={{ ...S.input, flex: 1 }} value={city}
        onChange={e => { onCityChange(e.target.value); onLocationChange(""); }}>
        <option value="">Select city…</option>
        {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {showFreeText ? (
        <input style={{ ...S.input, flex: 1 }} placeholder="Specify location…"
          value={location === "Others" ? "" : location}
          onChange={e => onLocationChange(e.target.value)} />
      ) : (
        <select style={{ ...S.input, flex: 1 }} value={location} disabled={!city}
          onChange={e => onLocationChange(e.target.value)}>
          <option value="">Select location…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
    </div>
  );
}

export default function ReservationsPage({ staffName, role }) {
  const navigate = useNavigate();
  const location = useLocation();
  const canEdit  = role === "Admin" || role === "Manager";
  const today    = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  const [year,         setYear]         = useState(today.getFullYear());
  const [month,        setMonth]        = useState(today.getMonth() + 1);
  const [reservations, setReservations] = useState([]);
  const [fleet,        setFleet]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showAdd,      setShowAdd]      = useState(null); // day number
  const [prefillLead,  setPrefillLead]  = useState(null); // lead being converted, or null
  const [urgentExpanded, setUrgentExpanded] = useState(false);
  const [showDetail,   setShowDetail]   = useState(null);
  const [showEdit,     setShowEdit]     = useState(null);

  // Arriving from Leads -> "Convert to Reservation": jump the calendar to
  // the lead's relevant date and open the Add form pre-filled with its
  // details. Cleared from router state immediately so a page refresh
  // doesn't silently re-trigger this on every reload.
  useEffect(() => {
    const lead = location.state?.prefillFromLead;
    if (!lead) return;
    const relevantDate = lead.bookingType === "Transfer" ? lead.pickupDate : lead.pickupDate;
    if (relevantDate) {
      const [y, m, d] = relevantDate.split("-").map(Number);
      setYear(y); setMonth(m);
      setPrefillLead(lead);
      setShowAdd(d);
    } else {
      setPrefillLead(lead);
      setShowAdd(today.getDate());
    }
    navigate(location.pathname, { replace: true, state: {} });
  }, []); // run once on mount only — router state is consumed immediately above

  const load = async () => {
    setLoading(true);
    try {
      const [rRes, fRes] = await Promise.all([
        api.getReservations(pad(month), year),
        api.getFleet(),
      ]);
      setReservations(rRes.data || []);
      setFleet(fRes.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [month, year]);

  const days = daysInMonth(year, month);
  const fleetTypes = useMemo(() => [...new Set(fleet.map(c => c.type).filter(Boolean))].sort(), [fleet]);

  // Urgent = no plate assigned + pickup within 5 days
  const urgentReservations = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    return reservations.filter(r => {
      if (r.bookingType === "Transfer") return false; // Transfers don't need a plate assigned
      if (r.plate) return false; // already has a car assigned
      if (!r.pickupDate) return false;
      const pickup = parseLocalDate(r.pickupDate);
      const diff   = Math.ceil((pickup - now) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 5;
    });
  }, [reservations]);

  // Group by pickup day for Rentals, transfer day for Transfers
  const byDay = useMemo(() => {
    const map = {};
    reservations.forEach(r => {
      const dateStr = r.bookingType === "Transfer" ? r.transferDate : r.pickupDate;
      if (!dateStr) return;
      const [y, m, d] = dateStr.split("-").map(Number);
      if (y === year && m === month) {
        if (!map[d]) map[d] = [];
        map[d].push(r);
      }
    });
    return map;
  }, [reservations, year, month]);

  const prevMonth = () => { if (month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1); };
  const nextMonth = () => { if (month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1); };
  const todayDay  = today.getFullYear()===year && today.getMonth()+1===month ? today.getDate() : null;

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:12 }}>
        <div>
          <div style={{ fontSize:22,fontWeight:700,color:"var(--text)" }}>Reservations</div>
          <div style={{ fontSize:13,color:"var(--text-muted)",marginTop:2 }}>{reservations.length} reservations this month</div>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
          <button type="button" className="btn btn-add" onClick={() => setShowAdd(today.getMonth()+1===month && today.getFullYear()===year ? today.getDate() : 1)}>
            + New Reservation
          </button>
          <button type="button" onClick={prevMonth} className="btn btn-ghost btn-sm">‹</button>
          <span style={{ fontSize:15,fontWeight:700,color:"var(--text)",minWidth:150,textAlign:"center" }}>{MONTHS[month-1]} {year}</span>
          <button type="button" onClick={nextMonth} className="btn btn-ghost btn-sm">›</button>
          <button type="button" onClick={()=>{setMonth(today.getMonth()+1);setYear(today.getFullYear());}} className="btn btn-ghost btn-sm">Today</button>
        </div>
      </div>

      {urgentReservations.length > 0 && (
        <div style={{ background:"var(--red-bg)",border:"1.5px solid var(--red-border)",borderRadius:10,padding:"12px 16px",marginBottom:"1rem" }}>
          <button type="button" onClick={() => setUrgentExpanded(v => !v)}
            style={{ display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",background:"none",border:"none",padding:0,cursor:"pointer",fontFamily:"inherit" }}>
            <span style={{ fontWeight:700,color:"var(--red)",fontSize:14 }}>
              🚨 {urgentReservations.length} reservation{urgentReservations.length>1?"s":""} need{urgentReservations.length===1?"s":""} a car assigned
            </span>
            <span style={{ fontSize:12,fontWeight:600,color:"var(--red)" }}>{urgentExpanded ? "Hide ▲" : "Show ▼"}</span>
          </button>
          {urgentExpanded && (
          <div style={{ marginTop:8 }}>
            {urgentReservations.map(r => {
              const now    = new Date(); now.setHours(0,0,0,0);
              const pickup = parseLocalDate(r.pickupDate);
              const diff   = Math.ceil((pickup - now) / (1000*60*60*24));
              return (
                <div key={r.id} className="sc-urgent-row">
                  <span className="sc-urgent-line1">
                    <span className="sc-urgent-client">{r.client}</span>
                    <span className="sc-urgent-type">({r.carType||"Any"})</span>
                    <span className="sc-urgent-diff">{diff===0?"Today":diff===1?"Tomorrow":`In ${diff} days`}</span>
                  </span>
                  <span className="sc-urgent-line2">
                    <span className="sc-urgent-staff">{r.staffName||"Unassigned"}</span>
                    <span className="sc-urgent-date">{fmtDate(r.pickupDate)}</span>
                  </span>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {loading ? <div style={S.center}>Loading…</div> : (
        <div style={S.board}>
          {Array.from({length:days},(_,i)=>i+1).map(day => {
            const slots   = byDay[day] || [];
            const isToday = day === todayDay;
            const dateStr = `${year}-${pad(month)}-${pad(day)}`;
            const isPast  = dateStr < todayStr;
            return (
              <div key={day} style={{ ...S.row, background:isToday?"var(--green-bg)":isPast?"var(--bg)":"var(--surface)", borderLeft:isToday?"3px solid var(--green)":"3px solid transparent" }}>
                <div style={{ ...S.dayNum,color:isToday?"var(--green)":isPast?"var(--text-faint)":"var(--text)",fontWeight:isToday?800:600 }}>
                  {pad(day)}
                  {isToday && <div style={{ fontSize:9,color:"var(--green)",fontWeight:700,letterSpacing:".5px" }}>TODAY</div>}
                </div>
                <div style={S.slots}>
                  {slots.map(r => {
                    const isTransfer = r.bookingType === "Transfer";
                    const isUrgent = urgentReservations.some(u => u.id === r.id);
                    const isCancelled = r.status === "Cancelled";
                    return (
                      <div key={r.id} style={{ ...S.card,
                        borderLeft:`3px solid ${isCancelled ? "#7f1d1d" : isUrgent ? "var(--red)" : isTransfer ? "var(--purple, #8b5cf6)" : colorFor(r.plate||r.client)}`,
                        background: isCancelled ? "#7f1d1d" : isUrgent ? "var(--red-bg)" : "var(--bg)",
                        color: isCancelled ? "#fff" : undefined,
                        opacity: isCancelled ? 0.9 : 1 }}
                        onClick={() => setShowDetail(r)}>
                        {isCancelled && <span title="Cancelled" style={{ fontWeight:700 }}>✕</span>}
                        {!isCancelled && isUrgent && <span title="No car assigned — urgent!">🚨</span>}
                        {!isCancelled && isTransfer && <span title="Transfer">🔀</span>}
                        <span style={{ fontWeight:600,fontSize:12, textDecoration: isCancelled ? "line-through" : "none" }}>{r.client}</span>
                        {isTransfer ? (
                          <>
                            {r.plate && <span style={{ fontSize:11,color: isCancelled ? "rgba(255,255,255,0.75)" : "var(--text-muted)",marginLeft:5 }}>· {r.plate}</span>}
                            {r.dropOffTo && <span style={{ fontSize:11,color: isCancelled ? "rgba(255,255,255,0.6)" : "var(--text-faint)",marginLeft:5 }}>→ {r.dropOffTo}</span>}
                          </>
                        ) : (
                          <>
                            {r.plate && <span style={{ fontSize:11,color: isCancelled ? "rgba(255,255,255,0.75)" : "var(--text-muted)",marginLeft:5 }}>· {r.plate}</span>}
                            {!r.plate && r.carType && <span style={{ fontSize:11,color: isCancelled ? "rgba(255,255,255,0.75)" : "var(--text-muted)",marginLeft:5 }}>· {r.carType}</span>}
                            {r.returnDate && <span style={{ fontSize:11,color: isCancelled ? "rgba(255,255,255,0.6)" : "var(--text-faint)",marginLeft:5 }}>→ {fmtDate(r.returnDate)}</span>}
                          </>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" style={S.addSlot} onClick={() => setShowAdd(day)} title="Add reservation">+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd    && <AddModal    day={showAdd}    month={month} year={year} staffName={staffName} fleet={fleet} fleetTypes={fleetTypes} prefillLead={prefillLead} onClose={()=>{setShowAdd(null);setPrefillLead(null);}}    onSaved={()=>{setShowAdd(null);setPrefillLead(null);load();}} />}
      {showDetail && <DetailModal res={showDetail} canEdit={canEdit} staffName={staffName} role={role}
        onClose={()=>setShowDetail(null)}
        onEdit={()=>{setShowEdit(showDetail);setShowDetail(null);}}
        onDeleted={()=>{setShowDetail(null);load();}}
        onCancelled={()=>{setShowDetail(null);load();}}
        todayStr={todayStr}
        onCheckOut={(plate) => navigate(`/?search=${encodeURIComponent(plate)}`)}
        onAssignPlate={(res) => { setShowDetail(null); setShowEdit(res); }}
      />}
      {showEdit   && <EditModal   res={showEdit}   fleet={fleet}  fleetTypes={fleetTypes} staffName={staffName} onClose={()=>setShowEdit(null)}   onSaved={()=>{setShowEdit(null);load();}} />}
    </div>
  );
}

// ── Plate Search ─────────────────────────────────────────────
function PlateSearch({ fleet, value, carType, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [open,  setOpen]  = useState(false);
  // Only show available cars
  const available = fleet.filter(c => c.status === "Available");
  const filtered  = query.trim().length > 0
    ? available.filter(c => c.plate.toLowerCase().replace(/\s/g,"").includes(query.toLowerCase().replace(/\s/g,"")))
    : [];
  const select = (car) => { onChange(car.plate, car.type); setQuery(car.plate); setOpen(false); };

  return (
    <div style={{ position:"relative" }}>
      <input style={{ ...S.input, background: value ? "var(--blue-bg)" : "var(--surface)", paddingRight: value ? 32 : 11 }}
        placeholder="Type plate number…" value={query} autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange("",""); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(()=>setOpen(false),150)} />
      {value && <span style={{ position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",color:"var(--sc-blue)",fontWeight:700 }}>✓</span>}
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"var(--surface)",border:"1.5px solid var(--border)",borderRadius:8,boxShadow:"var(--shadow)",zIndex:50,maxHeight:200,overflowY:"auto" }}>
          {filtered.slice(0,15).map(c => (
            <div key={c.plate} style={{ padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid var(--border-light)",display:"flex",justifyContent:"space-between" }}
              onMouseDown={() => select(c)}>
              <span style={{ fontWeight:600 }}>{c.plate}</span>
              <span style={{ color:"var(--text-muted)" }}>{c.type} · {c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Type Search ──────────────────────────────────────────────
function TypeSearch({ fleetTypes, value, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [open,  setOpen]  = useState(false);
  const filtered = query.trim().length > 0
    ? fleetTypes.filter(t => t.toLowerCase().includes(query.toLowerCase()))
    : fleetTypes;
  const select = (type) => { onChange(type); setQuery(type); setOpen(false); };
  return (
    <div style={{ position:"relative" }}>
      <input style={{ ...S.input, background: value ? "var(--blue-bg)" : "var(--surface)", paddingRight: value ? 32 : 11 }}
        placeholder="Type car type…" value={query} autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(()=>setOpen(false),150)} />
      {value && <span style={{ position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",color:"var(--sc-blue)",fontWeight:700 }}>✓</span>}
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"var(--surface)",border:"1.5px solid var(--border)",borderRadius:8,boxShadow:"var(--shadow)",zIndex:50,maxHeight:200,overflowY:"auto" }}>
          {filtered.map(t => (
            <div key={t} style={{ padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid var(--border-light)" }}
              onMouseDown={() => select(t)}>{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add Modal ────────────────────────────────────────────────
function AddModal({ day, month, year, staffName, fleet, fleetTypes, prefillLead, onClose, onSaved }) {
  const dateStr = `${year}-${pad(month)}-${pad(day)}`;
  const [bookingType, setBookingType] = useState(prefillLead?.bookingType === "Transfer" ? "Transfer" : "Rental");
  const [form, setForm] = useState({
    client: prefillLead?.clientName || "", phone: prefillLead?.phone || "", plate: "", carType: prefillLead?.vehicle || "",
    pickupDate: prefillLead?.pickupDate || dateStr, returnDate: prefillLead?.returnDate || "",
    pickUpCity: "", pickUpFrom: prefillLead?.pickUpLocation || "", remarks: prefillLead?.notes || "",
    dropOffCity: "", dropOffTo: "", transferDate: prefillLead?.pickupDate || dateStr,
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const displayDate = `${pad(day)} ${MONTHS_SHORT[month-1]} ${year}`;

  const handleSave = async () => {
    if (!form.client.trim())   { setErr("Client name is required."); return; }
    if (bookingType === "Transfer") {
      if (!form.transferDate)  { setErr("Transfer date is required."); return; }
    } else {
      if (!form.carType.trim())  { setErr("Car type is required."); return; }
      if (!form.pickupDate)      { setErr("Pickup date is required."); return; }
      if (!form.returnDate)      { setErr("Return date is required."); return; }
      if (form.returnDate <= form.pickupDate) { setErr("Return date must be after pickup date."); return; }
    }
    setSaving(true); setErr("");
    try {
      const res = await api.addReservation({ ...form, bookingType, staffName });
      if (prefillLead && res?.id) {
        // Link back to the lead so its record shows what it became — best
        // effort: the reservation is already saved at this point, so a
        // failure here shouldn't block the user or look like the save failed.
        api.editLead({ id: prefillLead.id, convertedReservationId: res.id }).catch(() => {});
      }
      onSaved();
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ ...S.mHead,background:"var(--sc-blue)" }}>
          <div><p style={S.mTitle}>New Reservation</p><p style={S.mSub}>{displayDate}{prefillLead ? ` · From lead ${prefillLead.id}` : ""}</p></div>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}>
            <label style={S.label}>Booking Type</label>
            <div style={{ display:"flex",gap:8 }}>
              {["Rental","Transfer"].map(t => (
                <button key={t} type="button" onClick={()=>setBookingType(t)}
                  style={{ flex:1,padding:"9px 0",fontSize:13,fontWeight:600,borderRadius:7,cursor:"pointer",fontFamily:"inherit",
                    border:`1.5px solid ${bookingType===t?"var(--sc-blue)":"var(--border)"}`,
                    background:bookingType===t?"var(--blue-bg)":"var(--surface)",
                    color:bookingType===t?"var(--sc-blue)":"var(--text-muted)" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={S.field}><label style={S.label}>Staff</label><div style={S.readOnly}>{staffName}</div></div>

          <div style={S.field}><label style={S.label}>Client Name *</label>
            <input style={S.input} value={form.client} onChange={e=>set("client",e.target.value)} onBlur={e=>set("client",toTitleCase(e.target.value))} placeholder="Full name" autoFocus /></div>
          <div style={S.field}><label style={S.label}>Contact No.</label>
            <input style={S.input} value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="+255..." /></div>

          <div style={{ height:1,background:"var(--border-light)",margin:"4px 0 12px" }} />

          {bookingType === "Rental" ? (
            <>
              <div style={S.field}><label style={S.label}>Plate No. <span style={{ color:"var(--text-faint)",fontWeight:400 }}>(optional)</span></label>
                <PlateSearch fleet={fleet} value={form.plate} carType={form.carType}
                  onChange={(plate,type) => { set("plate",plate); if(type) set("carType",type); }} />
              </div>
              <div style={S.field}><label style={S.label}>Car Type *</label>
                <TypeSearch fleetTypes={fleetTypes||[]} value={form.carType}
                  onChange={type => set("carType", type)} />
              </div>

              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Pickup Date *</label>
                  <input style={S.input} type="date" value={form.pickupDate} onChange={e=>set("pickupDate",e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Return Date *</label>
                  <input style={S.input} type="date" value={form.returnDate} min={form.pickupDate} onChange={e=>set("returnDate",e.target.value)} /></div>
              </div>

              <div style={S.field}><label style={S.label}>Pick Up Location</label>
                <LocationPicker city={form.pickUpCity} location={form.pickUpFrom}
                  onCityChange={c => set("pickUpCity", c)} onLocationChange={l => set("pickUpFrom", l)} /></div>
            </>
          ) : (
            <>
              <div style={S.field}><label style={S.label}>Plate No. <span style={{ color:"var(--text-faint)",fontWeight:400 }}>(optional)</span></label>
                <PlateSearch fleet={fleet} value={form.plate} carType={form.carType}
                  onChange={(plate,type) => { set("plate",plate); if(type) set("carType",type); }} />
              </div>
              <div style={S.field}><label style={S.label}>Car Type</label>
                <TypeSearch fleetTypes={fleetTypes||[]} value={form.carType}
                  onChange={type => set("carType", type)} />
              </div>

              <div style={S.field}><label style={S.label}>Pick Up From</label>
                <LocationPicker city={form.pickUpCity} location={form.pickUpFrom}
                  onCityChange={c => set("pickUpCity", c)} onLocationChange={l => set("pickUpFrom", l)} /></div>
              <div style={S.field}><label style={S.label}>Drop Off To</label>
                <LocationPicker city={form.dropOffCity} location={form.dropOffTo}
                  onCityChange={c => set("dropOffCity", c)} onLocationChange={l => set("dropOffTo", l)} /></div>

              <div style={S.field}><label style={S.label}>Transfer Date *</label>
                <input style={S.input} type="date" value={form.transferDate} onChange={e=>set("transferDate",e.target.value)} /></div>
            </>
          )}

          <div style={S.field}><label style={S.label}>Remarks</label>
            <textarea style={S.textarea} rows={2} value={form.remarks} onChange={e=>set("remarks",e.target.value)} placeholder="Any special notes…" /></div>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn,background:"var(--sc-blue)",opacity:saving?0.65:1 }} onClick={handleSave} disabled={saving}>
            {saving?"Saving…":"Add Reservation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Modal ─────────────────────────────────────────────
function DetailModal({ res, canEdit, staffName, role, onClose, onEdit, onDeleted, onCancelled, todayStr, onCheckOut, onAssignPlate }) {
  const [deleting, setDeleting] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const isTransfer = res.bookingType === "Transfer";
  const isCancelled = res.status === "Cancelled";
  const color = isCancelled ? "#7f1d1d" : colorFor(res.plate||res.client);
  const isToday    = res.pickupDate === todayStr;
  const isActive   = res.pickupDate <= todayStr && res.returnDate >= todayStr;
  const canCheckOut = !isCancelled && !isTransfer && (isToday || isActive) && res.plate;
  // Edit/Cancel: the staff member who made the reservation, or Admin/Manager
  // (who keep full access to every reservation, per canEdit). Delete stays
  // Admin/Manager-only (canEdit), unchanged from before.
  const isOwner = staffName && res.staffName && staffName.trim() === res.staffName.trim();
  const canEditThis = canEdit || isOwner;

  const handleDelete = async () => {
    if (!window.confirm("Delete this reservation?")) return;
    setDeleting(true);
    try { await api.deleteReservation({id:res.id}); onDeleted(); }
    catch(e) { alert(e.message); setDeleting(false); }
  };

  const fmtLocation = (city, loc) => {
    if (city && loc) return `${city} — ${loc}`;
    return loc || city || "—";
  };

  const rows = isTransfer ? [
    ["Booking Type",  "Transfer"],
    ["Client",        res.client],
    ["Contact No.",   res.phone      ||"—"],
    ["Plate No.",     res.plate      ||"—"],
    ["Car Type",      res.carType    ||"—"],
    ["Pick Up From",  fmtLocation(res.pickUpCity, res.pickUpFrom)],
    ["Drop Off To",   fmtLocation(res.dropOffCity, res.dropOffTo)],
    ["Transfer Date", fmtDate(res.transferDate)],
    ["Remarks",       res.remarks    ||"—"],
    ["Added by",      res.staffName  ||"—"],
    ...(isCancelled ? [["Cancelled By", res.cancelledBy || "—"], ["Cancel Reason", res.cancelReason || "—"]] : []),
  ] : [
    ["Client",       res.client],
    ["Contact No.",  res.phone      ||"—"],
    ["Plate No.",    res.plate      ||"—"],
    ["Car Type",     res.carType    ||"—"],
    ["Pickup Date",  fmtDate(res.pickupDate)],
    ["Return Date",  fmtDate(res.returnDate)],
    ["Pick Up From", fmtLocation(res.pickUpCity, res.pickUpFrom)],
    ["Remarks",      res.remarks    ||"—"],
    ["Added by",     res.staffName  ||"—"],
    ...(isCancelled ? [["Cancelled By", res.cancelledBy || "—"], ["Cancel Reason", res.cancelReason || "—"]] : []),
  ];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ ...S.mHead,background:color }}>
          <div>
            <p style={S.mTitle}>{isCancelled && "✕ "}{res.client}</p>
            <p style={S.mSub}>
              {isCancelled ? "Cancelled" : isTransfer
                ? `${res.plate ? res.plate+" · " : ""}Transfer · ${fmtDate(res.transferDate)}`
                : `${res.plate ? res.plate+" · " : ""}${fmtDate(res.pickupDate)} → ${fmtDate(res.returnDate)}`}
            </p>
          </div>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          {rows.map(([label,val])=>(
            <div key={label} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border-light)",fontSize:13 }}>
              <span style={{ fontWeight:600,color:"var(--text-muted)",fontSize:12,textTransform:"uppercase",letterSpacing:".3px",flexShrink:0 }}>{label}</span>
              <span style={{ color:"var(--text)",textAlign:"right",marginLeft:12 }}>{val}</span>
            </div>
          ))}

          {/* Check Out button for today's reservations */}
          {canCheckOut && (
            <button type="button" onClick={() => { onClose(); onCheckOut(res.plate); }}
              style={{ display:"block",width:"100%",textAlign:"center",marginTop:16,padding:"11px",fontSize:14,fontWeight:600,background:"var(--green)",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit" }}>
              🚗 Check Out from Fleet
            </button>
          )}
          {(isToday || isActive) && !res.plate && (
            <div style={{ marginTop:12,padding:"10px",background:"var(--amber-bg)",border:"1px solid var(--amber-border)",borderRadius:8,fontSize:13,color:"var(--amber)",textAlign:"center" }}>
              ⚠️ No car assigned yet
              <button type="button" onClick={() => onAssignPlate(res)}
                style={{ display:"block",width:"100%",marginTop:8,padding:"8px",fontSize:13,fontWeight:600,background:"var(--amber)",color:"#fff",border:"none",borderRadius:6,cursor:"pointer" }}>
                Assign a Plate Now
              </button>
            </div>
          )}

          {canEditThis && !isCancelled && (
            <div style={{ display:"flex",gap:8,marginTop:12 }}>
              <button type="button" style={{ ...S.btn,background:"var(--amber)",flex:1 }} onClick={onEdit}>✏️ Edit</button>
              <button type="button" style={{ ...S.btn,background:"#7f1d1d",flex:1 }} onClick={() => setShowCancel(true)}>✕ Cancel</button>
              {canEdit && (
                <button type="button" style={{ ...S.btn,background:"var(--red)",flex:1,opacity:deleting?0.65:1 }} onClick={handleDelete} disabled={deleting}>
                  {deleting?"Deleting…":"🗑 Delete"}
                </button>
              )}
            </div>
          )}
          {canEdit && isCancelled && (
            <div style={{ display:"flex",gap:8,marginTop:12 }}>
              <button type="button" style={{ ...S.btn,background:"var(--red)",flex:1,opacity:deleting?0.65:1 }} onClick={handleDelete} disabled={deleting}>
                {deleting?"Deleting…":"🗑 Delete"}
              </button>
            </div>
          )}
        </div>
      </div>

      {showCancel && (
        <CancelModal res={res} staffName={staffName}
          onClose={() => setShowCancel(false)}
          onCancelled={() => { setShowCancel(false); onCancelled(); }}
        />
      )}
    </div>
  );
}

// ── Cancel Modal ──────────────────────────────────────────────
function CancelModal({ res, staffName, onClose, onCancelled }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleCancel = async () => {
    if (!reason.trim()) { setErr("Please provide a reason for cancelling."); return; }
    setSaving(true); setErr("");
    try {
      await api.cancelReservation({ id: res.id, reason, staffName });
      onCancelled();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={{ ...S.overlay, zIndex: 120 }} onClick={onClose}>
      <div style={{ ...S.modal, width: 380 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "#7f1d1d" }}>
          <p style={S.mTitle}>Cancel Reservation</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>
            Cancelling <strong>{res.client}</strong>'s reservation. This keeps a record — it won't be deleted, just marked cancelled.
          </p>
          <div style={S.field}>
            <label style={S.label}>Reason *</label>
            <textarea style={S.textarea} rows={3} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Why is this being cancelled…" autoFocus />
          </div>
          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "#7f1d1d", opacity: saving ? 0.65 : 1 }} onClick={handleCancel} disabled={saving}>
            {saving ? "Cancelling…" : "Confirm Cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ───────────────────────────────────────────────
function EditModal({ res, fleet, fleetTypes, staffName, onClose, onSaved }) {
  const isTransfer = res.bookingType === "Transfer";
  const [form, setForm] = useState({
    client:       res.client       ||"",
    phone:        res.phone        ||"",
    plate:        res.plate        ||"",
    carType:      res.carType      ||"",
    pickupDate:   res.pickupDate   ||"",
    returnDate:   res.returnDate   ||"",
    pickUpFrom:   res.pickUpFrom   ||"",
    pickUpCity:   res.pickUpCity   ||"",
    remarks:      res.remarks      ||"",
    dropOffTo:    res.dropOffTo    ||"",
    dropOffCity:  res.dropOffCity  ||"",
    transferDate: res.transferDate ||"",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = async () => {
    if (!form.client.trim()) { setErr("Client name is required."); return; }
    if (isTransfer) {
      if (!form.transferDate) { setErr("Transfer date is required."); return; }
    } else {
      if (!form.pickupDate)    { setErr("Pickup date is required."); return; }
      if (!form.returnDate)    { setErr("Return date is required."); return; }
      if (form.returnDate <= form.pickupDate) { setErr("Return date must be after pickup date."); return; }
    }
    setSaving(true); setErr("");
    try { await api.editReservation({ id:res.id, bookingType:res.bookingType, ...form, staffName }); onSaved(); }
    catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ ...S.mHead,background:"var(--sc-blue)" }}>
          <div><p style={S.mTitle}>Edit {isTransfer ? "Transfer" : "Reservation"}</p></div>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Client Name *</label>
            <input style={S.input} value={form.client} onChange={e=>set("client",e.target.value)} onBlur={e=>set("client",toTitleCase(e.target.value))} autoFocus /></div>
          <div style={S.field}><label style={S.label}>Contact No.</label>
            <input style={S.input} value={form.phone} onChange={e=>set("phone",e.target.value)} /></div>

          <div style={{ height:1,background:"var(--border-light)",margin:"4px 0 12px" }} />

          <div style={S.field}><label style={S.label}>Plate No. <span style={{ color:"var(--text-faint)",fontWeight:400 }}>(optional)</span></label>
            <PlateSearch fleet={fleet} value={form.plate} carType={form.carType}
              onChange={(plate,type) => { set("plate",plate); if(type) set("carType",type); }} />
          </div>
          <div style={S.field}><label style={S.label}>Car Type{isTransfer?"":" *"}</label>
            <TypeSearch fleetTypes={fleetTypes||[]} value={form.carType}
              onChange={type => set("carType", type)} />
          </div>

          {isTransfer ? (
            <>
              <div style={S.field}><label style={S.label}>Pick Up From</label>
                <LocationPicker city={form.pickUpCity} location={form.pickUpFrom}
                  onCityChange={c => set("pickUpCity", c)} onLocationChange={l => set("pickUpFrom", l)} /></div>
              <div style={S.field}><label style={S.label}>Drop Off To</label>
                <LocationPicker city={form.dropOffCity} location={form.dropOffTo}
                  onCityChange={c => set("dropOffCity", c)} onLocationChange={l => set("dropOffTo", l)} /></div>
              <div style={S.field}><label style={S.label}>Transfer Date *</label>
                <input style={S.input} type="date" value={form.transferDate} onChange={e=>set("transferDate",e.target.value)} /></div>
            </>
          ) : (
            <>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Pickup Date *</label>
                  <input style={S.input} type="date" value={form.pickupDate} onChange={e=>set("pickupDate",e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Return Date *</label>
                  <input style={S.input} type="date" value={form.returnDate} min={form.pickupDate} onChange={e=>set("returnDate",e.target.value)} /></div>
              </div>
              <div style={S.field}><label style={S.label}>Pick Up Location</label>
                <LocationPicker city={form.pickUpCity} location={form.pickUpFrom}
                  onCityChange={c => set("pickUpCity", c)} onLocationChange={l => set("pickUpFrom", l)} /></div>
            </>
          )}

          <div style={S.field}><label style={S.label}>Remarks</label>
            <textarea style={S.textarea} rows={2} value={form.remarks} onChange={e=>set("remarks",e.target.value)} /></div>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn,background:"var(--sc-blue)",opacity:saving?0.65:1 }} onClick={handleSave} disabled={saving}>
            {saving?"Saving…":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  center:  { textAlign:"center",padding:"3rem",color:"var(--text-muted)" },
  navBtn:  { padding:"6px 14px",fontSize:18,border:"1.5px solid var(--border)",borderRadius:8,background:"var(--surface)",cursor:"pointer",color:"var(--text)",fontWeight:600 },
  board:   { background:"var(--surface)",border:"1px solid var(--border)",borderRadius:12,overflow:"hidden" },
  row:     { display:"flex",alignItems:"flex-start",borderBottom:"1px solid var(--border-light)",minHeight:48 },
  dayNum:  { width:52,flexShrink:0,padding:"12px 0 12px 16px",fontSize:16,lineHeight:1.2 },
  slots:   { display:"flex",flexWrap:"wrap",gap:6,padding:"8px 10px",flex:1,alignItems:"center" },
  card:    { borderRadius:6,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",fontSize:12,gap:4,boxShadow:"var(--shadow-sm)" },
  addSlot: { background:"none",border:"1.5px dashed var(--border)",borderRadius:6,color:"var(--text-faint)",width:28,height:28,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0 },
  overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 },
  modal:   { background:"var(--surface)",borderRadius:14,width:460,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"var(--shadow-lg)" },
  mHead:   { padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start" },
  mTitle:  { fontSize:16,fontWeight:700,color:"#fff",margin:0 },
  mSub:    { fontSize:12,color:"rgba(255,255,255,0.8)",margin:"2px 0 0" },
  closeBtn:{ background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 },
  mBody:   { padding:"1.25rem" },
  field:   { marginBottom:"0.85rem" },
  two:     { display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 },
  label:   { fontSize:12,fontWeight:500,color:"var(--text-muted)",display:"block",marginBottom:4 },
  input:   { width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid var(--border)",borderRadius:7,background:"var(--surface)",color:"var(--text)",boxSizing:"border-box",fontFamily:"inherit" },
  textarea:{ width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid var(--border)",borderRadius:7,background:"var(--surface)",color:"var(--text)",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box" },
  readOnly:{ padding:"9px 11px",fontSize:13,background:"var(--bg)",borderRadius:7,color:"var(--text-muted)",border:"1.5px solid var(--border)" },
  btn:     { width:"100%",padding:"11px",fontSize:14,fontWeight:600,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",marginTop:4,fontFamily:"inherit" },
  err:     { color:"var(--red)",fontSize:13,margin:"6px 0" },
};
