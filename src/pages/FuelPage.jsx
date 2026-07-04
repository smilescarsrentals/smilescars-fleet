// src/pages/FuelPage.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { post, get } from "../lib/api";

// ── Helpers ──────────────────────────────────────────────────
function fmtNum(n) {
  if (!n && n !== 0) return "";
  return Number(n).toLocaleString();
}
function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function displayDate(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
}
function fmtInput(v) {
  const raw = v.replace(/,/g, "");
  if (raw === "" || isNaN(raw)) return v;
  return Number(raw).toLocaleString();
}

// ── PDF (jsPDF loaded from CDN) ──────────────────────────────
async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function fetchAsDataUrl(path) {
  try {
    const res  = await fetch(path);
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch { return null; }
}

async function generateFuelPDF(entry) {
  const jsPDF = await loadJsPDF();

  // Page sized to content: 210mm × 181mm
  const doc = new jsPDF({ unit: "mm", format: [210, 200] });
  const W = 210, ml = 25, mr = 25;

  // ── Logo ──
  const logoUrl = await fetchAsDataUrl("/logo.png");
  if (logoUrl) {
    try { doc.addImage(logoUrl, "PNG", (W - 65) / 2, 8, 65, 16); } catch {}
  }

  // ── Company name ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(34, 34, 34);
  doc.text("SMILES RENT A CAR SERVICES LTD", W / 2, 30, { align: "center" });

  // ── Divider ──
  doc.setDrawColor(204, 204, 204);
  doc.setLineWidth(0.3);
  doc.line(ml, 33, W - mr, 33);

  // ── Date & Ref ──
  let y = 40;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("Date:", ml, y);
  doc.setFont("helvetica", "bold");
  doc.text(displayDate(entry.date), ml + 17, y);
  doc.setFont("helvetica", "normal");
  doc.text("Ref No:", W / 2, y);
  doc.setFont("helvetica", "bold");
  doc.text(entry.refNo, W / 2 + 19, y);

  // ── To ──
  y += 10;
  doc.setFont("helvetica", "italic");
  doc.setTextColor(51, 51, 51);
  doc.text("To:  BAHDELA CO. LTD", ml, y);
  y += 6;
  doc.text("      Dar es Salaam \u2013 Tanzania", ml, y);

  // ── Vehicle No ──
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text("Vehicle No:", ml, y);
  doc.setFont("helvetica", "bold");
  doc.text(entry.plate, ml + 28, y);

  // ── Please supply ──
  y += 10;
  doc.setFont("helvetica", "italic");
  doc.setTextColor(51, 51, 51);
  doc.text("Please supply our vehicle with the following:", ml, y);

  // ── Fields box ──
  const hasAmount = entry.amount && String(entry.amount).trim() !== "";
  const hasRemarks = entry.remarks && entry.remarks.trim() !== "";
  const boxH = hasRemarks ? 34 : 24;
  const boxY = y + 3;
  doc.setDrawColor(187, 187, 187);
  doc.setLineWidth(0.3);
  doc.roundedRect(ml, boxY, W - ml - mr, boxH, 1.5, 1.5);

  let fy = boxY + 9;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text("Product:", ml + 5, fy);
  doc.setFont("helvetica", "normal");
  doc.text(entry.product, ml + 30, fy);

  fy += 10;
  doc.setFont("helvetica", "bold");
  if (hasAmount) {
    doc.text("Amount:", ml + 5, fy);
    doc.setFont("helvetica", "normal");
    doc.text("TSH  " + fmtNum(entry.amount), ml + 30, fy);
  } else {
    doc.text("Litres:", ml + 5, fy);
    doc.setFont("helvetica", "normal");
    doc.text("Ltrs  " + entry.litres, ml + 30, fy);
  }

  if (hasRemarks) {
    fy += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Remarks:", ml + 5, fy);
    doc.setFont("helvetica", "normal");
    doc.text(entry.remarks, ml + 30, fy);
  }

  // ── and charge to our account ──
  y = boxY + boxH + 8;
  doc.setFont("helvetica", "italic");
  doc.setTextColor(51, 51, 51);
  doc.text("and charge to our account.", ml, y);

  // ── Authorised by ──
  y += 13;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text("Authorised by:", ml, y);
  doc.setFont("helvetica", "normal");
  doc.text(entry.authorisedBy, ml + 38, y);

  // ── Stamp ──
  const stampUrl = await fetchAsDataUrl("/stamp.png");
  const stampSize = 30;
  const stampX    = W - mr - stampSize - 2;
  const stampY    = y - stampSize + 9;
  if (stampUrl) {
    try { doc.addImage(stampUrl, "PNG", stampX, stampY, stampSize, stampSize); } catch {}
  }

  return doc;
}

// ── Plate Search Component ───────────────────────────────────
function PlateSearch({ plates, value, onChange }) {
  const [query,   setQuery]   = useState(value || "");
  const [open,    setOpen]    = useState(false);
  const [focused, setFocused] = useState(false);

  const filtered = query.trim().length > 0
    ? plates.filter(p => p.toLowerCase().replace(/\s/g,"").includes(query.toLowerCase().replace(/\s/g,"")))
    : [];

  const select = (plate) => {
    onChange(plate);
    setQuery(plate);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        style={{ ...S.input, background: value ? "#f0fdf4" : "#fff" }}
        placeholder="Type plate number e.g. T 235 DYS"
        value={query}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onFocus={() => { setFocused(true); if (query) setOpen(true); }}
        onBlur={() => { setTimeout(() => { setOpen(false); setFocused(false); }, 150); }}
      />
      {value && <span style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:"#16a34a",fontSize:14 }}>✓</span>}
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.1)",zIndex:50,maxHeight:200,overflowY:"auto",marginTop:2 }}>
          {filtered.slice(0, 20).map(p => (
            <div key={p} onMouseDown={() => select(p)}
              style={{ padding:"9px 12px",cursor:"pointer",fontSize:13,fontWeight:500,color:"#111",borderBottom:"1px solid #f3f4f6" }}
              onMouseEnter={e => e.currentTarget.style.background="#f0fdf4"}
              onMouseLeave={e => e.currentTarget.style.background="#fff"}>
              {p}
            </div>
          ))}
        </div>
      )}
      {open && query.trim().length > 0 && filtered.length === 0 && (
        <div style={{ position:"absolute",top:"100%",left:0,right:0,background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#aaa",marginTop:2,zIndex:50 }}>
          No matching plates found
        </div>
      )}
    </div>
  );
}

