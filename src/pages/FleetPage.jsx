import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { cache } from "../lib/cache";
import { exportToExcel } from "../lib/exportExcel";
import ActionModal from "../components/ActionModal";
import MoveCarModal from "../components/MoveCarModal";
import RentalAgreementModal from "../components/RentalAgreementModal";
import AddCarModal from "../components/AddCarModal";
import MultiSelect from "../components/MultiSelect";

function fmtDate(val) {
  if (!val) return "—";
  const d = String(val).split("T")[0];
  if (!d || d.length < 10) return val;
  const [y, m, dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(String(dateStr).split("T")[0] + "T00:00:00");
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.round((target - now) / 86400000);
}
function fmtMoney(amount, currency) {
  if (!amount) return "—";
  return `${currency || "TZS"} ${Number(amount).toLocaleString()}`;
}
function pad(n) { return String(n).padStart(2,"0"); }

const STATUS_STYLES = {
  Available:  { bg: "#dcfce7", color: "#15803d" },
  Rented:     { bg: "#fef9c3", color: "#854d0e" },
  Maintenance:{ bg: "#ffedd5", color: "#c2410c" },
  "Staff Use":{ bg: "#eff6ff", color: "#2563eb" },
};
const PAYMENT_STYLES = {
  Paid:           { bg: "#dcfce7", color: "#15803d" },
  "Partial Paid": { bg: "#fef3c7", color: "#92400e" },
  Unpaid:         { bg: "#fee2e2", color: "#b91c1c" },
  "Long Term":    { bg: "#ede9fe", color: "#6d28d9" },
};

export default function FleetPage({ staffName, role }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Pre-fill search from URL param (e.g. from Reservations checkout button)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const s = params.get("search");
    if (s) setSearch(s);
  }, [location.search]);
  const canExportOrSell = role === "Admin" || role === "Manager";
  const [fleet,        setFleet]        = useState([]);
  const [config,       setConfig]       = useState({ staff:[], locations:[], garages:[], drivers:[] });
  const [blacklist,    setBlacklist]    = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,     setError]     = useState("");
  const [search,    setSearch]    = useState("");
  const [fStatus,   setFStatus]   = useState([]);
  const [fLocation, setFLocation] = useState([]);
  const [fType,     setFType]     = useState([]);
  const [view,      setView]      = useState("all");
  const [expiringFilter, setExpiringFilter] = useState("all"); // all | overdue | soon
  const [modal,        setModal]        = useState(null);
  const [agreement,    setAgreement]    = useState(null);
  const [moveCar,      setMoveCar]      = useState(null);
  const [replaceCar,   setReplaceCar]   = useState(null);
  const [showAddCar,   setShowAddCar]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState("");
  const [overdueBlock, setOverdueBlock] = useState(false);
  const [page,      setPage]      = useState(1);
  const PER_PAGE = 25;

  const load = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = cache.get("fleet");
      const cachedConfig = cache.get("config");
      if (cached && cachedConfig) { setFleet(cached); setConfig(cachedConfig); setLoading(false); return; }
    }
    setLoading(true); setError("");
    try {
      const [f, c, bl, rv] = await Promise.all([api.getFleet(), api.getConfig(), api.getBlacklist(), api.getAllReservations()]);
      const fleetData = f.data || [];
      setFleet(fleetData); setConfig(c); setBlacklist(bl.data || []); setReservations(rv.data || []);
      cache.set("fleet", fleetData); cache.set("config", c);
    } catch (e) { setError("Failed to load fleet: " + e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const myOverdueCount = useMemo(() => {
    if (!staffName || role === "Admin" || role === "Manager") return 0;
    return fleet.filter(c =>
      c.status === "Rented" &&
      c.checkedOutBy &&
      c.checkedOutBy.trim().toLowerCase() === staffName.trim().toLowerCase() &&
      c.returnDate &&
      daysUntil(c.returnDate) < 0
    ).length;
  }, [fleet, staffName, role]);

  const todayStr2 = `${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`;

  const reservationFor = (plate) => {
    if (!plate) return null;
    const norm = plate.trim().toLowerCase().replace(/\s/g,"");
    return reservations.find(r => {
      const rNorm = (r.plate||"").trim().toLowerCase().replace(/\s/g,"");
      return rNorm === norm && r.pickupDate && r.returnDate &&
        (r.pickupDate >= todayStr2 || (r.pickupDate <= todayStr2 && r.returnDate >= todayStr2));
    }) || null;
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const handleConfirm = async (fields) => {
    if (!modal) return;
    setSaving(true);
    try {
      const { car, action } = modal;
      const payload = { plate: car.plate, type: car.type, staffName, ...fields };
      if (action === "checkOut") {
        try {
          await api.checkOut(payload);
        } catch (err) {
          // Apps Script can occasionally report a failure even though the write
          // already went through (e.g. a hiccup in a secondary step server-side,
          // or a dropped response). Before treating this as a real failure,
          // check whether the car is actually checked out already — don't make
          // the staff member redo something that worked.
          try {
            const check = await api.getCarByPlate(car.plate);
            const alreadyDone = check && check.data && check.data.status === "Rented" && check.data.currentClient === fields.client;
            if (!alreadyDone) throw err;
          } catch {
            throw err; // genuinely failed — surface the original error
          }
        }
        setModal(null);
        cache.clear();
        load(true).catch(() => {}); // refresh in the background, don't block opening the agreement
        // Rental Agreement generation can be toggled off from the Admin Panel —
        // fetched fresh (not cached) so a toggle takes effect immediately.
        let agreementEnabled = true;
try {
  const s = await api.getSettings();
  agreementEnabled = s.settings.RentalAgreementEnabled !== "FALSE";
} catch {}
        if (agreementEnabled) {
          setAgreement({ car, checkout: payload });
        } else {
          showToast("✅ Checkout complete");
        }
        setSaving(false);
        return;
      }
      if (action === "markReturned")   await api.markReturned(payload);
      if (action === "extendBooking")  await api.extendBooking(payload);
      if (action === "setMaintenance") await api.setMaintenance(payload);
      if (action === "setAvailable")   await api.setAvailable(payload);
      if (action === "setStaffUse")    await api.setStaffUse(payload);
      if (action === "markSold")       await api.markSold(payload);
      if (fields.newLocation) await api.addLocation(fields.newLocation);
      if (fields.newGarage)   await api.addGarage(fields.newGarage);
      if (fields.newDriver)   await api.addDriver(fields.newDriver);
      setModal(null);
      showToast("✅ Saved successfully");
      cache.clear();
      await load(true);
    } catch (e) { showToast("❌ Error: " + e.message); }
    finally { setSaving(false); }
  };

  const handleReplaceConfirm = async (fields) => {
    if (!replaceCar) return;
    setSaving(true);
    try {
      await api.replaceVehicle({
        originalPlate:  replaceCar.plate,
        originalType:   replaceCar.type,
        replacePlate:   fields.replacePlate,
        replaceType:    fields.replaceType,
        originalAction: fields.originalAction || "garage",
        staffName,
        client:        replaceCar.currentClient,
        clientPhone:   replaceCar.clientPhone,
        bookedFrom:    replaceCar.bookedFrom,
        returnDate:    replaceCar.returnDate,
        amount:        replaceCar.amount,
        currency:      replaceCar.currency,
        paymentStatus: replaceCar.paymentStatus,
        amountPaid:    replaceCar.amountPaid,
        driver:        replaceCar.driver,
        location:      replaceCar.location,
        garage:        fields.garage || "",
        remarks:       fields.remarks || "",
      });
      setReplaceCar(null);
      showToast(`✅ ${replaceCar.plate} replaced by ${fields.replacePlate}`);
      cache.clear();
      await load(true);
    } catch (e) { showToast("❌ Error: " + e.message); }
    finally { setSaving(false); }
  };

  const handleMoveConfirm = async (fields) => {
    if (!moveCar) return;
    setSaving(true);
    try {
      await api.updateLocation({ plate: moveCar.plate, type: moveCar.type, staffName, location: fields.location });
      if (fields.newLocation) await api.addLocation(fields.newLocation);
      setMoveCar(null);
      showToast(`✅ ${moveCar.plate} moved to ${fields.location}`);
      cache.clear();
      await load(true);
    } catch (e) { showToast("❌ Error: " + e.message); }
    finally { setSaving(false); }
  };

  const handlePaymentUpdate = async (car, newStatus) => {
    let amountPaid = car.amountPaid;
    if (newStatus === "Partial Paid") {
      const entered = prompt(`Enter amount paid so far for ${car.plate} (${car.currency || "TZS"}):`, car.amountPaid || "");
      if (entered === null) return;
      amountPaid = entered;
    } else {
      amountPaid = newStatus === "Unpaid" ? "" : car.amountPaid;
    }
    setSaving(true);
    try {
      await api.updatePayment({ plate: car.plate, type: car.type, staffName, paymentStatus: newStatus, amountPaid });
      showToast("✅ Payment status updated");
      cache.clear();
      await load(true);
    } catch (e) { showToast("❌ Error: " + e.message); }
    finally { setSaving(false); }
  };

  const stats = useMemo(() => ({
    available:   fleet.filter(c => c.status === "Available").length,
    rented:      fleet.filter(c => c.status === "Rented").length,
    maintenance: fleet.filter(c => c.status === "Maintenance").length,
    staffUse:    fleet.filter(c => c.status === "Staff Use").length,
  }), [fleet]);

  const expiringSoon = useMemo(() => fleet.filter(c => c.status==="Rented" && c.returnDate && daysUntil(c.returnDate)>=0 && daysUntil(c.returnDate)<=1), [fleet]);
  const expired      = useMemo(() => fleet.filter(c => c.status==="Rented" && c.returnDate && daysUntil(c.returnDate)<0), [fleet]);
  const unpaid = useMemo(() => fleet.filter(c =>
    c.status === "Rented" &&
    c.paymentStatus !== "Paid" &&
    c.paymentStatus !== "Long Term" &&
    (c.paymentStatus === "Unpaid" || c.paymentStatus === "Partial Paid")
  ), [fleet]);

  const types     = useMemo(() => [...new Set(fleet.map(c=>c.type))].sort(), [fleet]);
  const locations = useMemo(() => [...new Set(fleet.map(c=>c.location).filter(Boolean))].sort(), [fleet]);

  const staffUseList = useMemo(() => fleet.filter(c => c.status === "Staff Use"), [fleet]);
  const expiringAll = useMemo(() => [...expired, ...expiringSoon], [expired, expiringSoon]);
  const baseList = view==="expiring"
    ? (expiringFilter==="overdue" ? expired : expiringFilter==="soon" ? expiringSoon : expiringAll)
    : view==="unpaid" ? unpaid : view==="staffuse" ? staffUseList : fleet;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return baseList.filter(c =>
      (!q || c.plate.toLowerCase().includes(q) || c.type.toLowerCase().includes(q) || (c.currentClient||"").toLowerCase().includes(q)) &&
      (fStatus.length===0   || fStatus.includes(c.status)) &&
      (fLocation.length===0 || fLocation.includes(c.location)) &&
      (fType.length===0     || fType.includes(c.type))
    );
  }, [baseList, search, fStatus, fLocation, fType]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const handleExport = () => {
    const rows = filtered.map(c => ({
      Plate:c.plate, Type:c.type, Location:c.location, Status:c.status,
      Client:c.currentClient, Phone:c.clientPhone, "Booked From":fmtDate(c.bookedFrom),
      "Return Date":fmtDate(c.returnDate), Amount:c.amount, Currency:c.currency,
      "Payment Status":c.paymentStatus, "Amount Paid":c.amountPaid,
      Garage:c.garage, Remarks:c.remarks,
    }));
    exportToExcel(`SmilesCars_Fleet_${new Date().toISOString().split("T")[0]}.xlsx`, [{ name:"Fleet", rows }]);
  };

  const sel = { padding:"8px 10px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111" };

  if (loading) return <div style={{ textAlign:"center",padding:"3rem",color:"#666" }}>Loading fleet…</div>;
  if (error)   return <div style={{ textAlign:"center",padding:"3rem" }}><p style={{ color:"#dc2626" }}>{error}</p><button type="button" onClick={()=>{cache.clear();load(true);}}>Retry</button></div>;

  return (
    <div>
      {toast && <div style={{ position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#111",color:"#fff",padding:"10px 20px",borderRadius:8,fontSize:14,zIndex:200,boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>{toast}</div>}

      <div className="sc-stats" style={{ gridTemplateColumns:"repeat(6,1fr)" }}>
        {[
          { label:"Available",        value:stats.available,                      color:"#15803d",bg:"#dcfce7",view:"all"      },
          { label:"Rented",           value:stats.rented,                         color:"#854d0e",bg:"#fef9c3",view:"all"      },
          { label:"Staff Use",        value:stats.staffUse,                       color:"#1d4ed8",bg:"#eff6ff",view:"staffuse" },
          { label:"Maintenance",      value:stats.maintenance,                    color:"#c2410c",bg:"#ffedd5",view:"all"      },
          { label:"Expiring/Expired", value:expired.length+expiringSoon.length,   color:"#b91c1c",bg:"#fee2e2",view:"expiring" },
          { label:"Unpaid",           value:unpaid.length,                        color:"#b91c1c",bg:"#fee2e2",view:"unpaid"   },
        ].map(s => (
          <div key={s.label} style={{ borderRadius:10,padding:"18px 10px",textAlign:"center",cursor:"pointer",background:s.bg,width:"100%",outline:view===s.view&&s.view!=="all"?`2px solid ${s.color}`:"none" }}
            onClick={() => {
              if (s.view !== "all") {
                setView(s.view);
                setFStatus([]);
                setExpiringFilter("all");
              } else {
                setFStatus(fStatus.length===1 && fStatus[0]===s.label ? [] : [s.label]);
                setView("all");
              }
              setPage(1);
            }}>
            <div style={{ fontSize:26,fontWeight:700,color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11,color:s.color,fontWeight:500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {view!=="all" && (
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:view==="expiring"?"#fef2f2":view==="unpaid"?"#fefce8":"#eff6ff",border:`1.5px solid ${view==="expiring"?"#fca5a5":view==="unpaid"?"#fde68a":"#bfdbfe"}`,borderRadius:10,padding:"10px 16px",fontSize:13,color:view==="expiring"?"#b91c1c":view==="unpaid"?"#92400e":"#1d4ed8",marginBottom:"1rem",flexWrap:"wrap",gap:8 }}>
          <span style={{ fontWeight:500 }}>{view==="expiring"?"⚠️ Expiring / Overdue Rentals":view==="unpaid"?"💰 Unpaid / Partially Paid Rentals":"👤 Staff Assigned Cars"}</span>
          <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" }}>
            {view==="expiring" && (<>
              {[
                ["all",     `All (${expired.length + expiringSoon.length})`, "#7f1d1d", "#fee2e2"],
                ["overdue", `Overdue (${expired.length})`,                  "#b91c1c", "#fecaca"],
                ["soon",    `Due Soon (${expiringSoon.length})`,             "#b45309", "#fef3c7"],
              ].map(([val, label, color, bg]) => (
                <button type="button" key={val} onClick={() => { setExpiringFilter(val); setPage(1); }}
                  style={{ fontSize:12, fontWeight:600, padding:"5px 14px", borderRadius:20, border:"none", background:expiringFilter===val ? color : bg, color:expiringFilter===val ? "#fff" : color, cursor:"pointer" }}>
                  {label}
                </button>
              ))}
              <span style={{ width:1, background:"#fca5a5", height:18, display:"inline-block", margin:"0 2px" }} />
            </>)}
            <button type="button" style={{ fontSize:12, fontWeight:500, border:"1.5px solid currentColor", background:"transparent", color:"inherit", padding:"4px 12px", borderRadius:20, cursor:"pointer" }}
              onClick={() => { setView("all"); setExpiringFilter("all"); setPage(1); }}>✕ Clear</button>
          </div>
        </div>
      )}

      <div className="sc-filter-row">
        <input style={{ ...sel,width:220 }} className="sc-search" placeholder="Search plate, type or client…"
          value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
        <MultiSelect style={sel} label="All statuses" options={["Available","Rented","Staff Use","Maintenance"]} selected={fStatus} onChange={v=>{setFStatus(v);setPage(1);}} />
        <MultiSelect style={sel} label="All locations" options={locations} selected={fLocation} onChange={v=>{setFLocation(v);setPage(1);}} />
        <MultiSelect style={sel} label="All types" options={types} selected={fType} onChange={v=>{setFType(v);setPage(1);}} />
        {(search||fStatus.length||fLocation.length||fType.length) && <button type="button" style={{ ...sel,cursor:"pointer" }} onClick={()=>{setSearch("");setFStatus([]);setFLocation([]);setFType([]);setPage(1);}}>Clear</button>}
        <span style={{ fontSize:12,color:"#888",marginLeft:"auto" }}>
          {(search||fStatus.length||fLocation.length||fType.length||view!=="all")
            ? `${filtered.length} ${[...fStatus,...fLocation,...fType,view==="expiring"?"Expiring/Expired":view==="unpaid"?"Unpaid":view==="staffuse"?"Staff Use":""].filter(Boolean).join(" · ")}`
            : `${fleet.length} cars total`}
        </span>
        {canExportOrSell && <button type="button" style={{ padding:"8px 12px",fontSize:13,border:"1.5px solid #16a34a",borderRadius:7,background:"#f0fdf4",cursor:"pointer",color:"#15803d",fontWeight:500 }} onClick={handleExport}>⬇ Export</button>}
        {canExportOrSell && <button type="button" style={{ padding:"8px 12px",fontSize:13,border:"none",borderRadius:7,background:"#1d4ed8",cursor:"pointer",color:"#fff",fontWeight:600 }} onClick={()=>setShowAddCar(true)}>+ Add Car</button>}
        <button type="button" style={{ padding:"8px 12px",fontSize:16,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",cursor:"pointer",color:"#555" }} onClick={()=>{cache.clear();load(true);}}>↻</button>
      </div>

      <div className="sc-table-wrap">
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr>{["Plate","Type","Location","Status","Client","Return Date","Payment", ...(view==="unpaid"||view==="expiring"?["Staff"]:[]), "Action"].map(h =>
              <th key={h} style={{ padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:"#888",borderBottom:"1px solid #e5e7eb",background:"#fafafa",textTransform:"uppercase",letterSpacing:".4px",whiteSpace:"nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginated.length===0 && <tr><td colSpan={8} style={{ textAlign:"center",padding:"2.5rem",color:"#aaa",fontSize:14 }}>No vehicles match your filters.</td></tr>}
            {paginated.map(car => {
              const ss = STATUS_STYLES[car.status] || STATUS_STYLES.Available;
              const du = car.status==="Rented" ? daysUntil(car.returnDate) : null;
              const isExpired = du!==null && du<0;
              const isExpiringSoon = du!==null && du>=0 && du<=1;
              const ps = PAYMENT_STYLES[car.paymentStatus] || null;
              return (
                <tr key={car.plate} style={isExpired?{background:"#fef2f2"}:isExpiringSoon?{background:"#fffbeb"}:{}}>
                  <td data-label="Plate" style={{ padding:"11px 12px",fontWeight:600,fontSize:13 }}>
                    <span style={{ cursor:"pointer",color:"#1d4ed8",textDecoration:"underline" }} onClick={()=>navigate(`/car/${encodeURIComponent(car.plate)}`)}>
                      {car.plate}
                    </span>
                  </td>
                  <td data-label="Type" style={{ padding:"11px 12px" }}>{car.type}</td>
                  <td data-label="Location" style={{ padding:"11px 12px" }}>
                    {car.location?<span style={{ fontSize:12,color:"#374151",background:"#f3f4f6",borderRadius:5,padding:"2px 8px" }}>{car.location}</span>:<span style={{ color:"#ccc" }}>—</span>}
                  </td>
                  <td data-label="Status" style={{ padding:"11px 12px" }}>
                    <div>
                      <span style={{ display:"inline-block",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:99,background:ss.bg,color:ss.color }}>{car.status}</span>
                      {car.status==="Maintenance"&&car.garage&&<div style={{ fontSize:11,color:"#c2410c",marginTop:3,fontWeight:500 }}>🔧 {car.garage}</div>}
                      {car.status==="Available" && (() => {
                        const res = reservationFor(car.plate);
                        if (!res) return null;
                        const isActive = res.pickupDate <= todayStr2 && res.returnDate >= todayStr2;
                        return (
                          <div title={`Reserved for ${res.client} · ${res.pickupDate} → ${res.returnDate}`}
                            style={{ fontSize:10,fontWeight:600,padding:"2px 7px",marginTop:4,borderRadius:99,display:"inline-block",background:isActive?"#ede9fe":"#f5f3ff",color:"#7c3aed",border:"1px solid #ddd6fe",whiteSpace:"nowrap" }}>
                            {isActive ? "🟣 Reserved" : `📅 Rsv ${res.pickupDate}`}
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  <td data-label="Client" style={{ padding:"11px 12px" }}>
                    {car.currentClient
                      ? <div>
                          <div style={{ fontWeight:500,fontSize:13 }}>
                            {car.status==="Staff Use" && <span style={{ marginRight:4 }}>👤</span>}
                            {car.remarks && car.remarks.includes("Replacement for") && <span style={{ marginRight:4 }} title={car.remarks}>🔄</span>}
                            {car.currentClient}
                          </div>
                          {car.clientPhone&&<div style={{ fontSize:12,color:"#888" }}>{car.clientPhone}</div>}
                        </div>
                      : <span style={{ color:"#ccc" }}>—</span>}
                  </td>
                  <td data-label="Return Date" style={{ padding:"11px 12px",fontSize:13,color:isExpired?"#b91c1c":isExpiringSoon?"#b45309":"#555" }}>
                    {fmtDate(car.returnDate)}
                    {isExpired&&<div style={{ fontSize:10,fontWeight:600 }}>OVERDUE</div>}
                    {isExpiringSoon&&<div style={{ fontSize:10,fontWeight:600 }}>DUE SOON</div>}
                  </td>
                  <td data-label="Payment" style={{ padding:"11px 12px" }}>
                    {car.status==="Rented"&&car.paymentStatus?(
                      <select value={car.paymentStatus} onChange={e=>handlePaymentUpdate(car,e.target.value)}
                        style={{ fontSize:11,fontWeight:600,padding:"3px 6px",borderRadius:6,border:"none",cursor:"pointer",background:ps?.bg,color:ps?.color }}>
                        <option value="Paid">Paid</option>
                        <option value="Partial Paid">Partial Paid</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Long Term">Long Term</option>
                      </select>
                    ):<span style={{ color:"#ccc" }}>—</span>}
                    {car.paymentStatus==="Partial Paid"&&car.amountPaid&&<div style={{ fontSize:11,color:"#888",marginTop:2 }}>{fmtMoney(car.amountPaid,car.currency)}</div>}
                  </td>
                  {(view==="unpaid"||view==="expiring") && (
                    <td data-label="Staff" style={{ padding:"11px 12px",fontSize:13 }}>
                      {car.checkedOutBy
                        ? <span style={{ fontWeight:500,color:"#374151" }}>{car.checkedOutBy}</span>
                        : <span style={{ color:"#ccc" }}>—</span>}
                    </td>
                  )}
                  <td data-label="Action" style={{ padding:"11px 12px" }}>
                    <ActionButtons car={car} onAction={(c,a)=>setModal({car:c,action:a})} onMove={c=>setMoveCar(c)} onReplace={c=>setReplaceCar(c)} canSell={canExportOrSell} role={role} myOverdueCount={myOverdueCount} setOverdueBlock={setOverdueBlock} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages>1 && (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:"1rem 0" }}>
          <button type="button" style={{ padding:"7px 16px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",cursor:"pointer" }} onClick={()=>setPage(p=>p-1)} disabled={page===1}>‹ Prev</button>
          <span style={{ fontSize:13,color:"#555" }}>Page {page} of {totalPages}</span>
          <button type="button" style={{ padding:"7px 16px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",cursor:"pointer" }} onClick={()=>setPage(p=>p+1)} disabled={page===totalPages}>Next ›</button>
        </div>
      )}

      {overdueBlock && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 }}
          onClick={() => setOverdueBlock(false)}>
          <div style={{ background:"#fff",borderRadius:14,width:360,maxWidth:"100%",padding:"2rem",textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:44,marginBottom:12 }}>🚫</div>
            <h3 style={{ fontSize:18,fontWeight:700,color:"#111",margin:"0 0 8px" }}>Check Out Blocked</h3>
            <p style={{ fontSize:14,color:"#555",margin:"0 0 6px",lineHeight:1.5 }}>
              You have <strong style={{ color:"#b91c1c" }}>{myOverdueCount} overdue rental{myOverdueCount > 1 ? "s" : ""}</strong> that need to be resolved.
            </p>
            <p style={{ fontSize:13,color:"#888",margin:"0 0 20px" }}>
              Please contact your Manager or Admin to authorize a new check out.
            </p>
            <button type="button" style={{ padding:"10px 24px",fontSize:14,fontWeight:600,background:"#111",color:"#fff",border:"none",borderRadius:8,cursor:"pointer" }}
              onClick={() => setOverdueBlock(false)}>OK</button>
          </div>
        </div>
      )}
      {agreement && (
        <RentalAgreementModal
          car={agreement.car} checkout={agreement.checkout} staffName={staffName}
          onClose={() => setAgreement(null)} />
      )}
      {modal && (
        <ActionModal car={modal.car} action={modal.action}
          locations={config.locations} garages={config.garages} drivers={config.drivers||[]} staff={config.staff||[]}
          staffName={staffName} role={role} blacklist={blacklist}
          onConfirm={handleConfirm} onClose={()=>!saving&&setModal(null)} loading={saving} />
      )}
      {moveCar && (
        <MoveCarModal car={moveCar} locations={config.locations} staffName={staffName} role={role}
          onConfirm={handleMoveConfirm} onClose={()=>!saving&&setMoveCar(null)} loading={saving} />
      )}
      {replaceCar && (
        <ReplaceCarModal car={replaceCar} fleet={fleet} garages={config.garages} staffName={staffName}
          onConfirm={handleReplaceConfirm} onClose={()=>!saving&&setReplaceCar(null)} loading={saving} />
      )}
      {showAddCar && (
        <AddCarModal locations={config.locations}
          onClose={()=>setShowAddCar(false)}
          onSaved={()=>{ setShowAddCar(false); showToast("✅ Car added to fleet"); cache.clear(); load(true); }} />
      )}
    </div>
  );
}

function ActionButtons({ car, onAction, onMove, onReplace, canSell, role, myOverdueCount, setOverdueBlock }) {
  const row = { display:"flex",alignItems:"center",flexWrap:"nowrap",gap:3 };
  const btn = (label, action, color, bg, onClick) => (
    <button type="button" key={action}
      style={{ fontSize:10,padding:"3px 7px",borderRadius:5,border:`1px solid ${color}`,background:bg,color,cursor:"pointer",marginRight:3,fontWeight:500,whiteSpace:"nowrap" }}
      onClick={onClick||(() => onAction(car, action))}>
      {label}
    </button>
  );
  const isStaff = role !== "Admin" && role !== "Manager";
  if (car.status==="Available") return (
    <div style={row}>
      {btn("Check Out","checkOut","#15803d","#dcfce7", () => {
        if (isStaff && myOverdueCount >= 2) { setOverdueBlock(true); return; }
        onAction(car, "checkOut");
      })}
      {btn("Staff Use","setStaffUse","#1d4ed8","#eff6ff")}
      {btn("Maintenance","setMaintenance","#c2410c","#fff7ed")}
      {btn("Move","move","#1d4ed8","#eff6ff",()=>onMove(car))}
      {canSell&&btn("Sold","markSold","#dc2626","#fef2f2")}
    </div>
  );
  if (car.status==="Staff Use") return (
    <div style={row}>
      {btn("Mark Available","setAvailable","#15803d","#dcfce7")}
      {btn("Move","move","#1d4ed8","#eff6ff",()=>onMove(car))}
    </div>
  );
  if (car.status==="Rented") return (
    <div style={row}>
      {btn("Returned","markReturned","#2563eb","#eff6ff")}
      {btn("Extend Booking","extendBooking","#0284c7","#e0f2fe")}
      {btn("Replace","replace","#7c3aed","#f5f3ff",()=>onReplace(car))}
    </div>
  );
  if (car.status==="Maintenance") return (
    <div style={row}>
      {btn("Mark Available","setAvailable","#15803d","#dcfce7")}
      {btn("Move","move","#1d4ed8","#eff6ff",()=>onMove(car))}
    </div>
  );
  return null;
}

// ── Replace Car Modal ─────────────────────────────────────────
function ReplaceCarModal({ car, fleet, garages, staffName, onConfirm, onClose, loading }) {
  const available = fleet.filter(c => c.status === "Available");
  const [replacePlate, setReplacePlate] = useState("");
  const [originalAction, setOriginalAction] = useState("garage"); // "garage" | "available"
  const [garage,       setGarage]       = useState("");
  const [newGarage,    setNewGarage]    = useState("");
  const [addingGarage, setAddingGarage] = useState(false);
  const [remarks,      setRemarks]      = useState("");
  const [err,          setErr]          = useState("");
  const [query,        setQuery]        = useState("");
  const [open,         setOpen]         = useState(false);

  const filtered = query.trim()
    ? available.filter(c => c.plate.toLowerCase().replace(/\s/g,"").includes(query.toLowerCase().replace(/\s/g,"")))
    : available;

  const select = (plate) => { setReplacePlate(plate); setQuery(plate); setOpen(false); };

  const handleSubmit = () => {
    if (!replacePlate) { setErr("Please select a replacement car."); return; }
    const repCar = available.find(c => c.plate === replacePlate);
    if (!repCar) { setErr("Selected car not found in available fleet."); return; }
    if (originalAction === "garage" && !addingGarage && !garage) { setErr("Please select a garage."); return; }
    onConfirm({
      replacePlate,
      replaceType:    repCar.type,
      originalAction,
      garage: originalAction === "garage" ? (addingGarage ? newGarage.trim() : garage) : "",
      remarks,
    });
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 }} onClick={onClose}>
      <div style={{ background:"#fff",borderRadius:14,width:460,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",background:"#7c3aed",display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div>
            <p style={{ fontSize:16,fontWeight:700,color:"#fff",margin:0 }}>Replace Vehicle</p>
            <p style={{ fontSize:12,color:"rgba(255,255,255,0.8)",margin:"2px 0 0" }}>{car.plate} · {car.type}</p>
          </div>
          <button type="button" style={{ background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:"1.25rem" }}>
          <p style={{ fontSize:14,fontWeight:600,color:"#111",margin:"0 0 12px" }}>Replace Vehicle</p>

          {/* Current rental summary */}
          <div style={{ background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:8,padding:"10px 14px",marginBottom:"1rem",fontSize:13 }}>
            <div style={{ fontWeight:600,color:"#7c3aed",marginBottom:4 }}>Current Rental — transferring to replacement</div>
            <div style={{ color:"#555" }}>Client: <strong>{car.currentClient}</strong></div>
            {car.clientPhone && <div style={{ color:"#555" }}>Phone: {car.clientPhone}</div>}
            <div style={{ color:"#555" }}>Return Date: {car.returnDate}</div>
            {car.amount && <div style={{ color:"#555" }}>Amount: {car.currency} {Number(car.amount).toLocaleString("en-US")} · {car.paymentStatus}</div>}
          </div>

          {/* Replacement car selector */}
          <div style={{ marginBottom:"0.85rem" }}>
            <label style={{ fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:4 }}>Replacement Car *</label>
            <div style={{ position:"relative" }}>
              <input style={{ width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,boxSizing:"border-box",fontFamily:"inherit",background:replacePlate?"#f5f3ff":"#fff" }}
                placeholder="Type plate to search available cars…" value={query} autoComplete="off"
                onChange={e => { setQuery(e.target.value); setReplacePlate(""); setOpen(true); }}
                onFocus={() => setOpen(true)} onBlur={() => setTimeout(()=>setOpen(false),150)} />
              {replacePlate && <span style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"#7c3aed",fontWeight:700 }}>✓</span>}
              {open && filtered.length > 0 && (
                <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:8,boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:50,maxHeight:200,overflowY:"auto" }}>
                  {filtered.slice(0,20).map(c => (
                    <div key={c.plate} style={{ padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #f3f4f6",display:"flex",justifyContent:"space-between" }}
                      onMouseDown={() => select(c.plate)}>
                      <span style={{ fontWeight:600 }}>{c.plate}</span>
                      <span style={{ color:"#888" }}>{c.type} · {c.location||"—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {available.length === 0 && <p style={{ fontSize:12,color:"#dc2626",margin:"6px 0 0" }}>No available cars in fleet.</p>}
          </div>

          {/* What to do with original car */}
          <div style={{ marginBottom:"0.85rem" }}>
            <label style={{ fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:8 }}>What happens to {car.plate}?</label>
            <div style={{ display:"flex",gap:8,marginBottom:10 }}>
              {[["garage","🔧 Send to Garage"],["available","✅ Mark Available"]].map(([val,label])=>(
                <button type="button" key={val} onClick={()=>setOriginalAction(val)}
                  style={{ flex:1,padding:"9px",fontSize:13,fontWeight:600,borderRadius:8,border:`1.5px solid ${originalAction===val?"#7c3aed":"#e5e7eb"}`,background:originalAction===val?"#f5f3ff":"#fff",color:originalAction===val?"#7c3aed":"#555",cursor:"pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            {originalAction === "garage" && (
              !addingGarage ? (
                <select style={{ width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,boxSizing:"border-box",fontFamily:"inherit" }}
                  value={garage} onChange={e => { if(e.target.value==="__new__") setAddingGarage(true); else setGarage(e.target.value); }}>
                  <option value="">— Select garage —</option>
                  {(garages||[]).map(g => <option key={g}>{g}</option>)}
                  <option value="__new__">+ Add new garage</option>
                </select>
              ) : (
                <div style={{ display:"flex",gap:6 }}>
                  <input style={{ flex:1,padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,fontFamily:"inherit" }}
                    placeholder="New garage name" value={newGarage} onChange={e=>setNewGarage(e.target.value)} autoFocus />
                  <button type="button" style={{ padding:"9px 12px",border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",cursor:"pointer",color:"#666" }} onClick={()=>setAddingGarage(false)}>✕</button>
                </div>
              )
            )}
          </div>

          <div style={{ marginBottom:"0.85rem" }}>
            <label style={{ fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:4 }}>Remarks</label>
            <textarea style={{ width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box" }}
              rows={2} value={remarks} onChange={e=>setRemarks(e.target.value)}
              placeholder="e.g. Engine overheating, AC failure" />
          </div>

          {err && <p style={{ color:"#dc2626",fontSize:13,margin:"6px 0" }}>{err}</p>}
          <button type="button" style={{ width:"100%",padding:"11px",fontSize:14,fontWeight:600,color:"#fff",background:"#7c3aed",border:"none",borderRadius:8,cursor:"pointer",opacity:loading?0.65:1,fontFamily:"inherit" }}
            onClick={handleSubmit} disabled={loading}>
            {loading ? "Processing…" : `Confirm Replacement`}
          </button>
        </div>
      </div>
    </div>
  );
}
