import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { cache } from "../lib/cache";
import { exportToExcel } from "../lib/exportExcel";
import DateField from "../components/DateField";

const ACTION_COLORS = {
  "Checked Out":         { bg: "var(--yellow-bg)", color: "var(--yellow)" },
  "Returned":            { bg: "var(--green-bg)",  color: "var(--green)" },
  "Booking Extended":    { bg: "var(--blue-bg)",   color: "var(--sc-blue)" },
  "Sent to Maintenance": { bg: "var(--amber-bg)",  color: "var(--amber)" },
  "Marked Available":    { bg: "var(--green-bg)",  color: "var(--green)" },
  "Location Updated":    { bg: "var(--border-light)", color: "var(--sc-grey)" },
  "Payment Updated":     { bg: "var(--purple-bg)", color: "var(--purple)" },
  "Sold":                { bg: "var(--red-bg)",    color: "var(--red)" },
  "Note Added":          { bg: "var(--green-bg)",  color: "var(--green)" },
};

function fuelVal(val) {
  if (!val) return null;
  const s = String(val);
  if (s.includes("T21:") || s.match(/^\d{4}-\d{2}-\d{2}T/)) return null;
  return s;
}
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
      "Return Date": fmtDate(h.returnDate), "Fuel Out": fuelVal(h.fuelOut)||"", "Fuel In": fuelVal(h.fuelIn)||"",
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

  const sel = { padding:"8px 10px",fontSize:13,border:"1.5px solid var(--border)",borderRadius:7,background:"var(--surface)",color:"var(--text)" };
  const exportSel = { ...sel, width:"100%", boxSizing:"border-box" };

  if (loading) return <div className="loading-screen"><div className="spinner" />Loading history…</div>;
  if (error)   return <div style={{ textAlign:"center",padding:"3rem" }}><p style={{ color:"var(--red)" }}>{error}</p><button type="button" className="btn btn-ghost" onClick={() => { cache.clear("history"); load(true); }}>Retry</button></div>;

  return (
    <div>
      <div style={{ marginBottom:"1.25rem" }}>
        <div style={{ fontSize:22,fontWeight:700,color:"var(--text)" }}>History</div>
        <div style={{ fontSize:13,color:"var(--text-muted)",marginTop:2 }}>{history.length} logged actions.</div>
      </div>

      {showExport && canExport && (
        <div style={{ background:"var(--green-bg)",border:"1px solid var(--green-border)",borderRadius:10,padding:"1rem",marginBottom:"1.25rem" }}>
          <p style={{ fontSize:14,fontWeight:600,color:"var(--green)",marginBottom:10 }}>Export History to Excel</p>
          <div className="sc-hist-export-grid" style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10 }}>
            {[["Car (plate)",<input style={exportSel} placeholder="Search plate…" value={exPlate} onChange={e=>setExPlate(e.target.value)} />],
              ["Type",<select style={exportSel} value={exType} onChange={e=>setExType(e.target.value)}><option value="">All types</option>{types.map(t=><option key={t}>{t}</option>)}</select>],
              ["Location",<select style={exportSel} value={exLocation} onChange={e=>setExLocation(e.target.value)}><option value="">All locations</option>{locations.map(l=><option key={l}>{l}</option>)}</select>],
            ].map(([label, input]) => (
              <div key={label}><label style={{ fontSize:11,fontWeight:500,color:"var(--text-muted)",display:"block",marginBottom:4 }}>{label}</label>{input}</div>
            ))}
            <DateField label="From date" style={exportSel} value={exFrom} onChange={e=>setExFrom(e.target.value)} />
            <DateField label="To date" style={exportSel} value={exTo} onChange={e=>setExTo(e.target.value)} />
          </div>
          <p style={{ fontSize:12,color:"var(--text-muted)",margin:"10px 0" }}>Exports {exportRows.length} entries matching the filters above.</p>
          <button type="button" className="btn btn-success" onClick={handleExport}>
            ⬇ Download Excel ({exportRows.length} rows)
          </button>
        </div>
      )}

      <div className="sc-filter-row">
        <input style={sel} className="sc-search" placeholder="Search plate, type or client…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />

        <div className="sc-hf-row2">
          <select style={sel} value={fLocation} onChange={e => { setFLocation(e.target.value); setPage(1); }}>
            <option value="">All locations</option>{locations.map(l => <option key={l}>{l}</option>)}
          </select>
          <select style={sel} value={fType} onChange={e => { setFType(e.target.value); setPage(1); }}>
            <option value="">All types</option>{types.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="sc-hf-row3">
          <select style={sel} value={fAction} onChange={e => { setFAction(e.target.value); setPage(1); }}>
            <option value="">All actions</option>{actions.map(a => <option key={a}>{a}</option>)}
          </select>
          <select style={sel} value={fStaff} onChange={e => { setFStaff(e.target.value); setPage(1); }}>
            <option value="">All staff</option>{staff.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="sc-hf-row4">
          <DateField label="Date" style={sel} value={fDate} onChange={e => { setFDate(e.target.value); setPage(1); }} />
          {canExport && <button type="button" className="btn btn-success btn-sm" onClick={() => setShowExport(v => !v)}>⬇ Export</button>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { cache.clear("history"); load(true); }}>↻</button>
        </div>

        {(search || fAction || fLocation || fType || fStaff || fDate) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setFAction(""); setFLocation(""); setFType(""); setFStaff(""); setFDate(""); setPage(1); }}>Clear</button>
        )}
        <span className="result-count">{filtered.length} of {history.length}</span>
      </div>

      <div className="table-wrap sc-history-table">
        <table>
          <thead>
            <tr>{["Time","Plate","Type","Action","Client","Return Date","Garage","Fuel Out","Fuel In","Amount","Payment","Location","Remarks","Staff"].map(h =>
              <th key={h} data-label={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && <tr><td colSpan={14} style={{ textAlign:"center",padding:"2.5rem",color:"var(--text-faint)",fontSize:14 }}>No history entries found.</td></tr>}
            {paginated.map((h, i) => {
              const ac = ACTION_COLORS[h.action] || { bg:"var(--border-light)",color:"var(--text)" };
              return (
                <tr key={i}>
                  <td data-label="Time" style={{ whiteSpace:"nowrap",color:"var(--text-muted)",fontSize:12 }}>{fmt(h.timestamp)}</td>
                  <td data-label="Plate" style={{ fontWeight:600,fontSize:13 }}>
                    <span style={{ cursor:"pointer",color:"var(--sc-blue)",textDecoration:"underline" }}
                      onClick={() => navigate(`/car/${encodeURIComponent(h.plate)}`)}>
                      {h.plate}
                    </span>
                  </td>
                  <td data-label="Type" style={{ color:"var(--text-muted)" }}>{h.type}</td>
                  <td data-label="Action" style={{ padding:"10px 12px" }}>
                    <span style={{ display:"inline-block",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:99,background:ac.bg,color:ac.color,whiteSpace:"nowrap" }}>{h.action}</span>
                  </td>
                  <td data-label="Client" style={{ fontSize:13 }}>
                    {h.client ? <div><div style={{ fontWeight:500 }}>{h.client}</div>{h.clientPhone && <div style={{ fontSize:12,color:"var(--text-muted)" }}>{h.clientPhone}</div>}</div> : <span style={{ color:"var(--text-faint)" }}>—</span>}
                  </td>
                  <td data-label="Return Date" style={{ fontSize:12,color:"var(--text-muted)",whiteSpace:"nowrap" }}>{fmtDate(h.returnDate)}</td>
                  <td data-label="Garage" style={{ fontSize:12,color:"var(--amber)",fontWeight:500 }}>{h.garage || "—"}</td>
                  <td data-label="Fuel Out" style={{ fontSize:12,color:"var(--text-muted)" }}>{fuelVal(h.fuelOut) || "—"}</td>
                  <td data-label="Fuel In" style={{ fontSize:12,color:"var(--text-muted)" }}>{fuelVal(h.fuelIn) || "—"}</td>
                  <td data-label="Amount" style={{ fontSize:12,color:"var(--text-muted)",whiteSpace:"nowrap" }}>
                    {fmtMoney(h.amount, h.currency)}
                    {(h.policeFine || h.parkingFine) && (
                      <div style={{ fontSize:10,color:"var(--red)",marginTop:2 }}>
                        {h.policeFine ? `Police: ${fmtMoney(h.policeFine,h.currency)}` : ""}
                        {h.policeFine && h.parkingFine ? " · " : ""}
                        {h.parkingFine ? `Parking: ${fmtMoney(h.parkingFine,h.currency)}` : ""}
                      </div>
                    )}
                  </td>
                  <td data-label="Payment" style={{ fontSize:11 }}>
                    {h.paymentStatus ? <span>{h.paymentStatus}{h.amountPaid ? ` (${fmtMoney(h.amountPaid,h.currency)})` : ""}</span> : <span style={{ color:"var(--text-faint)" }}>—</span>}
                  </td>
                  <td data-label="Location" style={{ padding:"10px 12px" }}>
                    {h.location ? <span style={{ fontSize:12,background:"var(--border-light)",color:"var(--text)",borderRadius:5,padding:"2px 8px" }}>{h.location}</span> : <span style={{ color:"var(--text-faint)" }}>—</span>}
                  </td>
                  <td data-label="Remarks" style={{ fontSize:12,color:"var(--text-muted)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }} title={h.remarks}>{h.remarks || "—"}</td>
                  <td data-label="Staff" style={{ fontSize:12,fontWeight:500,color:"var(--text)" }}>{h.staffName || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:"1rem 0" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage(p=>p-1)} disabled={page===1}>‹ Prev</button>
          <span style={{ fontSize:13,color:"var(--text-muted)" }}>Page {page} of {totalPages}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage(p=>p+1)} disabled={page===totalPages}>Next ›</button>
        </div>
      )}
    </div>
  );
}
