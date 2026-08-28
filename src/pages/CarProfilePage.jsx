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
  return d.toLocaleDateString("en-TZ", { day:"2-digit", month:"short", year:"numeric" }) +
    " " + d.toLocaleTimeString("en-TZ", { hour:"2-digit", minute:"2-digit" });
}

const STATUS_COLORS = {
  Available:   { bg: "#dcfce7", color: "#15803d" },
  Rented:      { bg: "#fef9c3", color: "#854d0e" },
  Maintenance: { bg: "#ffedd5", color: "#c2410c" },
  "Staff Use": { bg: "#eff6ff", color: "#1d4ed8" },
  Sold:        { bg: "#fee2e2", color: "#b91c1c" },
};
const ACTION_COLORS = {
  "Checked Out":          { bg: "#fef9c3", color: "#854d0e" },
  "Returned":             { bg: "#dcfce7", color: "#15803d" },
  "Booking Extended":     { bg: "#e0f2fe", color: "#0369a1" },
  "Sent to Maintenance":  { bg: "#ffedd5", color: "#c2410c" },
  "Marked Available":     { bg: "#dcfce7", color: "#15803d" },
  "Location Updated":     { bg: "#f3f4f6", color: "#374151" },
  "Payment Updated":      { bg: "#ede9fe", color: "#6d28d9" },
  "Sold":                 { bg: "#fee2e2", color: "#b91c1c" },
  "Note Added":           { bg: "#f0fdf4", color: "#15803d" },
};

function fuelVal(val) {
  if (!val) return null;
  const s = String(val);
  // Only hide ISO datetime strings like "2026-03-31T21:00:00.000Z"
  if (s.match(/^\d{4}-\d{2}-\d{2}T/)) return null;
  return s;
}

