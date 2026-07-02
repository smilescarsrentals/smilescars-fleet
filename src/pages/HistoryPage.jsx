import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { cache } from "../lib/cache";
import { exportToExcel } from "../lib/exportExcel";

const ACTION_COLORS = {
  "Checked Out":         { bg: "#fef9c3", color: "#854d0e" },
  "Returned":            { bg: "#dcfce7", color: "#15803d" },
  "Booking Extended":    { bg: "#e0f2fe", color: "#0369a1" },
  "Sent to Maintenance": { bg: "#ffedd5", color: "#c2410c" },
  "Marked Available":    { bg: "#dcfce7", color: "#15803d" },
  "Location Updated":    { bg: "#f3f4f6", color: "#374151" },
  "Payment Updated":     { bg: "#ede9fe", color: "#6d28d9" },
  "Sold":                { bg: "#fee2e2", color: "#b91c1c" },
  "Note Added":          { bg: "#f0fdf4", color: "#15803d" },
};

function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-TZ", { day:"2-digit",month:"short",year:"numeric" }) +
    " " + d.toLocaleTimeString("en-TZ", { hour:"2-digit",minute:"2-digit" });
}
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

export default function HistoryPage({ role }) {
  const canExport = role === "Admin" || role === "Manager";
  const navigate  = useNavigate();
  const [history,    setHistory]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [search,     setSearch]     = useState("");
  const [fAction,    setFAction]    = useState("");
  const [fLocation,  setFLocation]  = useState("");
  const [fType,      setFType]      = useState("");
  const [fStaff,     setFStaff]     = useState("");
  const [fDate,      setFDate]      = useState("");
  const [showExport, setShowExport] = useState(false);
  const [exPlate,    setExPlate]    = useState("");
  const [exType,     setExType]     = useState("");
  const [exLocation, setExLocation] = useState("");
  const [exFrom,     setExFrom]     = useState("");
  const [exTo,       setExTo]       = useState("");
  const [page,       setPage]       = useState(1);
  const PER_PAGE = 30;

  const load = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = cache.get("history", 120000);
      if (cached) { setHistory(cached); setLoading(false); return; }
    }
    setLoading(true); setError("");
    try {
      const res = await api.getHistory();
      const data = res.data || [];
      setHistory(data);
      cache.set("history", data);
    } catch (e) { setError("Failed to load history: " + e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const actions   = useMemo(() => [...new Set(history.map(h => h.action).filter(Boolean))].sort(), [history]);
  const types     = useMemo(() => [...new Set(history.map(h => h.type).filter(Boolean))].sort(), [history]);
  const locations = useMemo(() => [...new Set(history.map(h => h.location).filter(Boolean))].sort(), [history]);
  const staff     = useMemo(() => [...new Set(history.map(h => h.staffName).filter(Boolean))].sort(), [history]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return history.filter(h => {
      const ts = h.timestamp ? h.timestamp.split("T")[0] : "";
      return (
        (!q || h.plate.toLowerCase().includes(q) || h.type.toLowerCase().includes(q) || (h.client||"").toLowerCase().includes(q)) &&
        (!fAction   || h.action    === fAction) &&
        (!fLocation || h.location  === fLocation) &&
        (!fType     || h.type      === fType) &&
        (!fStaff    || h.staffName === fStaff) &&
        (!fDate     || ts === fDate)
      );
    });
  }, [history, search, fAction, fLocation, fType, fStaff, fDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const exportRows = useMemo(() => {
    const q = exPlate.toLowerCase();
    return history.filter(h => {
      const ts = h.timestamp ? h.timestamp.split("T")[0] : "";
      return (!q || h.plate.toLowerCase().includes(q)) &&
        (!exType     || h.type     === exType) &&
        (!exLocation || h.location === exLocation) &&
        (!exFrom     || ts >= exFrom) &&
        (!exTo       || ts <= exTo);
    });
  }, [history, exPlate, exType, exLocation, exFrom, exTo]);

  const handleExport = () => {
    const rows = exportRows.map(h => ({
      Time: fmt(h.timestamp), Plate: h.plate, Type: h.type, Action: h.action,
      Client: h.client, Phone: h.clientPhone, "Booked From": fmtDate(h.bookedFrom),
      "Return Date": fmtDate(h.returnDate), "Fuel Out": h.fuelOut, "Fuel In": h.fuelIn,
      Amount: h.amount, Currency: h.currency, "Police Fine": h.policeFine, "Parking Fine": h.parkingFine,
      Garage: h.garage, Location: h.location, "Payment Status": h.paymentStatus,
      "Amount Paid": h.amountPaid, "KM Out": h.kmOut, "KM In": h.kmIn, Driver: h.driver,
      Remarks: h.remarks, Staff: h.staffName,
    }));
    const label = exFrom || exTo ? `${exFrom||"start"}_to_${exTo||"now"}` :
                  exPlate ? exPlate.replace(/\s/g,"") :
                  exLocation ? exLocation.replace(/\s/g,"") : "all";
    exportToExcel(`SmilesCars_History_${label}.xlsx`, [{ name: "History", rows }]);
    setShowExport(false);
  };

  const sel = { padding:"8px 10px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111" };
  const exportSel = { ...sel, width:"100%", boxSizing:"border-box" };

  if (loading) return <div style={{ textAlign:"center",padding:"3rem",color:"#666" }}>Loading history…</div>;
  if (error)   return <div style={{ textAlign:"center",padding:"3rem" }}><p style={{ color:"#dc2626" }}>{error}</p><button onClick={() => { cache.clear("history"); load(true); }}>Retry</button></div>;

  return (
    <div>
      {showExport && canExport && (
        <div style={{ background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"1rem",marginBottom:"1.25rem" }}>
          <p style={{ fontSize:14,fontWeight:600,color:"#15803d",marginBottom:10 }}>Export History to Excel</p>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10 }}>
            {[["Car (plate)",<input style={exportSel} placeholder="Search plate…" value={exPlate} onChange={e=>setExPlate(e.target.value)} />],
              ["Type",<select style={exportSel} value={exType} onChange={e=>setExType(e.target.value)}><option value="">All types</option>{types.map(t=><option key={t}>{t}</option>)}</select>],
              ["Location",<select style={exportSel} value={exLocation} onChange={e=>setExLocation(e.target.value)}><option value="">All locations</option>{locations.map(l=><option key={l}>{l}</option>)}</select>],
              ["From date",<input type="date" style={exportSel} value={exFrom} onChange={e=>setExFrom(e.target.value)} />],
              ["To date",<input type="date" style={exportSel} value={exTo} onChange={e=>setExTo(e.target.value)} />],
            ].map(([label, input]) => (
              <div key={label}><label style={{ fontSize:11,fontWeight:500,color:"#555",display:"block",marginBottom:4 }}>{label}</label>{input}</div>
            ))}
          </div>
          <p style={{ fontSize:12,color:"#888",margin:"10px 0" }}>Exports {exportRows.length} entries matching the filters above.</p>
          <button style={{ padding:"9px 18px",fontSize:13,fontWeight:600,background:"#16a34a",color:"#fff",border:"none",borderRadius:7,cursor:"pointer" }} onClick={handleExport}>
            ⬇ Download Excel ({exportRows.length} rows)
          </button>
        </div>
      )}

      <div className="sc-filter-row">
        <input style={{ ...sel, width:220 }} className="sc-search" placeholder="Search plate, type or client…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select style={sel} value={fAction} onChange={e => { setFAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>{actions.map(a => <option key={a}>{a}</option>)}
        </select>
        <select style={sel} value={fLocation} onChange={e => { setFLocation(e.target.value); setPage(1); }}>
          <option value="">All locations</option>{locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <select style={sel} value={fType} onChange={e => { setFType(e.target.value); setPage(1); }}>
          <option value="">All types</option>{types.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={sel} value={fStaff} onChange={e => { setFStaff(e.target.value); setPage(1); }}>
          <option value="">All staff</option>{staff.map(s => <option key={s}>{s}</option>)}
        </select>
        <input type="date" style={sel} value={fDate} onChange={e => { setFDate(e.target.value); setPage(1); }} title="Filter by date" />
        {(search || fAction || fLocation || fType || fStaff || fDate) && (
          <button style={{ padding:"8px 12px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",cursor:"pointer",color:"#555" }}
            onClick={() => { setSearch(""); setFAction(""); setFLocation(""); setFType(""); setFStaff(""); setFDate(""); setPage(1); }}>Clear</button>
        )}
        <span style={{ fontSize:12,color:"#888",marginLeft:"auto" }}>{filtered.length} of {history.length}</span>
        {canExport && <button style={{ padding:"8px 12px",fontSize:13,border:"1.5px solid #16a34a",borderRadius:7,background:"#f0fdf4",cursor:"pointer",color:"#15803d",fontWeight:500 }}
          onClick={() => setShowExport(v => !v)}>⬇ Export</button>}
        <button style={{ padding:"8px 12px",fontSize:16,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",cursor:"pointer",color:"#555" }}
          onClick={() => { cache.clear("history"); load(true); }}>↻</button>
      </div>

      <div className="sc-table-wrap">
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
          <thead>
            <tr>{["Time","Plate","Type","Action","Client","Return Date","Garage","Fuel Out","Fuel In","Amount","Payment","Location","Remarks","Staff"].map(h =>
              <th key={h} style={{ padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:"#888",borderBottom:"1px solid #e5e7eb",background:"#fafafa",textTransform:"uppercase",letterSpacing:".4px",whiteSpace:"nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && <tr><td colSpan={14} style={{ textAlign:"center",padding:"2.5rem",color:"#aaa",fontSize:14 }}>No history entries found.</td></tr>}
            {paginated.map((h, i) => {
              const ac = ACTION_COLORS[h.action] || { bg:"#f3f4f6",color:"#374151" };
              return (
                <tr key={i} style={{ borderBottom:"1px solid #f3f4f6" }}>
                  <td data-label="Time" style={{ padding:"10px 12px",whiteSpace:"nowrap",color:"#888",fontSize:12 }}>{fmt(h.timestamp)}</td>
                  <td data-label="Plate" style={{ padding:"10px 12px",fontWeight:600,fontSize:13 }}>
                    <span style={{ cursor:"pointer",color:"#1d4ed8",textDecoration:"underline" }}
                      onClick={() => navigate(`/car/${encodeURIComponent(h.plate)}`)}>
                      {h.plate}
                    </span>
                  </td>
                  <td data-label="Type" style={{ padding:"10px 12px",color:"#555" }}>{h.type}</td>
                  <td data-label="Action" style={{ padding:"10px 12px" }}>
                    <span style={{ display:"inline-block",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:99,background:ac.bg,color:ac.color,whiteSpace:"nowrap" }}>{h.action}</span>
                  </td>
                  <td data-label="Client" style={{ padding:"10px 12px",fontSize:13 }}>
                    {h.client ? <div><div style={{ fontWeight:500 }}>{h.client}</div>{h.clientPhone && <div style={{ fontSize:12,color:"#888" }}>{h.clientPhone}</div>}</div> : <span style={{ color:"#ccc" }}>—</span>}
                  </td>
                  <td data-label="Return Date" style={{ padding:"10px 12px",fontSize:12,color:"#555",whiteSpace:"nowrap" }}>{fmtDate(h.returnDate)}</td>
                  <td data-label="Garage" style={{ padding:"10px 12px",fontSize:12,color:"#c2410c",fontWeight:500 }}>{h.garage || "—"}</td>
                  <td data-label="Fuel Out" style={{ padding:"10px 12px",fontSize:12,color:"#555" }}>{h.fuelOut || "—"}</td>
                  <td data-label="Fuel In" style={{ padding:"10px 12px",fontSize:12,color:"#555" }}>{h.fuelIn || "—"}</td>
                  <td data-label="Amount" style={{ padding:"10px 12px",fontSize:12,color:"#555",whiteSpace:"nowrap" }}>
                    {fmtMoney(h.amount, h.currency)}
                    {(h.policeFine || h.parkingFine) && (
                      <div style={{ fontSize:10,color:"#dc2626",marginTop:2 }}>
                        {h.policeFine ? `Police: ${fmtMoney(h.policeFine,h.currency)}` : ""}
                        {h.policeFine && h.parkingFine ? " · " : ""}
                        {h.parkingFine ? `Parking: ${fmtMoney(h.parkingFine,h.currency)}` : ""}
                      </div>
                    )}
                  </td>
                  <td data-label="Payment" style={{ padding:"10px 12px",fontSize:11 }}>
                    {h.paymentStatus ? <span>{h.paymentStatus}{h.amountPaid ? ` (${fmtMoney(h.amountPaid,h.currency)})` : ""}</span> : <span style={{ color:"#ccc" }}>—</span>}
                  </td>
                  <td data-label="Location" style={{ padding:"10px 12px" }}>
                    {h.location ? <span style={{ fontSize:12,background:"#f3f4f6",color:"#374151",borderRadius:5,padding:"2px 8px" }}>{h.location}</span> : <span style={{ color:"#ccc" }}>—</span>}
                  </td>
                  <td data-label="Remarks" style={{ padding:"10px 12px",fontSize:12,color:"#777",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }} title={h.remarks}>{h.remarks || "—"}</td>
                  <td data-label="Staff" style={{ padding:"10px 12px",fontSize:12,fontWeight:500,color:"#374151" }}>{h.staffName || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:"1rem 0" }}>
          <button style={{ padding:"7px 16px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",cursor:"pointer" }} onClick={() => setPage(p=>p-1)} disabled={page===1}>‹ Prev</button>
          <span style={{ fontSize:13,color:"#555" }}>Page {page} of {totalPages}</span>
          <button style={{ padding:"7px 16px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",cursor:"pointer" }} onClick={() => setPage(p=>p+1)} disabled={page===totalPages}>Next ›</button>
        </div>
      )}
    </div>
  );
}
