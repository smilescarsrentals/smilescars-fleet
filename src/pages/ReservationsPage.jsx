import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const COLORS  = ["#3b82f6","#16a34a","#d97706","#dc2626","#7c3aed","#0284c7","#be185d","#b45309"];

function colorFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function pad(n) { return String(n).padStart(2,"0"); }
function fmtDate(d) {
  if (!d) return "—";
  const [y,m,dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}

export default function ReservationsPage({ staffName, role }) {
  const canEdit = role === "Admin" || role === "Manager";
  const today   = new Date();
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  const [year,         setYear]         = useState(today.getFullYear());
  const [month,        setMonth]        = useState(today.getMonth() + 1);
  const [reservations, setReservations] = useState([]);
  const [fleet,        setFleet]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showAdd,      setShowAdd]      = useState(null); // day number
  const [showDetail,   setShowDetail]   = useState(null);
  const [showEdit,     setShowEdit]     = useState(null);

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

  // Group by pickup day (show card on pickup date row)
  const byDay = useMemo(() => {
    const map = {};
    reservations.forEach(r => {
      if (!r.pickupDate) return;
      const [y, m, d] = r.pickupDate.split("-").map(Number);
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
          <h2 style={{ fontSize:20,fontWeight:700,color:"#111",margin:0 }}>Reservations Board</h2>
          <p style={{ fontSize:13,color:"#888",margin:"4px 0 0" }}>{reservations.length} reservations this month</p>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <button onClick={prevMonth} style={S.navBtn}>‹</button>
          <span style={{ fontSize:16,fontWeight:700,color:"#111",minWidth:160,textAlign:"center" }}>{MONTHS[month-1]} {year}</span>
          <button onClick={nextMonth} style={S.navBtn}>›</button>
          <button onClick={()=>{setMonth(today.getMonth()+1);setYear(today.getFullYear());}} style={{ ...S.navBtn,fontSize:12,padding:"6px 12px" }}>Today</button>
        </div>
      </div>

      {loading ? <div style={S.center}>Loading…</div> : (
        <div style={S.board}>
          {Array.from({length:days},(_,i)=>i+1).map(day => {
            const slots   = byDay[day] || [];
            const isToday = day === todayDay;
            const dateStr = `${year}-${pad(month)}-${pad(day)}`;
            const isPast  = dateStr < todayStr;
            return (
              <div key={day} style={{ ...S.row, background:isToday?"#f0fdf4":isPast?"#fafafa":"#fff", borderLeft:isToday?"3px solid #16a34a":"3px solid transparent" }}>
                <div style={{ ...S.dayNum,color:isToday?"#16a34a":isPast?"#ccc":"#111",fontWeight:isToday?800:600 }}>
                  {pad(day)}
                  {isToday && <div style={{ fontSize:9,color:"#16a34a",fontWeight:700,letterSpacing:".5px" }}>TODAY</div>}
                </div>
                <div style={S.slots}>
                  {slots.map(r => (
                    <div key={r.id} style={{ ...S.card, borderLeft:`3px solid ${colorFor(r.plate||r.client)}` }}
                      onClick={() => setShowDetail(r)}>
                      <span style={{ fontWeight:600,fontSize:12 }}>{r.client}</span>
                      {r.plate && <span style={{ fontSize:11,color:"#888",marginLeft:5 }}>· {r.plate}</span>}
                      {r.returnDate && <span style={{ fontSize:11,color:"#aaa",marginLeft:5 }}>→ {fmtDate(r.returnDate)}</span>}
                    </div>
                  ))}
                  <button style={S.addSlot} onClick={() => setShowAdd(day)} title="Add reservation">+</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd    && <AddModal    day={showAdd}    month={month} year={year} staffName={staffName} fleet={fleet} onClose={()=>setShowAdd(null)}    onSaved={()=>{setShowAdd(null);load();}} />}
      {showDetail && <DetailModal res={showDetail} canEdit={canEdit} onClose={()=>setShowDetail(null)} onEdit={()=>{setShowEdit(showDetail);setShowDetail(null);}} onDeleted={()=>{setShowDetail(null);load();}} />}
      {showEdit   && <EditModal   res={showEdit}   fleet={fleet}  onClose={()=>setShowEdit(null)}   onSaved={()=>{setShowEdit(null);load();}} />}
    </div>
  );
}

// ── Plate Search ─────────────────────────────────────────────
function PlateSearch({ fleet, value, carType, onChange }) {
  const [query, setQuery]   = useState(value || "");
  const [open,  setOpen]    = useState(false);

  const filtered = query.trim().length > 0
    ? fleet.filter(c => c.plate.toLowerCase().replace(/\s/g,"").includes(query.toLowerCase().replace(/\s/g,"")))
    : [];

  const select = (car) => { onChange(car.plate, car.type); setQuery(car.plate); setOpen(false); };

  return (
    <div style={{ position:"relative" }}>
      <input style={{ ...S.input, background: value ? "#f5f3ff" : "#fff", paddingRight: value ? 32 : 11 }}
        placeholder="Type plate number…" value={query} autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange("",""); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(()=>setOpen(false),150)} />
      {value && <span style={{ position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",color:"#7c3aed",fontWeight:700 }}>✓</span>}
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:8,boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:50,maxHeight:200,overflowY:"auto" }}>
          {filtered.slice(0,15).map(c => (
            <div key={c.plate} style={{ padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #f3f4f6",display:"flex",justifyContent:"space-between" }}
              onMouseDown={() => select(c)}>
              <span style={{ fontWeight:600 }}>{c.plate}</span>
              <span style={{ color:"#888" }}>{c.type} · {c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add Modal ────────────────────────────────────────────────
function AddModal({ day, month, year, staffName, fleet, onClose, onSaved }) {
  const pickupStr = `${year}-${pad(month)}-${pad(day)}`;
  const [form, setForm] = useState({ client:"", phone:"", plate:"", carType:"", pickupDate:pickupStr, returnDate:"", pickUpFrom:"", remarks:"" });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const displayDate = `${pad(day)} ${MONTHS_SHORT[month-1]} ${year}`;

  const handleSave = async () => {
    if (!form.client.trim())   { setErr("Client name is required."); return; }
    if (!form.pickupDate)      { setErr("Pickup date is required."); return; }
    if (!form.returnDate)      { setErr("Return date is required."); return; }
    if (form.returnDate <= form.pickupDate) { setErr("Return date must be after pickup date."); return; }
    setSaving(true); setErr("");
    try {
      await api.addReservation({ ...form, staffName });
      onSaved();
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ ...S.mHead,background:"#7c3aed" }}>
          <div><p style={S.mTitle}>New Reservation</p><p style={S.mSub}>{displayDate}</p></div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Staff</label><div style={S.readOnly}>{staffName}</div></div>

          <div style={S.field}><label style={S.label}>Client Name *</label>
            <input style={S.input} value={form.client} onChange={e=>set("client",e.target.value)} placeholder="Full name" autoFocus /></div>
          <div style={S.field}><label style={S.label}>Contact No.</label>
            <input style={S.input} value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="+255..." /></div>

          <div style={{ height:1,background:"#f3f4f6",margin:"4px 0 12px" }} />

          <div style={S.field}><label style={S.label}>Plate No.</label>
            <PlateSearch fleet={fleet} value={form.plate} carType={form.carType}
              onChange={(plate,type) => { set("plate",plate); set("carType",type); }} />
          </div>
          <div style={S.field}><label style={S.label}>Car Type</label>
            <div style={{ ...S.readOnly, color: form.carType?"#111":"#aaa" }}>{form.carType||"Auto-filled from plate"}</div>
          </div>

          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Pickup Date *</label>
              <input style={S.input} type="date" value={form.pickupDate} onChange={e=>set("pickupDate",e.target.value)} /></div>
            <div style={S.field}><label style={S.label}>Return Date *</label>
              <input style={S.input} type="date" value={form.returnDate} min={form.pickupDate} onChange={e=>set("returnDate",e.target.value)} /></div>
          </div>

          <div style={S.field}><label style={S.label}>Pick Up Location</label>
            <input style={S.input} value={form.pickUpFrom} onChange={e=>set("pickUpFrom",e.target.value)} placeholder="e.g. Airport, Hotel name" /></div>
          <div style={S.field}><label style={S.label}>Remarks</label>
            <textarea style={S.textarea} rows={2} value={form.remarks} onChange={e=>set("remarks",e.target.value)} placeholder="Any special notes…" /></div>

          {err && <p style={S.err}>{err}</p>}
          <button style={{ ...S.btn,background:"#7c3aed",opacity:saving?0.65:1 }} onClick={handleSave} disabled={saving}>
            {saving?"Saving…":"Add Reservation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Modal ─────────────────────────────────────────────
function DetailModal({ res, canEdit, onClose, onEdit, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const color = colorFor(res.plate||res.client);

  const handleDelete = async () => {
    if (!window.confirm("Delete this reservation?")) return;
    setDeleting(true);
    try { await api.deleteReservation({id:res.id}); onDeleted(); }
    catch(e) { alert(e.message); setDeleting(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ ...S.mHead,background:color }}>
          <div>
            <p style={S.mTitle}>{res.client}</p>
            <p style={S.mSub}>{res.plate ? `${res.plate} · ` : ""}{fmtDate(res.pickupDate)} → {fmtDate(res.returnDate)}</p>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          {[
            ["Client",       res.client],
            ["Contact No.",  res.phone      ||"—"],
            ["Plate No.",    res.plate      ||"—"],
            ["Car Type",     res.carType    ||"—"],
            ["Pickup Date",  fmtDate(res.pickupDate)],
            ["Return Date",  fmtDate(res.returnDate)],
            ["Pick Up From", res.pickUpFrom ||"—"],
            ["Remarks",      res.remarks    ||"—"],
            ["Added by",     res.staffName  ||"—"],
          ].map(([label,val])=>(
            <div key={label} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f3f4f6",fontSize:13 }}>
              <span style={{ fontWeight:600,color:"#888",fontSize:12,textTransform:"uppercase",letterSpacing:".3px",flexShrink:0 }}>{label}</span>
              <span style={{ color:"#111",textAlign:"right",marginLeft:12 }}>{val}</span>
            </div>
          ))}
          {canEdit && (
            <div style={{ display:"flex",gap:8,marginTop:16 }}>
              <button style={{ ...S.btn,background:"#f59e0b",flex:1 }} onClick={onEdit}>✏️ Edit</button>
              <button style={{ ...S.btn,background:"#dc2626",flex:1,opacity:deleting?0.65:1 }} onClick={handleDelete} disabled={deleting}>
                {deleting?"Deleting…":"🗑 Delete"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Edit Modal ───────────────────────────────────────────────
function EditModal({ res, fleet, onClose, onSaved }) {
  const [form, setForm] = useState({
    client:     res.client     ||"",
    phone:      res.phone      ||"",
    plate:      res.plate      ||"",
    carType:    res.carType    ||"",
    pickupDate: res.pickupDate ||"",
    returnDate: res.returnDate ||"",
    pickUpFrom: res.pickUpFrom ||"",
    remarks:    res.remarks    ||"",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = async () => {
    if (!form.client.trim()) { setErr("Client name is required."); return; }
    if (!form.pickupDate)    { setErr("Pickup date is required."); return; }
    if (!form.returnDate)    { setErr("Return date is required."); return; }
    if (form.returnDate <= form.pickupDate) { setErr("Return date must be after pickup date."); return; }
    setSaving(true); setErr("");
    try { await api.editReservation({ id:res.id, ...form }); onSaved(); }
    catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ ...S.mHead,background:"#7c3aed" }}>
          <div><p style={S.mTitle}>Edit Reservation</p></div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Client Name *</label>
            <input style={S.input} value={form.client} onChange={e=>set("client",e.target.value)} autoFocus /></div>
          <div style={S.field}><label style={S.label}>Contact No.</label>
            <input style={S.input} value={form.phone} onChange={e=>set("phone",e.target.value)} /></div>

          <div style={{ height:1,background:"#f3f4f6",margin:"4px 0 12px" }} />

          <div style={S.field}><label style={S.label}>Plate No.</label>
            <PlateSearch fleet={fleet} value={form.plate} carType={form.carType}
              onChange={(plate,type) => { set("plate",plate); set("carType",type); }} />
          </div>
          <div style={S.field}><label style={S.label}>Car Type</label>
            <div style={{ ...S.readOnly, color: form.carType?"#111":"#aaa" }}>{form.carType||"Auto-filled from plate"}</div>
          </div>

          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Pickup Date *</label>
              <input style={S.input} type="date" value={form.pickupDate} onChange={e=>set("pickupDate",e.target.value)} /></div>
            <div style={S.field}><label style={S.label}>Return Date *</label>
              <input style={S.input} type="date" value={form.returnDate} min={form.pickupDate} onChange={e=>set("returnDate",e.target.value)} /></div>
          </div>
          <div style={S.field}><label style={S.label}>Pick Up Location</label>
            <input style={S.input} value={form.pickUpFrom} onChange={e=>set("pickUpFrom",e.target.value)} /></div>
          <div style={S.field}><label style={S.label}>Remarks</label>
            <textarea style={S.textarea} rows={2} value={form.remarks} onChange={e=>set("remarks",e.target.value)} /></div>

          {err && <p style={S.err}>{err}</p>}
          <button style={{ ...S.btn,background:"#7c3aed",opacity:saving?0.65:1 }} onClick={handleSave} disabled={saving}>
            {saving?"Saving…":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  center:  { textAlign:"center",padding:"3rem",color:"#666" },
  navBtn:  { padding:"6px 14px",fontSize:18,border:"1.5px solid #e5e7eb",borderRadius:8,background:"#fff",cursor:"pointer",color:"#374151",fontWeight:600 },
  board:   { background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,overflow:"hidden" },
  row:     { display:"flex",alignItems:"flex-start",borderBottom:"1px solid #f3f4f6",minHeight:48 },
  dayNum:  { width:52,flexShrink:0,padding:"12px 0 12px 16px",fontSize:16,lineHeight:1.2 },
  slots:   { display:"flex",flexWrap:"wrap",gap:6,padding:"8px 10px",flex:1,alignItems:"center" },
  card:    { background:"#f5f3ff",borderRadius:6,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",fontSize:12,gap:4,boxShadow:"0 1px 3px rgba(0,0,0,0.06)" },
  addSlot: { background:"none",border:"1.5px dashed #d1d5db",borderRadius:6,color:"#9ca3af",width:28,height:28,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0 },
  overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 },
  modal:   { background:"#fff",borderRadius:14,width:460,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" },
  mHead:   { padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"flex-start" },
  mTitle:  { fontSize:16,fontWeight:700,color:"#fff",margin:0 },
  mSub:    { fontSize:12,color:"rgba(255,255,255,0.8)",margin:"2px 0 0" },
  closeBtn:{ background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 },
  mBody:   { padding:"1.25rem" },
  field:   { marginBottom:"0.85rem" },
  two:     { display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 },
  label:   { fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:4 },
  input:   { width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111",boxSizing:"border-box",fontFamily:"inherit" },
  textarea:{ width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box" },
  readOnly:{ padding:"9px 11px",fontSize:13,background:"#f3f4f6",borderRadius:7,color:"#555",border:"1.5px solid #e5e7eb" },
  btn:     { width:"100%",padding:"11px",fontSize:14,fontWeight:600,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",marginTop:4,fontFamily:"inherit" },
  err:     { color:"#dc2626",fontSize:13,margin:"6px 0" },
};
