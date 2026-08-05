import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import DateField from "../components/DateField";
import { exportToExcel } from "../lib/exportExcel";

function fmtDate(val) {
  if (!val) return "—";
  const d = String(val).split("T")[0];
  if (!d || d.length < 10) return val;
  const [y, m, dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}
function fmt(n, cur) {
  if (!n) return "—";
  return `${cur||"TZS"} ${Number(n).toLocaleString("en-US")}`;
}

const CURRENCIES = ["TZS", "USD", "EUR"];
const FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Empty"];
const PAYMENT_STATUSES = ["Paid", "Partial Paid", "Unpaid", "Long Term"];

export default function SubHirePage({ staffName }) {
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [selected, setSelected] = useState(null);
  const [search,   setSearch]   = useState("");
  const [fStatus,  setFStatus]  = useState("");
  const [showExport, setShowExport] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const res = await api.getSubHire(); setEntries(res.data || []); }
    catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    active:   entries.filter(e => e.status === "Active").length,
    returned: entries.filter(e => e.status === "Returned").length,
    unpaid:   entries.filter(e => e.status === "Active" && (e.paymentStatus === "Unpaid" || e.paymentStatus === "Partial Paid")).length,
  }), [entries]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter(e =>
      (!fStatus || e.status === fStatus) &&
      (!q || e.supplierName.toLowerCase().includes(q) || e.client.toLowerCase().includes(q) || e.vehicleDesc.toLowerCase().includes(q))
    );
  }, [entries, search, fStatus]);

  const sel = { padding:"8px 10px",fontSize:13,border:"1.5px solid var(--border)",borderRadius:7,background:"var(--surface)",color:"var(--text)" };

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.25rem",flexWrap:"wrap",gap:12 }}>
        <div>
          <div style={{ fontSize:22,fontWeight:700,color:"var(--text)" }}>Sub-Hire Bookings</div>
          <div style={{ fontSize:13,color:"var(--text-muted)",marginTop:2 }}>{entries.length} total bookings</div>
        </div>
        <div style={{ display:"flex",gap:8 }}>
          <button type="button" className="btn btn-success btn-sm" onClick={() => setShowExport(v => !v)}>⬇ Export</button>
          <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ Add Booking</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>↻</button>
        </div>
      </div>

      {showExport && (
        <ExportPanel entries={entries} onClose={() => setShowExport(false)} />
      )}

      <div className="sc-stat-grid" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        {[
          { label:"Active", value:stats.active, tint:"tint-yellow" },
          { label:"Returned", value:stats.returned, tint:"tint-green" },
          { label:"Client Unpaid", value:stats.unpaid, tint:"tint-red" },
        ].map(s => (
          <div key={s.label} className={`sc-stat-card ${s.tint}`}>
            <div className="sc-stat-label">{s.label}</div>
            <div className="sc-stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="sc-filter-row">
        <input style={sel} className="sc-search" placeholder="Search supplier, client or vehicle…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select style={sel} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Returned">Returned</option>
        </select>
        <span className="result-count">{filtered.length} bookings</span>
      </div>

      {loading ? <div className="loading-screen"><div className="spinner" />Loading…</div> : (
        <div className="table-wrap sc-subhire-table">
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead>
              <tr>{["Supplier","Vehicle","Plate","Client","From","To","Client Amount","Supplier Amount","Status","Action"].map(h =>
                <th key={h} data-label={h} style={{ padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:"var(--text-muted)",borderBottom:"1px solid var(--border)",background:"var(--bg)",textTransform:"uppercase",letterSpacing:".4px",whiteSpace:"nowrap" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign:"center",padding:"2.5rem",color:"var(--text-faint)" }}>No bookings found.</td></tr>}
              {filtered.map((e, i) => (
                <tr key={i} style={{ borderBottom:"1px solid var(--border-light)" }}>
                  <td data-label="Supplier" style={{ padding:"10px 12px",fontWeight:600 }}>
                    {e.supplierName}
                    {e.supplierContact && <div style={{ fontSize:12,color:"var(--text-muted)" }}>{e.supplierContact}</div>}
                  </td>
                  <td data-label="Vehicle" style={{ padding:"10px 12px",color:"var(--text-muted)" }}>{e.vehicleDesc}</td>
                  <td data-label="Plate" style={{ padding:"10px 12px",fontWeight:600,fontSize:13 }}>{e.plate||"—"}</td>
                  <td data-label="Client" style={{ padding:"10px 12px" }}>
                    {e.client}<br/>{e.clientPhone && <span style={{ fontSize:12,color:"var(--text-muted)" }}>{e.clientPhone}</span>}
                  </td>
                  <td data-label="From" style={{ padding:"10px 12px",fontSize:12,color:"var(--text-muted)" }}>{fmtDate(e.bookedFrom)}</td>
                  <td data-label="To" style={{ padding:"10px 12px",fontSize:12,color:"var(--text-muted)" }}>{fmtDate(e.returnDate)}</td>
                  <td data-label="Client Amount" style={{ padding:"10px 12px",fontSize:12 }}>
                    {fmt(e.amount, e.currency)}
                    <div style={{ fontSize:11,color:e.paymentStatus==="Unpaid"?"var(--red)":"var(--green)" }}>{e.paymentStatus}</div>
                  </td>
                  <td data-label="Supplier Amount" style={{ padding:"10px 12px",fontSize:12 }}>
                    {fmt(e.supplierAmount, e.supplierCurrency)}
                    <div style={{ fontSize:11,color:e.supplierPayStatus==="Unpaid"?"var(--red)":"var(--green)" }}>{e.supplierPayStatus}</div>
                  </td>
                  <td data-label="Status" style={{ padding:"10px 12px" }}>
                    <span style={{ display:"inline-block",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:99,
                      background:e.status==="Active"?"var(--amber-bg)":"var(--green-bg)",
                      color:e.status==="Active"?"var(--amber)":"var(--green)" }}>{e.status}</span>
                  </td>
                  <td style={{ padding:"10px 12px" }}>
                    {e.status === "Active" && (
                      <button onClick={() => setSelected(e)}
                        style={{ fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid var(--sc-blue)",background:"var(--blue-bg)",color:"var(--sc-blue)",cursor:"pointer",fontWeight:500 }}>
                        Mark Returned
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddSubHireModal staffName={staffName} onClose={() => setShowAdd(false)} onSaved={load} />}
      {selected && <ReturnSubHireModal entry={selected} staffName={staffName} onClose={() => setSelected(null)} onSaved={load} />}
    </div>
  );
}

// ── Export Panel ──────────────────────────────────────────────
// Two statement modes: Client Statement shows the client-facing side of
// the deal (who rented, what they owe/paid); Supplier Statement is the
// mirror for the supplier's side, deliberately excluding client pricing —
// it keeps just one column noting who the customer was, for the
// supplier's own reconciliation, without exposing your client-side rates.
async function loadJsPDFSubHire() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

const CLIENT_COLUMNS = [
  ["Plate", e => e.plate],
  ["Vehicle", e => e.vehicleDesc],
  ["Client", e => e.client],
  ["Phone", e => e.clientPhone],
  ["Booked From", e => fmtDate(e.bookedFrom)],
  ["Return Date", e => fmtDate(e.returnDate)],
  ["Actual Return", e => fmtDate(e.actualReturn)],
  ["Location", e => e.location],
  ["Amount", e => fmt(e.amount, e.currency)],
  ["Payment Status", e => e.paymentStatus],
  ["Amount Paid", e => fmt(e.amountPaid, e.currency)],
  ["Police Fine", e => e.policeFine || "—"],
  ["Parking Fine", e => e.parkingFine || "—"],
  ["Remarks", e => e.remarks || "—"],
  ["Staff", e => e.staffName],
];

const SUPPLIER_COLUMNS = [
  ["Plate", e => e.plate],
  ["Vehicle", e => e.vehicleDesc],
  ["Supplier", e => e.supplierName],
  ["Supplier Contact", e => e.supplierContact],
  ["Customer (Ref)", e => e.client],
  ["Booked From", e => fmtDate(e.bookedFrom)],
  ["Return Date", e => fmtDate(e.returnDate)],
  ["Actual Return", e => fmtDate(e.actualReturn)],
  ["Location", e => e.location],
  ["Supplier Amount", e => fmt(e.supplierAmount, e.supplierCurrency)],
  ["Supplier Pay Status", e => e.supplierPayStatus],
  ["Supplier Amount Paid", e => fmt(e.supplierAmountPaid, e.supplierCurrency)],
  ["Remarks", e => e.remarks || "—"],
];

function ExportPanel({ entries, onClose }) {
  const [mode, setMode]   = useState("client"); // "client" | "supplier"
  const [status, setStatus] = useState("");
  const [supplier, setSupplier] = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [location, setLocation] = useState("");
  const [from, setFrom]   = useState("");
  const [to, setTo]       = useState("");
  const [generating, setGenerating] = useState(false);

  const suppliers = useMemo(() => [...new Set(entries.map(e => e.supplierName).filter(Boolean))].sort(), [entries]);
  const locations = useMemo(() => [...new Set(entries.map(e => e.location).filter(Boolean))].sort(), [entries]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (status && e.status !== status) return false;
      if (supplier && e.supplierName !== supplier) return false;
      if (location && e.location !== location) return false;
      if (payStatus) {
        const relevant = mode === "client" ? e.paymentStatus : e.supplierPayStatus;
        if (relevant !== payStatus) return false;
      }
      const bookedFrom = e.bookedFrom ? e.bookedFrom.slice(0, 10) : "";
      if (from && (!bookedFrom || bookedFrom < from)) return false;
      if (to && (!bookedFrom || bookedFrom > to)) return false;
      return true;
    });
  }, [entries, status, supplier, location, payStatus, mode]);

  const columns = mode === "client" ? CLIENT_COLUMNS : SUPPLIER_COLUMNS;
  const label = () => {
    const parts = [mode === "client" ? "ClientStatement" : "SupplierStatement"];
    if (supplier) parts.push(supplier.replace(/\s/g, ""));
    if (from || to) parts.push(`${from || "start"}_to_${to || "now"}`);
    return parts.join("_");
  };

  const handleExportExcel = () => {
    const rows = filtered.map(e => {
      const row = {};
      columns.forEach(([label, get]) => { row[label] = get(e); });
      return row;
    });
    exportToExcel(`SmilesCars_SubHire_${label()}.xlsx`, [{ name: mode === "client" ? "Client Statement" : "Supplier Statement", rows }]);
  };

  const handleExportPDF = async () => {
    setGenerating(true);
    try {
      const jsPDF = await loadJsPDFSubHire();
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const marginX = 10;
      const usableW = pageW - marginX * 2;
      const colW = usableW / columns.length;
      const title = mode === "client" ? "Sub-Hire — Client Statement" : "Sub-Hire — Supplier Statement";

      doc.setFont("helvetica", "bold"); doc.setFontSize(14);
      doc.text(title, marginX, 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text(`Generated ${new Date().toLocaleDateString()} · ${filtered.length} bookings`, marginX, 20);

      let y = 28;
      const rowH = 7;
      const drawHeader = () => {
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
        doc.setFillColor(230, 230, 230);
        doc.rect(marginX, y - 5, usableW, rowH, "F");
        columns.forEach(([label], i) => {
          doc.text(String(label), marginX + i * colW + 1, y);
        });
        y += rowH;
      };
      drawHeader();

      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      filtered.forEach((e, idx) => {
        if (y > doc.internal.pageSize.getHeight() - 12) {
          doc.addPage();
          y = 20;
          drawHeader();
        }
        if (idx % 2 === 1) { doc.setFillColor(248, 248, 248); doc.rect(marginX, y - 5, usableW, rowH, "F"); }
        columns.forEach(([, get], i) => {
          const val = String(get(e) ?? "—");
          const truncated = val.length > 22 ? val.slice(0, 20) + "…" : val;
          doc.text(truncated, marginX + i * colW + 1, y);
        });
        y += rowH;
      });

      doc.save(`SmilesCars_SubHire_${label()}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  const sel = { padding:"8px 10px",fontSize:13,border:"1.5px solid var(--border)",borderRadius:7,background:"var(--surface)",color:"var(--text)", width:"100%", boxSizing:"border-box" };

  return (
    <div style={{ background:"var(--green-bg)",border:"1px solid var(--green-border)",borderRadius:10,padding:"1rem",marginBottom:"1.25rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <p style={{ fontSize:14,fontWeight:600,color:"var(--green)",margin:0 }}>Export Sub-Hire</p>
        <button type="button" onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",fontSize:14,color:"var(--text-muted)" }}>✕</button>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        {[["client","Client Statement"],["supplier","Supplier Statement"]].map(([val,lab]) => (
          <button key={val} type="button" onClick={() => { setMode(val); setPayStatus(""); }}
            style={{ flex:1, padding:"8px 0", fontSize:13, fontWeight:600, borderRadius:7, cursor:"pointer",
              border:`1.5px solid ${mode===val ? "var(--green)" : "var(--border)"}`,
              background: mode===val ? "var(--surface)" : "transparent",
              color: mode===val ? "var(--green)" : "var(--text-muted)" }}>
            {lab}
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
        <div><label style={{ fontSize:11,fontWeight:500,color:"var(--text-muted)",display:"block",marginBottom:4 }}>Status</label>
          <select style={sel} value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Active">Active</option>
            <option value="Returned">Returned</option>
          </select>
        </div>
        <div><label style={{ fontSize:11,fontWeight:500,color:"var(--text-muted)",display:"block",marginBottom:4 }}>Supplier</label>
          <select style={sel} value={supplier} onChange={e=>setSupplier(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label style={{ fontSize:11,fontWeight:500,color:"var(--text-muted)",display:"block",marginBottom:4 }}>{mode==="client" ? "Client" : "Supplier"} Payment Status</label>
          <select style={sel} value={payStatus} onChange={e=>setPayStatus(e.target.value)}>
            <option value="">All</option>
            {PAYMENT_STATUSES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label style={{ fontSize:11,fontWeight:500,color:"var(--text-muted)",display:"block",marginBottom:4 }}>Location</label>
          <select style={sel} value={location} onChange={e=>setLocation(e.target.value)}>
            <option value="">All locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <DateField label="From" style={sel} value={from} onChange={e=>setFrom(e.target.value)} />
          <DateField label="To" style={sel} value={to} onChange={e=>setTo(e.target.value)} />
        </div>
      </div>

      <p style={{ fontSize:12,color:"var(--text-muted)",margin:"12px 0" }}>
        {mode === "supplier" && "Client pricing is excluded from the Supplier Statement — only the customer name is shown for reference. "}
        Exports {filtered.length} booking{filtered.length !== 1 ? "s" : ""} matching the filters above.
      </p>

      <div style={{ display:"flex", gap:8 }}>
        <button type="button" className="btn btn-success" onClick={handleExportExcel} disabled={filtered.length===0}>
          ⬇ Excel ({filtered.length})
        </button>
        <button type="button" className="btn btn-success" onClick={handleExportPDF} disabled={filtered.length===0 || generating}>
          {generating ? "Generating…" : `⬇ PDF (${filtered.length})`}
        </button>
      </div>
    </div>
  );
}

function AddSubHireModal({ staffName, onClose, onSaved }) {
  const today = new Date().toISOString().split("T")[0];
  const [f, setF] = useState({
    supplierName:"", supplierContact:"", vehicleDesc:"", plate:"", client:"", clientPhone:"",
    bookedFrom:today, returnDate:"", location:"", fuelOut:"",
    amount:"", currency:"TZS", paymentStatus:"Unpaid", amountPaid:"",
    supplierAmount:"", supplierCurrency:"TZS", supplierPayStatus:"Unpaid", supplierAmountPaid:"",
    policeFine:"", parkingFine:"", remarks:"",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!f.supplierName.trim()) { setError("Supplier name is required."); return; }
    if (!f.vehicleDesc.trim())  { setError("Vehicle description is required."); return; }
    if (!f.client.trim())       { setError("Client name is required."); return; }
    if (!f.bookedFrom)          { setError("Start date is required."); return; }
    setSaving(true); setError("");
    try {
      await api.addSubHire({ ...f, staffName });
      onSaved(); onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const inp = { width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid var(--border)",borderRadius:7,background:"var(--surface)",boxSizing:"border-box",fontFamily:"inherit" };
  const lbl = { fontSize:12,fontWeight:500,color:"var(--text-muted)",display:"block",marginBottom:4 };
  const row = { display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 };
  const sel = { ...inp };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 }} onClick={onClose}>
      <div style={{ background:"var(--surface)",borderRadius:14,width:520,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",background:"var(--green)",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <p style={{ fontSize:16,fontWeight:700,color:"var(--surface)",margin:0 }}>New Sub-Hire Booking</p>
          <button style={{ background:"rgba(255,255,255,0.25)",border:"none",color:"var(--surface)",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:"1.25rem" }}>
          <div style={row}>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Supplier Name *</label><input style={inp} value={f.supplierName} onChange={e=>set("supplierName",e.target.value)} placeholder="Supplier company or name" autoFocus /></div>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Supplier Contact</label><input style={inp} value={f.supplierContact} onChange={e=>set("supplierContact",e.target.value)} placeholder="+255..." /></div>
          </div>
          <div style={row}>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Vehicle Description *</label><input style={inp} value={f.vehicleDesc} onChange={e=>set("vehicleDesc",e.target.value)} placeholder="e.g. Toyota Prado - White" /></div>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Plate No.</label><input style={inp} value={f.plate} onChange={e=>set("plate",e.target.value.toUpperCase())} placeholder="e.g. T 235 DYS" /></div>
          </div>
          <div style={row}>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Client Name *</label><input style={inp} value={f.client} onChange={e=>set("client",e.target.value)} placeholder="Client full name" /></div>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Client Phone</label><input style={inp} value={f.clientPhone} onChange={e=>set("clientPhone",e.target.value)} placeholder="+255..." /></div>
          </div>
          <div style={row}>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>From Date *</label><input style={inp} type="date" value={f.bookedFrom} onChange={e=>set("bookedFrom",e.target.value)} /></div>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Return Date</label><input style={inp} type="date" value={f.returnDate} onChange={e=>set("returnDate",e.target.value)} /></div>
          </div>
          <div style={row}>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Fuel Out</label>
              <select style={sel} value={f.fuelOut} onChange={e=>set("fuelOut",e.target.value)}>
                <option value="">— Select —</option>{FUEL_LEVELS.map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Location</label><input style={inp} value={f.location} onChange={e=>set("location",e.target.value)} placeholder="e.g. Dar - NBAA" /></div>
          </div>
          <p style={{ fontSize:12,fontWeight:600,color:"var(--text)",margin:"8px 0 6px",textTransform:"uppercase",letterSpacing:".3px" }}>Client Payment</p>
          <div style={row}>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Client Amount</label>
              <div style={{ display:"flex",gap:6 }}>
                <input style={{ ...inp,flex:1 }} type="number" value={f.amount} onChange={e=>set("amount",e.target.value)} placeholder="0" />
                <select style={{ ...sel,width:76 }} value={f.currency} onChange={e=>set("currency",e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
              </div>
            </div>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Payment Status</label>
              <select style={sel} value={f.paymentStatus} onChange={e=>set("paymentStatus",e.target.value)}>{PAYMENT_STATUSES.map(p=><option key={p}>{p}</option>)}</select>
              {f.paymentStatus==="Partial Paid" && <input style={{ ...inp,marginTop:6 }} type="number" value={f.amountPaid} onChange={e=>set("amountPaid",e.target.value)} placeholder="Amount paid" />}
            </div>
          </div>
          <p style={{ fontSize:12,fontWeight:600,color:"var(--text)",margin:"8px 0 6px",textTransform:"uppercase",letterSpacing:".3px" }}>Supplier Payment</p>
          <div style={row}>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Supplier Amount</label>
              <div style={{ display:"flex",gap:6 }}>
                <input style={{ ...inp,flex:1 }} type="number" value={f.supplierAmount} onChange={e=>set("supplierAmount",e.target.value)} placeholder="0" />
                <select style={{ ...sel,width:76 }} value={f.supplierCurrency} onChange={e=>set("supplierCurrency",e.target.value)}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select>
              </div>
            </div>
            <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Supplier Payment Status</label>
              <select style={sel} value={f.supplierPayStatus} onChange={e=>set("supplierPayStatus",e.target.value)}>{PAYMENT_STATUSES.map(p=><option key={p}>{p}</option>)}</select>
            </div>
          </div>
          <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Remarks</label><textarea style={{ ...inp,resize:"vertical" }} rows={2} value={f.remarks} onChange={e=>set("remarks",e.target.value)} placeholder="Optional notes" /></div>
          {error && <p style={{ color:"var(--red)",fontSize:13,margin:"6px 0" }}>{error}</p>}
          <button style={{ width:"100%",padding:11,fontSize:15,fontWeight:600,color:"var(--surface)",background:"var(--green)",border:"none",borderRadius:8,cursor:"pointer",opacity:saving?0.65:1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnSubHireModal({ entry, staffName, onClose, onSaved }) {
  const today = new Date().toISOString().split("T")[0];
  const [actualReturn, setActualReturn] = useState(today);
  const [fuelIn,       setFuelIn]       = useState("");
  const [payStatus,    setPayStatus]    = useState(entry.paymentStatus || "Unpaid");
  const [amountPaid,   setAmountPaid]   = useState(entry.amountPaid || "");
  const [supPayStatus, setSupPayStatus] = useState(entry.supplierPayStatus || "Unpaid");
  const [supAmtPaid,   setSupAmtPaid]   = useState(entry.supplierAmountPaid || "");
  const [remarks,      setRemarks]      = useState("");
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState("");

  const handleReturn = async () => {
    setSaving(true); setError("");
    try {
      await api.returnSubHire({ id: entry.id, staffName, actualReturn, fuelIn, paymentStatus: payStatus, amountPaid, supplierPayStatus: supPayStatus, supplierAmountPaid: supAmtPaid, remarks });
      onSaved(); onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const inp = { width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid var(--border)",borderRadius:7,background:"var(--surface)",boxSizing:"border-box",fontFamily:"inherit" };
  const lbl = { fontSize:12,fontWeight:500,color:"var(--text-muted)",display:"block",marginBottom:4 };
  const sel = { ...inp };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 }} onClick={onClose}>
      <div style={{ background:"var(--surface)",borderRadius:14,width:440,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",background:"var(--sc-blue)",display:"flex",justifyContent:"space-between" }}>
          <div><p style={{ fontSize:15,fontWeight:700,color:"var(--surface)",margin:0 }}>Mark as Returned</p>
            <p style={{ fontSize:12,color:"rgba(255,255,255,0.8)",margin:"2px 0 0" }}>{entry.vehicleDesc} · {entry.supplierName}</p></div>
          <button style={{ background:"rgba(255,255,255,0.25)",border:"none",color:"var(--surface)",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:"1.25rem" }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"0.85rem" }}>
            <div><label style={lbl}>Returned Date</label><input style={inp} type="date" value={actualReturn} onChange={e=>setActualReturn(e.target.value)} /></div>
            <div><label style={lbl}>Fuel In</label>
              <select style={sel} value={fuelIn} onChange={e=>setFuelIn(e.target.value)}>
                <option value="">— Select —</option>{FUEL_LEVELS.map(f=><option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"0.85rem" }}>
            <div><label style={lbl}>Client Payment Status</label>
              <select style={sel} value={payStatus} onChange={e=>setPayStatus(e.target.value)}>{PAYMENT_STATUSES.map(p=><option key={p}>{p}</option>)}</select>
              {payStatus==="Partial Paid" && <input style={{ ...inp,marginTop:6 }} type="number" value={amountPaid} onChange={e=>setAmountPaid(e.target.value)} placeholder="Amount paid" />}
            </div>
            <div><label style={lbl}>Supplier Payment Status</label>
              <select style={sel} value={supPayStatus} onChange={e=>setSupPayStatus(e.target.value)}>{PAYMENT_STATUSES.map(p=><option key={p}>{p}</option>)}</select>
              {supPayStatus==="Partial Paid" && <input style={{ ...inp,marginTop:6 }} type="number" value={supAmtPaid} onChange={e=>setSupAmtPaid(e.target.value)} placeholder="Amount paid" />}
            </div>
          </div>
          <div style={{ marginBottom:"0.85rem" }}><label style={lbl}>Remarks</label>
            <textarea style={{ ...inp,resize:"vertical" }} rows={2} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional notes on return" /></div>
          {error && <p style={{ color:"var(--red)",fontSize:13,margin:"6px 0" }}>{error}</p>}
          <button style={{ width:"100%",padding:11,fontSize:15,fontWeight:600,color:"var(--surface)",background:"var(--sc-blue)",border:"none",borderRadius:8,cursor:"pointer",opacity:saving?0.65:1 }} onClick={handleReturn} disabled={saving}>
            {saving ? "Saving…" : "Confirm Return"}
          </button>
        </div>
      </div>
    </div>
  );
}