export default function CarProfilePage({ staffName, role }) {
  const { plate }  = useParams();
  const navigate   = useNavigate();
  const decodedPlate = decodeURIComponent(plate);
  const canSeeFullProfile = role === "Admin" || role === "Manager";

  const [car,        setCar]        = useState(null);
  const [history,    setHistory]    = useState([]);
  const [fuel,       setFuel]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [note,       setNote]       = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteToast,  setNoteToast]  = useState("");
  const [activeTab,  setActiveTab]  = useState("overview");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const fleetRes = await api.getCarByPlate(decodedPlate);
      if (!fleetRes.success) { setError(fleetRes.error || `Car "${decodedPlate}" not found.`); setLoading(false); return; }
      setCar(fleetRes.data);
      if (canSeeFullProfile) {
        const histRes = await api.getCarHistory(decodedPlate);
        setHistory(histRes.data || []);
        const fuelRes = await api.getFuelByPlate(decodedPlate);
        setFuel(fuelRes.data || []);
      }
    } catch (e) { setError("Failed to load car profile: " + e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [decodedPlate]);

  const [selectedRental, setSelectedRental] = useState(null);

  const stats = useMemo(() => {
    const rentals = history.filter(h => h.action === "Checked Out");
    const maintenance = history.filter(h => h.action === "Sent to Maintenance");
    const totalRev = {};
    rentals.forEach(h => {
      if (h.amount) { const c = h.currency||"TZS"; totalRev[c] = (totalRev[c]||0) + (Number(h.amount)||0); }
    });
    return { totalRentals: rentals.length, maintenance: maintenance.length, totalRev, lastRental: rentals[0] };
  }, [history]);

  const rentalHistory     = useMemo(() => history.filter(h => ["Checked Out","Returned","Booking Extended"].includes(h.action)), [history]);
  const maintenanceHistory = useMemo(() => history.filter(h => ["Sent to Maintenance","Marked Available"].includes(h.action)), [history]);
  const noteHistory        = useMemo(() => history.filter(h => h.action === "Note Added"), [history]);

  // Average KM per fueling: gap between consecutive odometer readings across
  // fill-ups. Sorted ascending by KM (not by date — a few rows have the same
  // date but different KM) so this is resilient to fuel log rows being
  // entered out of chronological order. Non-positive gaps are skipped —
  // that's a duplicate entry (same KM re-logged) or a bad/rolled-back
  // odometer reading, not a real distance travelled.
  const avgKmPerFueling = useMemo(() => {
    const kms = fuel.map(f => f.currentKm).filter(k => typeof k === "number" && !Number.isNaN(k)).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < kms.length; i++) {
      const gap = kms[i] - kms[i - 1];
      if (gap > 0) gaps.push(gap);
    }
    if (!gaps.length) return null;
    return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }, [fuel]);


  const handleSaveNote = async () => {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await api.addCarNote({ plate: decodedPlate, type: car?.type||"", note: note.trim(), staffName });
      setNote(""); setNoteToast("✅ Note saved");
      setTimeout(() => setNoteToast(""), 3000);
      await load();
    } catch (e) { setNoteToast("❌ " + e.message); setTimeout(() => setNoteToast(""), 3000); }
    finally { setSavingNote(false); }
  };

  if (loading) return <div style={S.center}>Loading car profile…</div>;
  if (error)   return <div style={S.center}><p style={{ color:"#dc2626" }}>{error}</p><button onClick={()=>navigate("/fleet")} style={S.backBtn}>← Back to Fleet</button></div>;
  if (!car)    return null;

  const ss = STATUS_COLORS[car.status] || STATUS_COLORS.Available;

  const docButtons = (large) => (
    <>
      {car.regCardUrl
        ? <a href={car.regCardUrl} target="_blank" rel="noopener noreferrer" style={large ? S.docBtnLarge : S.docBtn}>📄 {large?"Registration Card":"Reg Card"}</a>
        : <span style={large ? S.docBtnLargeOff : S.docBtnDisabled}>📄 {large?"No Registration Card":"No Reg Card"}</span>}
      {car.photosUrl
        ? <a href={car.photosUrl} target="_blank" rel="noopener noreferrer" style={large ? {...S.docBtnLarge,background:"#eff6ff",color:"#2563eb",borderColor:"#bfdbfe"} : {...S.docBtn,background:"#eff6ff",color:"#2563eb",borderColor:"#bfdbfe"}}>📷 {large?"Car Photos":"Photos"}</a>
        : <span style={large ? S.docBtnLargeOff : S.docBtnDisabled}>📷 No Photos</span>}
      <button style={large ? {...S.docBtnLarge,background:"#fff7ed",color:"#c2410c",borderColor:"#fed7aa",cursor:"pointer",border:"1.5px solid #fed7aa"} : {...S.docBtn,background:"#fff7ed",color:"#c2410c",borderColor:"#fed7aa",cursor:"pointer"}}
        onClick={() => { navigator.clipboard.writeText(car.plate).catch(()=>{}); window.open("https://tms.tpf.go.tz","_blank"); }}>
        🚔 {large?"Check TMS Fines":"TMS Fines"}
      </button>
      <button style={large ? {...S.docBtnLarge,background:"#fefce8",color:"#854d0e",borderColor:"#fde68a",cursor:"pointer",border:"1.5px solid #fde68a"} : {...S.docBtn,background:"#fefce8",color:"#854d0e",borderColor:"#fde68a",cursor:"pointer"}}
        onClick={() => { navigator.clipboard.writeText(car.plate).catch(()=>{}); window.open("https://tausi.tamisemi.go.tz/#/taxpayer/parking","_blank"); }}>
        🅿️ {large?"Check Parking Fines":"Parking Fines"}
      </button>
    </>
  );

  // ── Staff View ──
  if (!canSeeFullProfile) {
    return (
      <div>
        <button style={S.backBtn} onClick={() => navigate("/fleet")}>← Back to Fleet</button>
        <div style={S.staffCard}>
          <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16 }}>
            <div>
              <div style={S.plateHero}>{car.plate}</div>
              <div style={S.typeHero}>{car.type}</div>
              <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap" }}>
                <span style={{ ...S.badge,background:ss.bg,color:ss.color }}>{car.status}</span>
                {car.location && <span style={S.locChip}>📍 {car.location}</span>}
                {car.driver   && <span style={S.locChip}>🚗 {car.driver}</span>}
              </div>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>{docButtons(true)}</div>
          </div>
          {car.status==="Rented" && car.currentClient && (
            <div style={S.staffRentalBox}>
              <div style={{ fontWeight:600,fontSize:14,color:"#111",marginBottom:8 }}>Current Rental</div>
              {[["Client",car.currentClient],["Phone",car.clientPhone],["Booked From",fmtDate(car.bookedFrom)],["Return Date",fmtDate(car.returnDate)],["Payment",car.paymentStatus]].map(([label,val])=>val?(
                <div key={label} style={S.staffInfoRow}>
                  <span style={S.staffInfoLabel}>{label}</span>
                  <span style={label==="Payment"?{fontWeight:600,color:car.paymentStatus==="Unpaid"?"#b91c1c":"#15803d"}:{}}>{val}</span>
                </div>
              ):null)}
            </div>
          )}
          {car.status==="Staff Use" && car.currentClient && (
            <div style={{ ...S.staffRentalBox, background:"#eff6ff", border:"1px solid #bfdbfe" }}>
              <div style={{ fontWeight:600,fontSize:14,color:"#1d4ed8",marginBottom:4 }}>👤 Assigned to Staff</div>
              <div style={S.staffInfoRow}><span style={S.staffInfoLabel}>Staff Member</span><span style={{ fontWeight:600 }}>{car.currentClient}</span></div>
              {car.location && <div style={S.staffInfoRow}><span style={S.staffInfoLabel}>Location</span><span>{car.location}</span></div>}
              {car.remarks && <div style={S.staffInfoRow}><span style={S.staffInfoLabel}>Remarks</span><span>{car.remarks}</span></div>}
            </div>
          )}
          {car.status==="Maintenance" && car.garage && (
            <div style={S.staffRentalBox}>
              <div style={{ fontWeight:600,fontSize:14,color:"#c2410c",marginBottom:4 }}>🔧 In Maintenance</div>
              <div style={S.staffInfoRow}><span style={S.staffInfoLabel}>Garage</span><span>{car.garage}</span></div>
              {car.remarks && <div style={S.staffInfoRow}><span style={S.staffInfoLabel}>Remarks</span><span>{car.remarks}</span></div>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Admin / Manager Full Profile ──
  return (
    <div>
      <button style={S.backBtn} onClick={() => navigate("/fleet")}>← Back to Fleet</button>
      <div style={S.heroCard}>
        <div style={S.heroLeft}>
          <div style={S.plateHero}>{car.plate}</div>
          <div style={S.typeHero}>{car.type}</div>
          <div style={{ display:"flex",gap:8,marginTop:10,flexWrap:"wrap" }}>
            <span style={{ ...S.badge,background:ss.bg,color:ss.color }}>{car.status}</span>
            {car.location && <span style={S.locChip}>📍 {car.location}</span>}
            {car.driver   && <span style={S.locChip}>🚗 {car.driver}</span>}
          </div>
        </div>
        <div style={S.heroStats}>
          <div style={S.statBox}><div style={S.statVal}>{stats.totalRentals}</div><div style={S.statLbl}>Total Rentals</div></div>
          <div style={S.statBox}><div style={S.statVal}>{stats.maintenance}</div><div style={S.statLbl}>Maintenance Trips</div></div>
          <div style={S.statBox}>
            <div style={{ fontSize:13,fontWeight:700,color:"#15803d" }}>
              {Object.entries(stats.totalRev).map(([c,v]) => <div key={c}>{c} {v.toLocaleString("en-US")}</div>)}
              {Object.keys(stats.totalRev).length===0 && <div style={{ color:"#aaa" }}>—</div>}
            </div>
            <div style={S.statLbl}>Total Revenue</div>
          </div>
          {stats.lastRental && <div style={S.statBox}><div style={S.statVal}>{fmtDate(stats.lastRental.bookedFrom)}</div><div style={S.statLbl}>Last Rental</div></div>}
        </div>
        <div style={S.docLinks}>{docButtons(false)}</div>
      </div>

      {car.status==="Rented" && car.currentClient && (
        <div style={S.rentalBanner}>
          <div><span style={{ fontWeight:600 }}>Currently rented to: </span>{car.currentClient}
            {car.clientPhone && <span style={{ color:"#888",marginLeft:8 }}>{car.clientPhone}</span>}
          </div>
          <div style={{ fontSize:13,color:"#555" }}>
            {fmtDate(car.bookedFrom)} → {fmtDate(car.returnDate)}
            {car.paymentStatus && <span style={{ marginLeft:12,fontWeight:600,color:car.paymentStatus==="Unpaid"?"#b91c1c":"#15803d" }}>{car.paymentStatus}</span>}
          </div>
        </div>
      )}
      {car.status==="Staff Use" && car.currentClient && (
        <div style={{ ...S.rentalBanner, background:"#eff6ff", border:"1px solid #bfdbfe", color:"#1d4ed8" }}>
          <div><span style={{ fontWeight:600 }}>👤 Currently assigned to: </span>{car.currentClient}</div>
          <div style={{ fontSize:13 }}>{car.location && `📍 ${car.location}`}</div>
        </div>
      )}

      <div style={S.tabs}>
        {[
          { id:"overview",    label:"Overview" },
          { id:"history",     label:`Rentals Log (${rentalHistory.length})` },
          { id:"statuslog",   label:`Maintenance Log (${maintenanceHistory.length})` },
          { id:"garage",      label:"Garage Updates" },
          { id:"fuel",        label:`Fuel (${fuel.length})` },
          { id:"notes",       label:`Notes (${noteHistory.length})` },
          { id:"tracking",    label:"Tracking" },
        ].map(t => (
          <button key={t.id} style={{ ...S.tab,...(activeTab===t.id?S.tabActive:{}) }} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {activeTab==="overview" && (
        <div style={S.tabContent}>
          <div style={{ display:"flex", flexDirection:"column" }}>
            {[
              ["Plate",car.plate],["Type",car.type],["Status",car.status],["Location",car.location||"—"],
              ["Driver",car.driver||"—"],["Fuel Out",fuelVal(car.fuelOut)||"—"],["KM Out",car.kmOut?Number(car.kmOut).toLocaleString("en-US"):"—"],
              ["Avg KM per Fueling",avgKmPerFueling!=null?`${avgKmPerFueling.toLocaleString("en-US")} km`:"—"],
              ["Current Client",car.currentClient||"—"],["Client Phone",car.clientPhone||"—"],
              ["Booked From",fmtDate(car.bookedFrom)],["Return Date",fmtDate(car.returnDate)],
              ["Payment Status",car.paymentStatus||"—"],["Amount",car.amount?fmtMoney(car.amount,car.currency):"—"],
              ["Garage",car.garage||"—"],["Remarks",car.remarks||"—"],
            ].map(([label,value]) => (
              <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f3f4f6", gap:16 }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#888", textTransform:"uppercase", letterSpacing:".3px", flexShrink:0, minWidth:120 }}>{label}</div>
                <div style={{ fontSize:13, color:"#111", textAlign:"right" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab==="history" && (
        <div style={S.tabContent}>
          {selectedRental && (
            <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 }} onClick={()=>setSelectedRental(null)}>
              <div style={{ background:"#fff",borderRadius:14,width:460,maxWidth:"100%",maxHeight:"90vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }} onClick={e=>e.stopPropagation()}>
                <div style={{ padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",background:ACTION_COLORS[selectedRental.action]?.color||"#374151",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div>
                    <p style={{ fontSize:16,fontWeight:700,color:"#fff",margin:0 }}>{selectedRental.action}</p>
                    <p style={{ fontSize:12,color:"rgba(255,255,255,0.8)",margin:"2px 0 0" }}>{fmtDateTime(selectedRental.timestamp)}</p>
                  </div>
                  <button style={{ background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 }} onClick={()=>setSelectedRental(null)}>✕</button>
                </div>
                <div style={{ padding:"1.25rem" }}>
                  {[
                    ["Client",        selectedRental.client],
                    ["Phone",         selectedRental.clientPhone],
                    ["Booked From",   fmtDate(selectedRental.bookedFrom)],
                    ["Return Date",   fmtDate(selectedRental.returnDate)],
                    ["Location",      selectedRental.location],
                    ["Driver",        selectedRental.driver],
                    ["Fuel Out",      fuelVal(selectedRental.fuelOut)],
                    ["KM Out",        selectedRental.kmOut ? Number(selectedRental.kmOut).toLocaleString("en-US") + " km" : null],
                    ["Fuel In",       fuelVal(selectedRental.fuelIn)],
                    ["KM In",         selectedRental.kmIn  ? Number(selectedRental.kmIn).toLocaleString("en-US")  + " km" : null],
                    ["Amount",        selectedRental.amount ? fmtMoney(selectedRental.amount, selectedRental.currency) : null],
                    ["Payment Status",selectedRental.paymentStatus],
                    ["Amount Paid",   selectedRental.amountPaid ? fmtMoney(selectedRental.amountPaid, selectedRental.currency) : null],
                    ["Police Fine",   selectedRental.policeFine ? fmtMoney(selectedRental.policeFine, "TZS") : null],
                    ["Parking Fine",  selectedRental.parkingFine ? fmtMoney(selectedRental.parkingFine, "TZS") : null],
                    ["Staff",         selectedRental.staffName],
                    ["Remarks",       selectedRental.remarks],
                  ].filter(([,val]) => val).map(([label, val]) => (
                    <div key={label} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f3f4f6",fontSize:13,gap:12 }}>
                      <span style={{ fontSize:12,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:".3px",flexShrink:0 }}>{label}</span>
                      <span style={{ color:"#111",textAlign:"right" }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {rentalHistory.length===0 ? <p style={S.empty}>No rental history yet.</p> : (
            <div className="sc-table-wrap">
              <table style={S.table}>
                <thead><tr>{["Date","Action","Client","Booked From","Return Date","Amount","Payment","Driver","Staff"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rentalHistory.map((h,i) => {
                    const ac = ACTION_COLORS[h.action]||{bg:"#f3f4f6",color:"#374151"};
                    return (
                      <tr key={i} style={{ borderBottom:"1px solid #f3f4f6",cursor:"pointer" }}
                        onClick={() => setSelectedRental(h)}
                        onMouseEnter={e => e.currentTarget.style.background="#f9fafb"}
                        onMouseLeave={e => e.currentTarget.style.background=""}>
                        <td data-label="Date" style={{ ...S.td,fontSize:12,color:"#888" }}>{fmtDateTime(h.timestamp)}</td>
                        <td data-label="Action" style={S.td}><span style={{ ...S.badge,background:ac.bg,color:ac.color }}>{h.action}</span></td>
                        <td data-label="Client" style={{ ...S.td,fontWeight:500 }}>{h.client||"—"}</td>
                        <td data-label="Booked From" style={{ ...S.td,fontSize:12 }}>{fmtDate(h.bookedFrom)}</td>
                        <td data-label="Return Date" style={{ ...S.td,fontSize:12 }}>{fmtDate(h.returnDate)}</td>
                        <td data-label="Amount" style={{ ...S.td,fontSize:12 }}>{fmtMoney(h.amount,h.currency)}</td>
                        <td data-label="Payment" style={{ ...S.td,fontSize:12 }}>{h.paymentStatus||"—"}</td>
                        <td data-label="Driver" style={{ ...S.td,fontSize:12 }}>{h.driver||"—"}</td>
                        <td data-label="Staff" style={{ ...S.td,fontSize:12,color:"#555" }}>{h.staffName||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab==="statuslog" && (
        <div style={S.tabContent}>
          {maintenanceHistory.length===0 ? <p style={S.empty}>No maintenance history yet.</p> : (
            <div className="sc-table-wrap">
              <table style={S.table}>
                <thead><tr>{["Date","Action","Garage","Location","Remarks","Staff"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {maintenanceHistory.map((h,i) => {
                    const ac = ACTION_COLORS[h.action]||{bg:"#f3f4f6",color:"#374151"};
                    return (
                      <tr key={i} style={{ borderBottom:"1px solid #f3f4f6" }}>
                        <td data-label="Date" style={{ ...S.td,fontSize:12,color:"#888" }}>{fmtDateTime(h.timestamp)}</td>
                        <td data-label="Action" style={S.td}><span style={{ ...S.badge,background:ac.bg,color:ac.color }}>{h.action}</span></td>
                        <td data-label="Garage" style={{ ...S.td,color:"#c2410c",fontWeight:500 }}>{h.garage||"—"}</td>
                        <td data-label="Location" style={S.td}>{h.location||"—"}</td>
                        <td data-label="Remarks" style={{ ...S.td,fontSize:12,color:"#777" }}>{h.remarks||"—"}</td>
                        <td data-label="Staff" style={{ ...S.td,fontSize:12,color:"#555" }}>{h.staffName||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab==="garage" && (
        <div style={S.tabContent}>
          <CarMaintenanceTab plate={decodedPlate} />
        </div>
      )}

      {activeTab==="fuel" && (
        <div style={S.tabContent}>
          <FuelTab fuel={fuel} avgKm={avgKmPerFueling} />
        </div>
      )}

      {activeTab==="notes" && (
        <div style={S.tabContent}>
          {noteToast && <div style={S.toast}>{noteToast}</div>}
          <div style={S.noteBox}>
            <label style={{ fontSize:13,fontWeight:600,color:"#374151",display:"block",marginBottom:8 }}>Add a note about this car</label>
            <textarea style={S.noteInput} rows={3} value={note} onChange={e=>setNote(e.target.value)}
              placeholder="e.g. Tyres need replacing next service. AC making noise." />
            <button style={{ ...S.saveNoteBtn,opacity:savingNote||!note.trim()?0.65:1 }} onClick={handleSaveNote} disabled={savingNote||!note.trim()}>
              {savingNote?"Saving…":"Save Note"}
            </button>
          </div>
          {noteHistory.length===0
            ? <p style={S.empty}>No notes yet. Add one above.</p>
            : <div style={{ marginTop:"1.25rem" }}>
                {noteHistory.map((h,i) => (
                  <div key={i} style={S.noteCard}>
                    <div style={S.noteText}>{h.remarks}</div>
                    <div style={S.noteMeta}>{h.staffName} · {fmtDateTime(h.timestamp)}</div>
                  </div>
                ))}
              </div>}
        </div>
      )}

      {activeTab==="tracking" && <div style={S.tabContent}><TrackingTab plate={decodedPlate} /></div>}
    </div>
  );
}

// Fed data loaded by the parent (unlike TrackingTab/CarMaintenanceTab below,
// which fetch their own) — the average also needs to appear in Overview,
// which is always visible, so the fetch has to happen up front either way.
function isJunkAmount(a) {
  if (a === null || a === undefined || String(a).trim() === "") return true;
  return Number.isNaN(Number(a));
}
function FuelTab({ fuel, avgKm }) {
  if (fuel.length === 0) {
    return <p style={S.empty}>No fuel records for this car yet.</p>;
  }
  return (
    <div>
      <div style={{ ...S.statBox, textAlign:"left", marginBottom:"1.25rem", display:"inline-block" }}>
        <div style={S.statLbl}>Average KM per Fueling</div>
        <div style={S.statVal}>
          {avgKm != null ? `${avgKm.toLocaleString("en-US")} km` : "—"}
        </div>
        {avgKm == null && <p style={{ fontSize:11.5, color:"#999", margin:"4px 0 0" }}>Need at least two fill-ups with an odometer reading to calculate this.</p>}
      </div>

      <table style={S.table}>
        <thead><tr>{["Date","Product","KM","Amount"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {fuel.map((f,i) => (
            <tr key={i} style={{ borderBottom:"1px solid #f3f4f6" }}>
              <td data-label="Date" style={{ ...S.td,fontSize:12,color:"#888" }}>{fmtDate(f.date)}</td>
              <td data-label="Product" style={S.td}>{f.product || "—"}</td>
              <td data-label="KM" style={S.td}>{f.currentKm != null ? f.currentKm.toLocaleString("en-US") : "—"}</td>
              <td data-label="Amount" style={S.td}>{isJunkAmount(f.amount) ? "—" : `TZS ${Number(f.amount).toLocaleString("en-US")}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


// Self-contained: fetches its own data, only when this tab is actually
// selected (CarProfilePage's own load() doesn't touch tracker data — this
// is a lightweight add-on, not core to the profile).
function TrackingTab({ plate }) {
  const [loading, setLoading] = useState(true);
  const [tracker, setTracker] = useState(null); // { imei, deviceName } or null if unmatched
  const [location, setLocation] = useState(null);
  const [history, setHistory] = useState([]); // last 14 days of vehicle_mileage_daily

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [mapRes, overviewRes] = await Promise.all([
          api.getTrackerMap(),
          api.getTrackerOverviewTable(),
        ]);
        if (cancelled) return;
        const match = (mapRes.data || []).find((r) => r.plate === plate);
        setTracker(match || null);
        const row = (overviewRes.data || []).find((r) => r.plate === plate);
        if (row && row.lat != null) setLocation(row);
      } catch { /* quietly leave the tab showing "no data" */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [plate]);

  if (loading) return <p style={S.empty}>Loading tracking info…</p>;

  if (!tracker) {
    return (
      <p style={S.empty}>
        No GPS tracker matched to this car yet. Match it on the{" "}
        <a href="/tracking" style={{ color:"var(--sc-blue)" }}>Tracking page</a>.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", gap:"1.5rem", flexWrap:"wrap", marginBottom:"1.25rem" }}>
        <div>
          <div style={{ fontSize:11.5, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:0.4 }}>Tracker</div>
          <div style={{ fontSize:14, fontWeight:600 }}>{tracker.deviceName || tracker.imei}</div>
        </div>
        <div>
          <div style={{ fontSize:11.5, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:0.4 }}>Location as of last sync</div>
          {location ? (
            <a href={`https://www.google.com/maps?q=${location.lat},${location.lng}`} target="_blank" rel="noreferrer"
              style={{ fontSize:14, fontWeight:600, color:"var(--sc-blue)" }}>
              View on map ↗
            </a>
          ) : <div style={{ fontSize:14, color:"var(--text-faint)" }}>Not synced yet</div>}
        </div>
      </div>
      <p style={S.empty}>Mileage history for this car will appear here once a few days of syncs have run.</p>
    </div>
  );
}

const WORK_ORDER_STATUS_COLORS = {
  "Queued":         "#3b82f6",
  "In Progress":    "#d97706",
  "Awaiting Parts": "#8b5cf6",
  "Completed":      "#16a34a",
};

// Read-only view of this car's maintenance work orders — visible to all
// staff on Car Profile, even though only Garage Manager can actually work
// the Maintenance dashboard itself. Filters the full work order list down
// to this plate client-side (dataset is small; no dedicated by-plate
// endpoint needed for this).
function CarMaintenanceTab({ plate }) {
  const [orders, setOrders] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [expandedChecklist, setExpandedChecklist] = useState(null);

  useEffect(() => {
    const norm = plate.trim().toLowerCase().replace(/\s+/g, "");
    Promise.all([
      api.getMaintenanceLog(),
      api.getChecklistInstances({ plate }),
    ]).then(([logRes, checklistRes]) => {
      const mine = (logRes?.data || []).filter(o => o.plate.trim().toLowerCase().replace(/\s+/g, "") === norm);
      setOrders(mine);
      setChecklists(checklistRes?.data || []);
    }).finally(() => setLoading(false));
  }, [plate]);

  if (loading) return <p style={S.empty}>Loading maintenance history…</p>;
  if (orders.length === 0 && checklists.length === 0) return <p style={S.empty}>No maintenance history yet.</p>;

  const CHECKLIST_STATE_COLORS = { "Good": "#16a34a", "Needs Attention": "#d97706", "Fail": "#dc2626" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {checklists.length > 0 && (
        <div>
          <p style={{ fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".3px", margin: "0 0 8px" }}>Checklists / Inspections</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checklists.map(c => (
              <div key={c.id} style={{ border: `1px solid ${c.hasFailure ? "#dc2626" : "#e5e7eb"}`, borderRadius: 10, overflow: "hidden" }}>
                {c.hasFailure && (
                  <div style={{ background: "#dc2626", color: "#fff", padding: "5px 14px", fontSize: 11.5, fontWeight: 700 }}>
                    ⚠ ONE OR MORE ITEMS FAILED
                  </div>
                )}
                <div onClick={() => setExpandedChecklist(expandedChecklist === c.id ? null : c.id)}
                  style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{c.templateName}</span>
                    <p style={{ fontSize: 11.5, color: "#999", margin: "3px 0 0" }}>
                      {c.completedBy || "—"} · {fmtDateTime(c.createdAt)}{c.workOrderId ? " · linked to work order" : " · standalone"}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, color: "#aaa" }}>{expandedChecklist === c.id ? "▲ hide" : "▼ details"}</span>
                </div>
                {expandedChecklist === c.id && (
                  <div style={{ borderTop: "1px solid #f3f4f6", padding: "10px 14px", background: "#fafafa" }}>
                    {c.items.map(it => (
                      <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: "1px solid #eee", gap: 8 }}>
                        <div>
                          <span style={{ fontSize: 12.5 }}>{it.label}</span>
                          {it.note && <p style={{ fontSize: 11.5, color: "#888", margin: "2px 0 0", fontStyle: "italic" }}>{it.note}</p>}
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 10, color: "#fff", background: CHECKLIST_STATE_COLORS[it.state], flexShrink: 0 }}>{it.state}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length > 0 && (
        <div>
          {checklists.length > 0 && <p style={{ fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".3px", margin: "0 0 8px" }}>Work Orders</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {orders.map(o => (
        <div key={o.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <div onClick={() => setExpanded(expanded === o.id ? null : o.id)}
            style={{ padding: "12px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{o.refNo || o.id}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 12, color: "#fff", background: WORK_ORDER_STATUS_COLORS[o.status] || "#888" }}>{o.status}</span>
              </div>
              {o.issueDescription && <p style={{ fontSize: 12.5, color: "#666", margin: "4px 0 0" }}>{o.issueDescription}</p>}
              <p style={{ fontSize: 11.5, color: "#999", margin: "3px 0 0" }}>
                🔧 {o.assignedMechanic || "Unassigned"} · Opened {fmtDateTime(o.dateOpened)}
                {o.status === "Completed" && ` · Closed ${fmtDateTime(o.dateClosed)}`}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              {o.totalCost > 0 && <p style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", margin: 0 }}>TZS {Number(o.totalCost).toLocaleString()}</p>}
              <span style={{ fontSize: 11, color: "#aaa" }}>{expanded === o.id ? "▲ hide" : "▼ details"}</span>
            </div>
          </div>
          {expanded === o.id && <CarMaintenanceOrderDetail workOrderId={o.id} />}
        </div>
      ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CarMaintenanceOrderDetail({ workOrderId }) {
  const [items, setItems] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getMaintenanceItems(workOrderId), api.getMaintenanceUpdates(workOrderId)])
      .then(([itemsRes, updatesRes]) => {
        setItems(itemsRes?.data || []);
        setUpdates(updatesRes?.data || []);
      })
      .finally(() => setLoading(false));
  }, [workOrderId]);

  if (loading) return <p style={{ ...S.empty, padding: "1rem" }}>Loading details…</p>;

  return (
    <div style={{ borderTop: "1px solid #f3f4f6", padding: "12px 14px", background: "#fafafa" }}>
      <p style={{ fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".3px", margin: "0 0 6px" }}>Job Card Items</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "#aaa", fontStyle: "italic", margin: "0 0 10px" }}>No items logged</p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid #eee" }}>
              <span>{it.itemName}</span>
              <span style={{ color: "#666" }}>{it.quantity} × {Number(it.unitCost).toLocaleString()} = <strong>{Number(it.lineTotal).toLocaleString()}</strong></span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".3px", margin: "0 0 6px" }}>Notes / Updates</p>
      {updates.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "#aaa", fontStyle: "italic", margin: 0 }}>No updates yet</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {updates.map(u => (
            <div key={u.id} style={{ borderLeft: "2px solid #ddd", paddingLeft: 8 }}>
              <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{u.message}</p>
              <p style={{ fontSize: 10.5, color: "#aaa", margin: "2px 0 0" }}>{u.author ? `${u.author} · ` : ""}{fmtDateTime(u.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  center:         { textAlign:"center",padding:"3rem",color:"#666" },
  backBtn:        { fontSize:13,color:"#1d4ed8",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:"1.25rem",fontWeight:500,display:"block" },
  plateHero:      { fontSize:26,fontWeight:800,color:"#111",letterSpacing:"-.5px" },
  typeHero:       { fontSize:15,color:"#555",marginTop:2 },
  badge:          { display:"inline-block",fontSize:12,fontWeight:600,padding:"4px 10px",borderRadius:99 },
  locChip:        { fontSize:12,background:"#f3f4f6",color:"#374151",borderRadius:6,padding:"3px 10px",display:"inline-block" },
  heroCard:       { background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"1.5rem",marginBottom:"1rem",display:"flex",gap:"1.5rem",flexWrap:"wrap",alignItems:"flex-start" },
  heroLeft:       { minWidth:160 },
  heroStats:      { display:"flex",gap:"1rem",flex:1,flexWrap:"wrap" },
  statBox:        { background:"#f9fafb",borderRadius:10,padding:"12px 16px",minWidth:100,textAlign:"center" },
  statVal:        { fontSize:22,fontWeight:700,color:"#111" },
  statLbl:        { fontSize:11,color:"#888",marginTop:2,textTransform:"uppercase",letterSpacing:".3px" },
  docLinks:       { display:"flex",flexDirection:"column",gap:8,justifyContent:"center" },
  docBtn:         { display:"inline-block",padding:"8px 12px",fontSize:12,fontWeight:600,background:"#f0fdf4",color:"#15803d",border:"1px solid #bbf7d0",borderRadius:7,textDecoration:"none",textAlign:"center",whiteSpace:"nowrap" },
  docBtnDisabled: { display:"inline-block",padding:"8px 12px",fontSize:12,background:"#f9fafb",color:"#aaa",border:"1px solid #e5e7eb",borderRadius:7,textAlign:"center",whiteSpace:"nowrap" },
  docBtnLarge:    { display:"block",padding:"12px 20px",fontSize:14,fontWeight:600,background:"#f0fdf4",color:"#15803d",border:"1.5px solid #bbf7d0",borderRadius:10,textDecoration:"none",textAlign:"center",minWidth:200 },
  docBtnLargeOff: { display:"block",padding:"12px 20px",fontSize:14,background:"#f9fafb",color:"#aaa",border:"1.5px solid #e5e7eb",borderRadius:10,textAlign:"center",minWidth:200 },
  rentalBanner:   { background:"#fef9c3",border:"1px solid #fde68a",borderRadius:10,padding:"12px 16px",marginBottom:"1rem",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,fontSize:13 },
  tabs:           { display:"flex",gap:4,borderBottom:"1px solid #e5e7eb",marginBottom:"1.25rem",overflowX:"auto" },
  tab:            { padding:"10px 16px",fontSize:13,fontWeight:500,color:"#555",background:"none",border:"none",borderBottom:"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap" },
  tabActive:      { color:"#16a34a",borderBottom:"2px solid #16a34a" },
  tabContent:     { background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,padding:"1.25rem" },
  infoGrid:       { display:"grid",gridTemplateColumns:"1fr 1fr",gap:0 },
  infoRow:        { display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid #f3f4f6",gap:12 },
  infoLabel:      { fontSize:12,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:".3px",flexShrink:0 },
  infoValue:      { fontSize:13,color:"#111",textAlign:"right" },
  table:          { width:"100%",borderCollapse:"collapse",fontSize:13 },
  th:             { padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:"#888",borderBottom:"1px solid #e5e7eb",background:"#fafafa",textTransform:"uppercase",letterSpacing:".4px",whiteSpace:"nowrap" },
  td:             { padding:"10px 12px",verticalAlign:"middle" },
  empty:          { textAlign:"center",padding:"2rem",color:"#aaa",fontSize:13 },
  staffCard:      { background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"1.5rem",display:"flex",flexDirection:"column",gap:16 },
  staffRentalBox: { background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:10,padding:"1rem",marginTop:4 },
  staffInfoRow:   { display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f3f4f6",fontSize:13 },
  staffInfoLabel: { fontSize:12,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:".3px" },
  noteBox:        { background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:10,padding:"1rem" },
  noteInput:      { width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box",marginBottom:10 },
  saveNoteBtn:    { padding:"9px 20px",fontSize:13,fontWeight:600,background:"#16a34a",color:"#fff",border:"none",borderRadius:7,cursor:"pointer" },
  noteCard:       { background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8,padding:"12px 14px",marginBottom:8 },
  noteText:       { fontSize:14,color:"#111",lineHeight:1.5 },
  noteMeta:       { fontSize:11,color:"#888",marginTop:6 },
  toast:          { position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#111",color:"#fff",padding:"10px 20px",borderRadius:8,fontSize:14,zIndex:200 },
};
