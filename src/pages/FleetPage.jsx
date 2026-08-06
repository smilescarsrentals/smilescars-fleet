import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { cache } from "../lib/cache";
import { exportToExcel } from "../lib/exportExcel";
import ActionModal, { GarageLocationPicker } from "../components/ActionModal";
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

const PAYMENT_STYLES = {
  Paid:           { bg: "var(--green-bg)",  color: "var(--green)" },
  "Partial Paid": { bg: "var(--amber-bg)",  color: "var(--amber)" },
  Unpaid:         { bg: "var(--red-bg)",    color: "var(--red)" },
  "Long Term":    { bg: "var(--yellow-bg)", color: "var(--yellow)" },
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
        // Check the setting BEFORE kicking off load(true)'s 4 parallel calls —
        // Apps Script handles simultaneous requests to the same URL poorly,
        // and this getSettings call was silently losing that race, always
        // falling back to "enabled" no matter what the toggle actually said.
        let agreementEnabled = true;
        try {
          const s = await api.getSettings();
          // Robust to Sheets ever returning an actual boolean instead of the
          // string "FALSE" — compare against a normalized uppercase string.
          agreementEnabled = String(s.settings.RentalAgreementEnabled).trim().toUpperCase() !== "FALSE";
        } catch (err) {
          console.warn("getSettings failed, defaulting Rental Agreement to enabled:", err);
        }
        cache.clear();
        load(true).catch(() => {}); // refresh in the background, doesn't block opening the agreement
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
      if (action === "sendRentedToMaintenance") await api.sendRentedCarToMaintenance(payload);
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
        serviceLocationType: fields.serviceLocationType || "",
        internalLocation:    fields.internalLocation || "",
        externalVendorId:    fields.externalVendorId || "",
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

  const sel = { padding:"8px 10px",fontSize:13,border:"1.5px solid var(--border)",borderRadius:7,background:"var(--surface)",color:"var(--text)" };

  if (loading) return <div className="loading-screen"><div className="spinner" />Loading fleet…</div>;
  if (error)   return (
    <div style={{ textAlign:"center",padding:"3rem" }}>
      <p style={{ color:"var(--red)" }}>{error}</p>
      <button type="button" className="btn btn-ghost" onClick={()=>{cache.clear();load(true);}}>Retry</button>
    </div>
  );

  return (
    <div>
      {toast && <div style={{ position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"var(--sidebar-bg)",color:"#fff",padding:"10px 20px",borderRadius:8,fontSize:14,zIndex:200,boxShadow:"var(--shadow-lg)" }}>{toast}</div>}

      <div style={{ marginBottom:"1.25rem" }}>
        <div style={{ fontSize:22,fontWeight:700,color:"var(--text)" }}>Fleet</div>
        <div style={{ fontSize:13,color:"var(--text-muted)",marginTop:2 }}>{fleet.length} vehicles across all locations.</div>
      </div>

      <div className="sc-stat-grid sc-fleet-stats">
        {[
          { label:"Available",        value:stats.available,                      icon:"✓",  chip:"green",  view:"all"      },
          { label:"Rented",           value:stats.rented,                         icon:"🚗", chip:"blue",   view:"all"      },
          { label:"Staff Use",        value:stats.staffUse,                       icon:"👤", chip:"yellow", view:"staffuse" },
          { label:"Maintenance",      value:stats.maintenance,                    icon:"🔧", chip:"amber",  view:"all"      },
          { label:"Expiring/Expired", value:expired.length+expiringSoon.length,   icon:"⚠",  chip:"red",    view:"expiring" },
          { label:"Unpaid",           value:unpaid.length,                        icon:"💰", chip:"red",    view:"unpaid"   },
        ].map(s => {
          const active = view===s.view && s.view!=="all" || (s.view==="all" && fStatus.length===1 && fStatus[0]===s.label);
          return (
            <div key={s.label} className={`sc-stat-card tint-${s.chip}`} style={{ cursor:"pointer", outline: active?"2px solid var(--sc-blue)":"none" }}
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
              <div className="sc-stat-top">
                <span className="sc-stat-label">{s.label}</span>
                <span className={`sc-stat-icon ${s.chip}`}>{s.icon}</span>
              </div>
              <div className="sc-stat-value">{s.value}</div>
            </div>
          );
        })}
      </div>

      {view!=="all" && (
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",background:view==="expiring"?"var(--red-bg)":view==="unpaid"?"var(--yellow-bg)":"var(--blue-bg)",border:`1.5px solid ${view==="expiring"?"var(--red-border)":view==="unpaid"?"var(--yellow-border)":"var(--blue-border)"}`,borderRadius:10,padding:"10px 16px",fontSize:13,color:view==="expiring"?"var(--red)":view==="unpaid"?"var(--yellow)":"var(--blue)",marginBottom:"1rem",flexWrap:"wrap",gap:8 }}>
          <span style={{ fontWeight:500 }}>{view==="expiring"?"⚠️ Expiring / Overdue Rentals":view==="unpaid"?"💰 Unpaid / Partially Paid Rentals":"👤 Staff Assigned Cars"}</span>
          <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" }}>
            {view==="expiring" && (<>
              {[
                ["all",     `All (${expired.length + expiringSoon.length})`, "var(--red)", "var(--red-bg)"],
                ["overdue", `Overdue (${expired.length})`,                  "#ffffff", "var(--red)"],
                ["soon",    `Due Soon (${expiringSoon.length})`,             "var(--amber)", "var(--amber-bg)"],
              ].map(([val, label, color, bg]) => (
                <button type="button" key={val} onClick={() => { setExpiringFilter(val); setPage(1); }}
                  style={{ fontSize:12, fontWeight:600, padding:"5px 14px", borderRadius:20, border:"none", background:expiringFilter===val ? color : bg, color:expiringFilter===val ? "#fff" : color, cursor:"pointer" }}>
                  {label}
                </button>
              ))}
              <span style={{ width:1, background:"var(--red-border)", height:18, display:"inline-block", margin:"0 2px" }} />
            </>)}
            <button type="button" style={{ fontSize:12, fontWeight:500, border:"1.5px solid currentColor", background:"transparent", color:"inherit", padding:"4px 12px", borderRadius:20, cursor:"pointer" }}
              onClick={() => { setView("all"); setExpiringFilter("all"); setPage(1); }}>✕ Clear</button>
          </div>
        </div>
      )}

      <div className="sc-filter-row">
        <input style={sel} className="sc-search" placeholder="Search plate, type or client…"
          value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
        <MultiSelect style={sel} label="All statuses" options={["Available","Rented","Staff Use","Maintenance"]} selected={fStatus} onChange={v=>{setFStatus(v);setPage(1);}} />
        <MultiSelect style={sel} label="All locations" options={locations} selected={fLocation} onChange={v=>{setFLocation(v);setPage(1);}} />
        <MultiSelect style={sel} label="All types" options={types} selected={fType} onChange={v=>{setFType(v);setPage(1);}} />
        {(search||fStatus.length||fLocation.length||fType.length) && <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{setSearch("");setFStatus([]);setFLocation([]);setFType([]);setPage(1);}}>Clear</button>}
        <span style={{ fontSize:12,color:"var(--text-muted)",marginLeft:"auto" }}>
          {(search||fStatus.length||fLocation.length||fType.length||view!=="all")
            ? `${filtered.length} ${[...fStatus,...fLocation,...fType,view==="expiring"?"Expiring/Expired":view==="unpaid"?"Unpaid":view==="staffuse"?"Staff Use":""].filter(Boolean).join(" · ")}`
            : `${fleet.length} cars total`}
        </span>
        {canExportOrSell && <button type="button" className="btn btn-success btn-sm sc-export-btn" onClick={handleExport} title="Export" aria-label="Export"><span aria-hidden="true">⬇</span><span className="sc-export-label"> Export</span></button>}
        {canExportOrSell && <button type="button" className="btn btn-primary btn-sm" onClick={()=>setShowAddCar(true)}>+ Add Car</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={()=>{cache.clear();load(true);}}>↻</button>
      </div>

      <div className="table-wrap sc-fleet-table">
        <table>
          <thead>
            <tr>{["Plate","Type","Location","Status","Client","Return Date","Payment", ...(view==="unpaid"||view==="expiring"?["Staff"]:[]), "Action"].map(h =>
              <th key={h} data-label={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginated.length===0 && <tr><td colSpan={8} style={{ textAlign:"center",padding:"2.5rem",color:"var(--text-faint)",fontSize:14 }}>No vehicles match your filters.</td></tr>}
            {paginated.map(car => {
              const badgeClass = car.status==="Available" ? "badge-available" : car.status==="Rented" ? "badge-rented" : car.status==="Maintenance" ? "badge-maintenance" : "badge-staffuse";
              const du = car.status==="Rented" ? daysUntil(car.returnDate) : null;
              const isExpired = du!==null && du<0;
              const isExpiringSoon = du!==null && du>=0 && du<=1;
              const ps = PAYMENT_STYLES[car.paymentStatus] || null;
              return (
                <tr key={car.plate} style={isExpired?{background:"var(--red-bg)"}:isExpiringSoon?{background:"var(--yellow-bg)"}:{}}>
                  <td data-label="Plate" style={{ fontWeight:600 }}>
                    <span style={{ cursor:"pointer",color:"var(--sc-blue)",textDecoration:"underline" }} onClick={()=>navigate(`/car/${encodeURIComponent(car.plate)}`)}>
                      {car.plate}
                    </span>
                  </td>
                  <td data-label="Type">{car.type}</td>
                  <td data-label="Location">
                    {car.location?<span style={{ fontSize:12,color:"var(--text)",background:"var(--bg)",borderRadius:5,padding:"2px 8px" }}>{car.location}</span>:<span style={{ color:"var(--text-faint)" }}>—</span>}
                  </td>
                  <td data-label="Status">
                    <div>
                      <span className={`badge ${badgeClass}`}>{car.status}</span>
                      {car.status==="Maintenance"&&car.garage&&<div style={{ fontSize:11,color:"var(--amber)",marginTop:3,fontWeight:500 }}>🔧 {car.garage}</div>}
                      {car.status==="Available" && (() => {
                        const res = reservationFor(car.plate);
                        if (!res) return null;
                        const isActive = res.pickupDate <= todayStr2 && res.returnDate >= todayStr2;
                        return (
                          <div title={`Reserved for ${res.client} · ${res.pickupDate} → ${res.returnDate}`}
                            style={{ fontSize:10,fontWeight:600,padding:"2px 7px",marginTop:4,borderRadius:99,display:"inline-block",background:isActive?"var(--yellow-bg)":"var(--yellow-bg)",color:"var(--sc-blue)",border:"1px solid var(--blue-border)",whiteSpace:"nowrap" }}>
                            {isActive ? "🟣 Reserved" : `📅 Rsv ${res.pickupDate}`}
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  <td data-label="Client">
                    {car.currentClient
                      ? <div>
                          <div style={{ fontWeight:500,fontSize:13 }}>
                            {car.status==="Staff Use" && <span style={{ marginRight:4 }}>👤</span>}
                            {car.remarks && car.remarks.includes("Replacement for") && <span style={{ marginRight:4 }} title={car.remarks}>🔄</span>}
                            {car.currentClient}
                          </div>
                          {car.clientPhone&&<div style={{ fontSize:12,color:"var(--text-muted)" }}>{car.clientPhone}</div>}
                        </div>
                      : <span style={{ color:"var(--text-faint)" }}>—</span>}
                  </td>
                  <td data-label="Return Date" style={{ fontSize:13,color:isExpired?"var(--red)":isExpiringSoon?"var(--amber)":"var(--text-muted)" }}>
                    {fmtDate(car.returnDate)}
                    {isExpired&&<div style={{ fontSize:10,fontWeight:600 }}>OVERDUE</div>}
                    {isExpiringSoon&&<div style={{ fontSize:10,fontWeight:600 }}>DUE SOON</div>}
                  </td>
                  <td data-label="Payment">
                    {car.status==="Rented"&&car.paymentStatus?(
                      <select value={car.paymentStatus} onChange={e=>handlePaymentUpdate(car,e.target.value)}
                        style={{ fontSize:10,fontWeight:600,padding:"2.5px 5px",borderRadius:6,border:"none",cursor:"pointer",background:ps?.bg,color:ps?.color }}>
                        <option value="Paid">Paid</option>
                        <option value="Partial Paid">Partial Paid</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Long Term">Long Term</option>
                      </select>
                    ):<span style={{ color:"var(--text-faint)" }}>—</span>}
                    {car.paymentStatus==="Partial Paid"&&car.amountPaid&&<div style={{ fontSize:11,color:"var(--text-muted)",marginTop:2 }}>{fmtMoney(car.amountPaid,car.currency)}</div>}
                  </td>
                  {(view==="unpaid"||view==="expiring") && (
                    <td data-label="Staff" style={{ fontSize:13 }}>
                      {car.checkedOutBy
                        ? <span style={{ fontWeight:500,color:"var(--text)" }}>{car.checkedOutBy}</span>
                        : <span style={{ color:"var(--text-faint)" }}>—</span>}
                    </td>
                  )}
                  <td data-label="Action">
                    <ActionButtons car={car} onAction={(c,a)=>setModal({car:c,action:a})} onMove={c=>setMoveCar(c)} onReplace={c=>setReplaceCar(c)} canSell={canExportOrSell} role={role} myOverdueCount={myOverdueCount} setOverdueBlock={setOverdueBlock} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages>1 && (
        <div className="pager" style={{ justifyContent:"center", border:"none" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p-1)} disabled={page===1}>‹ Prev</button>
          <span style={{ fontSize:13,color:"var(--text-muted)" }}>Page {page} of {totalPages}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>p+1)} disabled={page===totalPages}>Next ›</button>
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
            <button type="button" style={{ padding:"10px 24px",fontSize:14,fontWeight:600,background:"var(--sc-blue)",color:"#fff",border:"none",borderRadius:8,cursor:"pointer" }}
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
  // Garage Manager still can't touch rental-operations actions (Check Out,
  // Extend, Sell, Staff Use, Move, Replace) — that stays view-only. But
  // Maintenance and Mark Available ARE their job now, so those two get
  // through per status rather than blocking everything equally.
  const isGarageManager = role === "Garage Manager";
  const row = { display:"flex",alignItems:"center",flexWrap:"nowrap",gap:2 };
  const btn = (label, action, color, bg, onClick) => (
    <button type="button" key={action}
      style={{ fontSize:9,padding:"2.5px 5px",borderRadius:5,border:`1px solid ${color}`,background:bg,color,cursor:"pointer",marginRight:2,fontWeight:500,whiteSpace:"nowrap" }}
      onClick={onClick||(() => onAction(car, action))}>
      {label}
    </button>
  );
  const isStaff = role !== "Admin" && role !== "Manager";
  if (car.status==="Available") return (
    <div style={row}>
      {isGarageManager ? (
        btn("Maintenance","setMaintenance","var(--amber)","var(--amber-bg)")
      ) : (
        <>
          {btn("Check Out","checkOut","var(--green)","var(--green-bg)", () => {
            if (isStaff && myOverdueCount >= 2) { setOverdueBlock(true); return; }
            onAction(car, "checkOut");
          })}
          {btn("Staff Use","setStaffUse","var(--yellow)","var(--yellow-bg)")}
          {btn("Maintenance","setMaintenance","var(--amber)","var(--amber-bg)")}
          {btn("Move","move","var(--sc-blue)","var(--blue-bg)",()=>onMove(car))}
          {canSell&&btn("Sold","markSold","var(--red)","var(--red-bg)")}
        </>
      )}
    </div>
  );
  if (car.status==="Staff Use") return (
    isGarageManager ? <span style={{ fontSize: 10.5, color: "var(--text-faint)", fontStyle: "italic" }}>View only</span> :
    <div style={row}>
      {btn("Mark Available","setAvailable","var(--green)","var(--green-bg)")}
      {btn("Move","move","var(--sc-blue)","var(--blue-bg)",()=>onMove(car))}
    </div>
  );
  if (car.status==="Rented") return (
    <div style={row}>
      {isGarageManager ? (
        btn("Maintenance","sendRentedToMaintenance","var(--amber)","var(--amber-bg)")
      ) : (
        <>
          {btn("Returned","markReturned","var(--orange)","var(--orange-bg)")}
          {btn("Extend Booking","extendBooking","var(--blue-bg)","var(--sidebar-bg)")}
          {btn("Maintenance","sendRentedToMaintenance","var(--amber)","var(--amber-bg)")}
          {btn("Replace","replace","var(--purple)","var(--purple-bg)",()=>onReplace(car))}
        </>
      )}
    </div>
  );
  if (car.status==="Maintenance") return (
    <div style={row}>
      {btn("Mark Available","setAvailable","var(--green)","var(--green-bg)")}
      {!isGarageManager && btn("Move","move","var(--sc-blue)","var(--blue-bg)",()=>onMove(car))}
    </div>
  );
  return null;
}

// ── Replace Car Modal ─────────────────────────────────────────
function ReplaceCarModal({ car, fleet, garages, staffName, onConfirm, onClose, loading }) {
  const available = fleet.filter(c => c.status === "Available");
  const [replacePlate, setReplacePlate] = useState("");
  const [originalAction, setOriginalAction] = useState("garage"); // "garage" | "available"
  const [serviceLocationType, setServiceLocationType] = useState("Internal");
  const [internalLocation,    setInternalLocation]    = useState("SmilesCars Garage");
  const [externalVendorId,    setExternalVendorId]    = useState("");
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
    if (originalAction === "garage" && serviceLocationType === "External" && !externalVendorId) { setErr("Please select a garage."); return; }
    onConfirm({
      replacePlate,
      replaceType:    repCar.type,
      originalAction,
      serviceLocationType: originalAction === "garage" ? serviceLocationType : "",
      internalLocation: originalAction === "garage" ? internalLocation : "",
      externalVendorId: originalAction === "garage" ? externalVendorId : "",
      remarks,
    });
  };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 }} onClick={onClose}>
      <div style={{ background:"#fff",borderRadius:14,width:460,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",background:"var(--sc-blue)",display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
          <div>
            <p style={{ fontSize:16,fontWeight:700,color:"#fff",margin:0 }}>Replace Vehicle</p>
            <p style={{ fontSize:12,color:"rgba(255,255,255,0.8)",margin:"2px 0 0" }}>{car.plate} · {car.type}</p>
          </div>
          <button type="button" style={{ background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:"1.25rem" }}>
          <p style={{ fontSize:14,fontWeight:600,color:"#111",margin:"0 0 12px" }}>Replace Vehicle</p>

          {/* Current rental summary */}
          <div style={{ background:"var(--blue-bg)",border:"1px solid var(--blue-border)",borderRadius:8,padding:"10px 14px",marginBottom:"1rem",fontSize:13 }}>
            <div style={{ fontWeight:600,color:"var(--sc-blue)",marginBottom:4 }}>Current Rental — transferring to replacement</div>
            <div style={{ color:"#555" }}>Client: <strong>{car.currentClient}</strong></div>
            {car.clientPhone && <div style={{ color:"#555" }}>Phone: {car.clientPhone}</div>}
            <div style={{ color:"#555" }}>Return Date: {car.returnDate}</div>
            {car.amount && <div style={{ color:"#555" }}>Amount: {car.currency} {Number(car.amount).toLocaleString("en-US")} · {car.paymentStatus}</div>}
          </div>

          {/* Replacement car selector */}
          <div style={{ marginBottom:"0.85rem" }}>
            <label style={{ fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:4 }}>Replacement Car *</label>
            <div style={{ position:"relative" }}>
              <input style={{ width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,boxSizing:"border-box",fontFamily:"inherit",background:replacePlate?"var(--blue-bg)":"#fff" }}
                placeholder="Type plate to search available cars…" value={query} autoComplete="off"
                onChange={e => { setQuery(e.target.value); setReplacePlate(""); setOpen(true); }}
                onFocus={() => setOpen(true)} onBlur={() => setTimeout(()=>setOpen(false),150)} />
              {replacePlate && <span style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:"var(--sc-blue)",fontWeight:700 }}>✓</span>}
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
                  style={{ flex:1,padding:"9px",fontSize:13,fontWeight:600,borderRadius:8,border:`1.5px solid ${originalAction===val?"var(--sc-blue)":"#e5e7eb"}`,background:originalAction===val?"var(--blue-bg)":"#fff",color:originalAction===val?"var(--sc-blue)":"#555",cursor:"pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            {originalAction === "garage" && (
              <GarageLocationPicker
                serviceLocationType={serviceLocationType} internalLocation={internalLocation} externalVendorId={externalVendorId}
                onChange={({ serviceLocationType: t, internalLocation: il, externalVendorId: ev }) => {
                  setServiceLocationType(t); setInternalLocation(il); setExternalVendorId(ev);
                }} />
            )}
          </div>

          <div style={{ marginBottom:"0.85rem" }}>
            <label style={{ fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:4 }}>Remarks</label>
            <textarea style={{ width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,resize:"vertical",fontFamily:"inherit",boxSizing:"border-box" }}
              rows={2} value={remarks} onChange={e=>setRemarks(e.target.value)}
              placeholder="e.g. Engine overheating, AC failure" />
          </div>

          {err && <p style={{ color:"#dc2626",fontSize:13,margin:"6px 0" }}>{err}</p>}
          <button type="button" style={{ width:"100%",padding:"11px",fontSize:14,fontWeight:600,color:"#fff",background:"var(--sc-blue)",border:"none",borderRadius:8,cursor:"pointer",opacity:loading?0.65:1,fontFamily:"inherit" }}
            onClick={handleSubmit} disabled={loading}>
            {loading ? "Processing…" : `Confirm Replacement`}
          </button>
        </div>
      </div>
    </div>
  );
}