// ── Add Fuel Modal ───────────────────────────────────────────
function AddFuelModal({ fleet, staffName, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: todayStr(), plate: "", product: "Diesel", mode: "amount", amount: "", litres: "", remarks: "", currentKm: "",
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [pdfReady, setPdfReady] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const plateOptions = [...fleet].map(c => c.plate).sort();

  // Detect car state when plate is selected
  const carState = useMemo(() => {
    if (!form.plate) return null;
    const norm = form.plate.trim().toLowerCase().replace(/\s+/g, "");
    const car  = fleet.find(c => c.plate.trim().toLowerCase().replace(/\s+/g, "") === norm);
    if (!car) return null;
    if (car.status === "Rented" && car.currentClient)
      return { type: "rented",    car, label: `Currently rented to: ${car.currentClient}`, sub: car.returnDate ? `Due back: ${car.returnDate}` : null, linkedClient: car.currentClient };
    if (car.status === "Staff Use" && car.currentClient)
      return { type: "staff",     car, label: `Currently used by: ${car.currentClient}`,   sub: car.location || null,                                  linkedClient: car.currentClient };
    if (car.status === "Maintenance")
      return { type: "garage",    car, label: `Currently at garage: ${car.garage || car.location || "Garage"}`, sub: null,                             linkedClient: car.garage || car.location || "" };
    if ((car.location || "").toLowerCase().includes("showroom"))
      return { type: "showroom",  car, label: `Currently at showroom: ${car.location}`,    sub: null,                                                  linkedClient: car.location };
    return null;
  }, [form.plate, fleet]);

  // Keep backward compat alias
  const currentRental = carState;

  const handleSave = async () => {
    if (!form.plate)   return setError("Please select a vehicle.");
    if (!form.product) return setError("Please select a product.");
    if (!form.currentKm || !form.currentKm.replace(/,/g,""))
      return setError("Current KM is required.");
    if (form.mode === "amount" && !form.amount.replace(/,/g, ""))
      return setError("Please enter an amount.");
    if (form.mode === "litres" && !form.litres && !form.fullTank)
      return setError("Please enter litres or select Full Tank.");

    setSaving(true); setError("");
    try {
      const payload = {
        action:       "addFuel",
        date:         form.date,
        plate:        form.plate,
        product:      form.product,
        amount:       form.mode === "amount" ? form.amount.replace(/,/g, "") : "",
        litres:       form.mode === "litres" ? form.litres : "",
        authorisedBy: staffName,
        submittedBy:  staffName,
        remarks:      form.remarks || "",
        currentKm:    form.currentKm.replace(/,/g,"") || "",
        // Auto-link to current rental
        linkedClient: carState ? carState.linkedClient : "",
        linkedClientPhone: carState?.car?.clientPhone || "",
      };
      const res = await post(payload);
      if (!res.success) throw new Error(res.error || "Save failed");

      // Generate PDF blob and show popup
      const entry = { ...payload, refNo: res.refNo, remarks: form.remarks || "" };
      const doc   = await generateFuelPDF(entry);
      const blob  = doc.output("blob");
      const filename = `${res.refNo}.pdf`;
      onSaved();
      setPdfReady({ blob, refNo: res.refNo, filename });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (pdfReady) {
    const { blob, refNo, filename } = pdfReady;

    const handleDownload = () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const handleShare = async () => {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: refNo }); } catch {}
      } else {
        handleDownload();
      }
    };

    const handleWhatsApp = async () => {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: refNo, text: `Fuel Request ${refNo}` }); } catch {}
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(`Fuel Request ${refNo}`)}`, "_blank");
      }
    };

    return (
      <div style={S.overlay}>
        <div style={{ background:"#fff", borderRadius:16, width:340, maxWidth:"calc(100% - 32px)", padding:"2rem", textAlign:"center", boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
          <h3 style={{ fontSize:18, fontWeight:700, color:"#111", margin:"0 0 6px" }}>Fuel Request Saved</h3>
          <p style={{ fontSize:14, color:"#888", margin:"0 0 24px" }}>Ref: <strong style={{ color:"#111" }}>{refNo}</strong><br/>What would you like to do with the PDF?</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <button onClick={handleDownload}
              style={{ padding:"12px", fontSize:14, fontWeight:600, background:"#1d4ed8", color:"#fff", border:"none", borderRadius:10, cursor:"pointer" }}>
              ⬇ Download PDF
            </button>
            <button onClick={handleShare}
              style={{ padding:"12px", fontSize:14, fontWeight:600, background:"#f0fdf4", color:"#15803d", border:"1.5px solid #bbf7d0", borderRadius:10, cursor:"pointer" }}>
              📤 Share
            </button>
            <button onClick={handleWhatsApp}
              style={{ padding:"12px", fontSize:14, fontWeight:600, background:"#dcfce7", color:"#15803d", border:"1.5px solid #86efac", borderRadius:10, cursor:"pointer" }}>
              💬 Share to WhatsApp
            </button>
            <button onClick={onClose}
              style={{ padding:"10px", fontSize:13, background:"none", color:"#888", border:"none", cursor:"pointer", marginTop:4 }}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.mHead}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>New Fuel Request</span>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.mBody}>

          <label style={S.label}>Date</label>
          <input type="date" value={form.date}
            onChange={e => set("date", e.target.value)} style={S.input} />

          <label style={S.label}>Vehicle No.</label>
          <PlateSearch
            plates={plateOptions}
            value={form.plate}
            onChange={v => set("plate", v)}
          />

          {carState && (() => {
            const themes = {
              rented:   { bg:"#fef9c3", border:"#fde68a", color:"#854d0e", icon:"🚗" },
              staff:    { bg:"#eff6ff", border:"#bfdbfe", color:"#1d4ed8", icon:"👤" },
              garage:   { bg:"#fff7ed", border:"#fed7aa", color:"#c2410c", icon:"🔧" },
              showroom: { bg:"#f0fdf4", border:"#bbf7d0", color:"#15803d", icon:"🏢" },
            };
            const t = themes[carState.type];
            return (
              <div style={{ marginTop:8,padding:"10px 12px",background:t.bg,border:`1px solid ${t.border}`,borderRadius:8,fontSize:13 }}>
                <div style={{ fontWeight:600,color:t.color,marginBottom:2 }}>
                  {t.icon} {carState.label} — fuel will be linked automatically
                </div>
                {carState.sub && <div style={{ color:t.color,fontSize:12,marginTop:2,opacity:0.85 }}>{carState.sub}</div>}
              </div>
            );
          })()}
          {form.plate && !carState && (
            <div style={{ marginTop:8,fontSize:12,color:"#aaa" }}>
              ℹ️ Car is available — no client will be linked
            </div>
          )}

          <label style={S.label}>Current KM *</label>
          <input type="text" inputMode="numeric" value={form.currentKm}
            placeholder="e.g. 45,000"
            onChange={e => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              set("currentKm", digits ? Number(digits).toLocaleString("en-US") : "");
            }}
            style={S.input} />

          <label style={S.label}>Product</label>
          <div style={S.toggleRow}>
            {["Diesel", "Super"].map(p => (
              <button key={p} onClick={() => set("product", p)}
                style={{ ...S.toggleBtn, ...(form.product === p ? S.toggleOn : {}) }}>
                {p}
              </button>
            ))}
          </div>

          <label style={S.label}>Quantity</label>
          <div style={S.toggleRow}>
            {[["amount","Amount"],["litres","Litres"]].map(([k, label]) => (
              <button key={k} onClick={() => set("mode", k)}
                style={{ ...S.toggleBtn, ...(form.mode === k ? S.toggleOn : {}) }}>
                {label}
              </button>
            ))}
          </div>

          {form.mode === "amount" ? (
            <div style={{ position: "relative" }}>
              <span style={S.unit}>TSH</span>
              <input type="text" value={form.amount} placeholder="0"
                onChange={e => set("amount", fmtInput(e.target.value))}
                style={{ ...S.input, paddingLeft: 50 }} />
            </div>
          ) : (
            <div>
              <div style={{ position: "relative" }}>
                <span style={S.unit}>Ltrs</span>
                <input type="number" value={form.litres} placeholder="0"
                  onChange={e => set("litres", e.target.value)}
                  disabled={form.fullTank}
                  style={{ ...S.input, paddingLeft: 50, opacity: form.fullTank ? 0.5 : 1 }} />
              </div>
              <label style={{ display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer",fontSize:13,color:"#374151" }}>
                <input type="checkbox" checked={!!form.fullTank}
                  onChange={e => { set("fullTank", e.target.checked); if (e.target.checked) set("litres", "Full Tank"); else set("litres", ""); }}
                  style={{ width:16,height:16,cursor:"pointer" }} />
                Full Tank
              </label>
            </div>
          )}

          <label style={S.label}>Authorised By</label>
          <input value={staffName} readOnly
            style={{ ...S.input, background: "#f3f4f6", color: "#6b7280" }} />

          <label style={S.label}>Remarks (optional)</label>
          <textarea value={form.remarks}
            onChange={e => set("remarks", e.target.value)}
            placeholder="e.g. Urgent request, car on long trip"
            rows={2}
            style={{ ...S.input, resize: "vertical", fontFamily: "inherit", minHeight: 60 }} />

          {error && <div style={S.error}>{error}</div>}
        </div>
        <div style={S.mFoot}>
          <button onClick={onClose} style={S.cancelBtn} disabled={saving}>Cancel</button>
          <button onClick={handleSave} style={S.saveBtn} disabled={saving}>
            {saving ? "Saving…" : "Confirm & Save → PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Fuel Modal (Admin / Manager only) ───────────────────
function EditFuelModal({ entry, fleet, staffName, onClose, onSaved }) {
  const [form, setForm] = useState({
    date:    entry.date,
    plate:   entry.plate,
    product: entry.product,
    mode:    entry.amount ? "amount" : "litres",
    amount:  entry.amount ? fmtNum(entry.amount) : "",
    litres:  entry.litres || "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const plateOptions = [...fleet].map(c => c.plate).sort();

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const res = await post({
        action:       "editFuel",
        refNo:        entry.refNo,
        staffName,
        date:         form.date,
        plate:        form.plate,
        product:      form.product,
        amount:       form.mode === "amount" ? form.amount.replace(/,/g, "") : "",
        litres:       form.mode === "litres" ? form.litres : "",
      });
      if (!res.success) throw new Error(res.error || "Save failed");
      onSaved(); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.mHead}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Edit — {entry.refNo}</span>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>
        <div style={S.mBody}>

          <label style={S.label}>Date</label>
          <input type="date" value={form.date}
            onChange={e => set("date", e.target.value)} style={S.input} />

          <label style={S.label}>Vehicle No.</label>
          <PlateSearch
            plates={plateOptions}
            value={form.plate}
            onChange={v => set("plate", v)}
          />

          <label style={S.label}>Product</label>
          <div style={S.toggleRow}>
            {["Diesel","Super"].map(p => (
              <button key={p} onClick={() => set("product", p)}
                style={{ ...S.toggleBtn, ...(form.product === p ? S.toggleOn : {}) }}>
                {p}
              </button>
            ))}
          </div>

          <label style={S.label}>Quantity</label>
          <div style={S.toggleRow}>
            {[["amount","Amount"],["litres","Litres"]].map(([k, label]) => (
              <button key={k} onClick={() => set("mode", k)}
                style={{ ...S.toggleBtn, ...(form.mode === k ? S.toggleOn : {}) }}>
                {label}
              </button>
            ))}
          </div>

          {form.mode === "amount" ? (
            <div style={{ position: "relative" }}>
              <span style={S.unit}>TSH</span>
              <input type="text" value={form.amount}
                onChange={e => set("amount", fmtInput(e.target.value))}
                style={{ ...S.input, paddingLeft: 50 }} />
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <span style={S.unit}>Ltrs</span>
              <input type="number" value={form.litres}
                onChange={e => set("litres", e.target.value)}
                style={{ ...S.input, paddingLeft: 50 }} />
            </div>
          )}

          {error && <div style={S.error}>{error}</div>}
        </div>
        <div style={S.mFoot}>
          <button onClick={onClose} style={S.cancelBtn} disabled={saving}>Cancel</button>
          <button onClick={handleSave} style={S.saveBtn} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function FuelPage({ staffName, role, fuelAccess }) {
  const isAdmin   = role === "Admin" || role === "Manager";
  const hasAccess = Array.isArray(fuelAccess) && fuelAccess.map(n => n.trim().toLowerCase()).includes(staffName.trim().toLowerCase());

  const [entries,       setEntries]       = useState([]);
  const [fleet,         setFleet]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showAdd,       setShowAdd]       = useState(false);
  const [editEntry,     setEditEntry]     = useState(null);
  const [accessDenied,  setAccessDenied]  = useState(false);
  const [filterPlate,   setFilterPlate]   = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterFrom,    setFilterFrom]    = useState("");
  const [filterTo,      setFilterTo]      = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fuelRes, fleetRes] = await Promise.all([get("getFuel"), get("getFleet")]);
      if (fuelRes.success)  setEntries(fuelRes.data  || []);
      if (fleetRes.success) setFleet(fleetRes.data   || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDownloadPDF = async (entry) => {
    try {
      const doc  = await generateFuelPDF(entry);
      const blob = doc.output("blob");
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `${entry.refNo}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { alert("PDF error: " + err.message); }
  };

  const filtered = entries.filter(e => {
    if (filterPlate) {
      const q = filterPlate.toLowerCase();
      const matchesPlate  = e.plate.toLowerCase().includes(q);
      const matchesClient = (e.linkedClient || "").toLowerCase().includes(q);
      const matchesType   = (e.type || "").toLowerCase().includes(q);
      if (!matchesPlate && !matchesClient && !matchesType) return false;
    }
    if (filterProduct && e.product !== filterProduct) return false;
    if (filterFrom    && e.date < filterFrom) return false;
    if (filterTo      && e.date > filterTo)   return false;
    return true;
  });

  const totalAmount = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalLitres = entries.reduce((s, e) => s + (Number(e.litres) || 0), 0);

  return (
    <div style={{ padding: "4px 0" }}>

      {/* Stats */}
      <div style={S.statsRow}>
        <div style={S.statCard}>
          <div style={S.statNum}>{entries.length}</div>
          <div style={S.statLabel}>Total Entries</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statNum}>TSH {fmtNum(totalAmount)}</div>
          <div style={S.statLabel}>Total Amount</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statNum}>{totalLitres > 0 ? `${fmtNum(totalLitres)} Ltrs` : "—"}</div>
          <div style={S.statLabel}>Total Litres</div>
        </div>
      </div>

      {/* Filter row */}
      <div style={S.filterRow}>
        <input placeholder="Search plate, client or type…" value={filterPlate}
          onChange={e => setFilterPlate(e.target.value)} style={{ ...S.filterInput, minWidth: 220 }} />
        <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} style={S.filterInput}>
          <option value="">All Products</option>
          <option value="Diesel">Diesel</option>
          <option value="Super">Super</option>
        </select>
        <input type="date" value={filterFrom}
          onChange={e => setFilterFrom(e.target.value)} style={S.filterInput} />
        <input type="date" value={filterTo}
          onChange={e => setFilterTo(e.target.value)} style={S.filterInput} />
        <span style={{ color: "#6b7280", fontSize: 13, whiteSpace: "nowrap" }}>
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => hasAccess ? setShowAdd(true) : setAccessDenied(true)} style={S.addBtn}>＋ Add New</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af" }}>No fuel entries found.</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <table style={S.table}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Ref No","Date","Plate No.","Type","Product","Amount","Litres","Client Name","Authorised By",""].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.refNo} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ ...S.td, fontWeight: 600, color: "#2563eb" }}>{e.refNo}</td>
                  <td style={S.td}>{displayDate(e.date)}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{e.plate}</td>
                  <td style={{ ...S.td, color: "#6b7280" }}>{e.type}</td>
                  <td style={S.td}>
                    <span style={{
                      padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                      background: e.product === "Diesel" ? "#dbeafe" : "#fef3c7",
                      color:      e.product === "Diesel" ? "#1d4ed8" : "#92400e",
                    }}>{e.product}</span>
                  </td>
                  <td style={S.td}>{e.amount ? `TSH ${fmtNum(e.amount)}` : "—"}</td>
                  <td style={S.td}>{e.litres || "—"}</td>
                  <td style={{ ...S.td, fontSize: 12 }}>
                    {e.linkedClient ? (() => {
                      // Cross-reference with current fleet to get context icon
                      const norm = (e.plate||"").trim().toLowerCase().replace(/\s+/g,"");
                      const car  = fleet.find(c => c.plate.trim().toLowerCase().replace(/\s+/g,"") === norm);
                      let icon = "🚗";
                      if (car) {
                        if (car.status === "Staff Use")   icon = "👤";
                        if (car.status === "Maintenance") icon = "🔧";
                        if ((car.location||"").toLowerCase().includes("showroom")) icon = "🏢";
                      }
                      return <span style={{ fontWeight:500,color:"#374151" }}>{icon} {e.linkedClient}</span>;
                    })()
                    : <span style={{ color:"#ccc" }}>—</span>}
                  </td>
                  <td style={S.td}>{e.authorisedBy}</td>
                  <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                    <button onClick={() => handleDownloadPDF(e)}
                      title="Download PDF" style={S.iconBtn}>📄</button>
                    {isAdmin && (
                      <button onClick={() => setEditEntry(e)}
                        title="Edit" style={{ ...S.iconBtn, marginLeft: 4 }}>✏️</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {accessDenied && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}
          onClick={() => setAccessDenied(false)}>
          <div style={{ background:"#fff",borderRadius:14,width:340,maxWidth:"100%",padding:"2rem",textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:44,marginBottom:12 }}>⛽</div>
            <h3 style={{ fontSize:18,fontWeight:700,color:"#111",margin:"0 0 8px" }}>Access Denied</h3>
            <p style={{ fontSize:14,color:"#888",margin:"0 0 20px",lineHeight:1.5 }}>
              You are not authorised to submit fuel requests.<br/>
              Please contact your manager.
            </p>
            <button style={{ padding:"10px 24px",fontSize:14,fontWeight:600,background:"#111",color:"#fff",border:"none",borderRadius:8,cursor:"pointer" }}
              onClick={() => setAccessDenied(false)}>Close</button>
          </div>
        </div>
      )}
      {showAdd && (
        <AddFuelModal
          fleet={fleet} staffName={staffName}
          onClose={() => setShowAdd(false)} onSaved={load} />
      )}
      {editEntry && (
        <EditFuelModal
          entry={editEntry} fleet={fleet} staffName={staffName}
          onClose={() => setEditEntry(null)} onSaved={load} />
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────
const S = {
  statsRow:  { display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  statCard:  { flex: 1, minWidth: 150, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 18px" },
  statNum:   { fontSize: 20, fontWeight: 700, color: "#111827" },
  statLabel: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  filterRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
  filterInput:{ padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, minWidth: 110 },
  addBtn:    { background: "#2563eb", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:        { padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#374151", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" },
  td:        { padding: "10px 14px", color: "#374151", borderBottom: "1px solid #f3f4f6" },
  iconBtn:   { background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 4px", borderRadius: 4 },
  overlay:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal:     { background: "#fff", borderRadius: 14, width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" },
  mHead:     { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" },
  mBody:     { padding: "16px 20px", overflowY: "auto", flex: 1 },
  mFoot:     { padding: "12px 20px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, justifyContent: "flex-end" },
  closeBtn:  { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6b7280" },
  label:     { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 14 },
  input:     { width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box" },
  toggleRow: { display: "flex", gap: 8 },
  toggleBtn: { flex: 1, padding: "9px 0", border: "1px solid #d1d5db", borderRadius: 8, background: "#f9fafb", cursor: "pointer", fontSize: 14, fontWeight: 500 },
  toggleOn:  { background: "#2563eb", color: "#fff", border: "1px solid #2563eb" },
  unit:      { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#6b7280", fontWeight: 600, pointerEvents: "none" },
  cancelBtn: { padding: "9px 20px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14 },
  saveBtn:   { padding: "9px 20px", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 },
  error:     { marginTop: 10, color: "#dc2626", fontSize: 13, padding: "8px 12px", background: "#fef2f2", borderRadius: 6 },
};
