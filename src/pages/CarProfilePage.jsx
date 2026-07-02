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
  if (String(val).includes("T") || String(val).includes("-202") || String(val).match(/^\d{4}-\d{2}/)) return null;
  return val;
}

export default function CarProfilePage({ staffName, role }) {
  const { plate }  = useParams();
  const navigate   = useNavigate();
  const decodedPlate = decodeURIComponent(plate);
  const canSeeFullProfile = role === "Admin" || role === "Manager";

  const [car,        setCar]        = useState(null);
  const [history,    setHistory]    = useState([]);
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
  if (error)   return <div style={S.center}><p style={{ color:"#dc2626" }}>{error}</p><button onClick={()=>navigate("/")} style={S.backBtn}>← Back to Fleet</button></div>;
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
        <button style={S.backBtn} onClick={() => navigate("/")}>← Back to Fleet</button>
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
      <button style={S.backBtn} onClick={() => navigate("/")}>← Back to Fleet</button>
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

      <div style={S.tabs}>
        {[
          { id:"overview",    label:"Overview" },
          { id:"history",     label:`Rentals (${rentalHistory.length})` },
          { id:"maintenance", label:`Maintenance (${maintenanceHistory.length})` },
          { id:"notes",       label:`Notes (${noteHistory.length})` },
        ].map(t => (
          <button key={t.id} style={{ ...S.tab,...(activeTab===t.id?S.tabActive:{}) }} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {activeTab==="overview" && (
        <div style={S.tabContent}>
          <div style={S.infoGrid}>
            {[
              ["Plate",car.plate],["Type",car.type],["Status",car.status],["Location",car.location||"—"],
              ["Driver",car.driver||"—"],["Fuel Out",fuelVal(car.fuelOut)||"—"],["KM Out",car.kmOut?Number(car.kmOut).toLocaleString("en-US"):"—"],
              ["Current Client",car.currentClient||"—"],["Client Phone",car.clientPhone||"—"],
              ["Booked From",fmtDate(car.bookedFrom)],["Return Date",fmtDate(car.returnDate)],
              ["Payment Status",car.paymentStatus||"—"],["Amount",car.amount?fmtMoney(car.amount,car.currency):"—"],
              ["Garage",car.garage||"—"],["Remarks",car.remarks||"—"],
            ].map(([label,value]) => (
              <div key={label} style={S.infoRow}>
                <div style={S.infoLabel}>{label}</div>
                <div style={S.infoValue}>{value}</div>
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
                    ["Fuel In",       fuelVal(selectedRental.fuelIn)],
                    ["KM Out",        selectedRental.kmOut ? Number(selectedRental.kmOut).toLocaleString("en-US") : null],
                    ["KM In",         selectedRental.kmIn  ? Number(selectedRental.kmIn).toLocaleString("en-US")  : null],
                    ["Amount",        selectedRental.amount ? fmtMoney(selectedRental.amount, selectedRental.currency) : null],
                    ["Payment Status",selectedRental.paymentStatus],
                    ["Amount Paid",   selectedRental.amountPaid ? fmtMoney(selectedRental.amountPaid, selectedRental.currency) : null],
                    ["Police Fine",   selectedRental.policeFine ? fmtMoney(selectedRental.policeFine, selectedRental.currency) : null],
                    ["Parking Fine",  selectedRental.parkingFine ? fmtMoney(selectedRental.parkingFine, selectedRental.currency) : null],
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

      {activeTab==="maintenance" && (
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
