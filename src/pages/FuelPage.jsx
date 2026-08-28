// src/pages/FuelPage.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { get, post } from "../lib/api";
import DateField from "../components/DateField";
import { compressImage } from "../lib/imageCompress";

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
  const hasAmount  = entry.amount  && String(entry.amount).trim()  !== "";
  const hasRemarks = entry.remarks && entry.remarks.trim()         !== "";
  const hasKm      = entry.currentKm && String(entry.currentKm).trim() !== "";
  const rowCount   = 2 + (hasRemarks ? 1 : 0) + (hasKm ? 1 : 0);
  const boxH = rowCount * 10 + 4;
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

  if (hasKm) {
    fy += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Current KM:", ml + 5, fy);
    doc.setFont("helvetica", "normal");
    doc.text(String(entry.currentKm), ml + 36, fy);
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
    ? plates.filter(p => p && p.toLowerCase().replace(/\s/g,"").includes(query.toLowerCase().replace(/\s/g,"")))
    : [];

  const select = (plate) => {
    onChange(plate);
    setQuery(plate);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        style={{ ...S.input, background: value ? "var(--green-bg)" : "var(--surface)" }}
        placeholder="Type plate number e.g. T 235 DYS"
        value={query}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onFocus={() => { setFocused(true); if (query) setOpen(true); }}
        onBlur={() => { setTimeout(() => { setOpen(false); setFocused(false); }, 150); }}
      />
      {value && <span style={{ position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:"var(--green)",fontSize:14 }}>✓</span>}
      {open && filtered.length > 0 && (
        <div style={{ position:"absolute",top:"100%",left:0,right:0,background:"var(--surface)",border:"1.5px solid var(--border)",borderRadius:8,boxShadow:"0 4px 16px rgba(0,0,0,0.1)",zIndex:50,maxHeight:200,overflowY:"auto",marginTop:2 }}>
          {filtered.slice(0, 20).map(p => (
            <div key={p} onMouseDown={() => select(p)}
              style={{ padding:"9px 12px",cursor:"pointer",fontSize:13,fontWeight:500,color:"var(--text)",borderBottom:"1px solid var(--border-light)" }}
              onMouseEnter={e => e.currentTarget.style.background="var(--green-bg)"}
              onMouseLeave={e => e.currentTarget.style.background="var(--surface)"}>
              {p}
            </div>
          ))}
        </div>
      )}
      {open && query.trim().length > 0 && filtered.length === 0 && (
        <div style={{ position:"absolute",top:"100%",left:0,right:0,background:"var(--surface)",border:"1.5px solid var(--border)",borderRadius:8,padding:"10px 12px",fontSize:13,color:"var(--text-faint)",marginTop:2,zIndex:50 }}>
          No matching plates found
        </div>
      )}
    </div>
  );
}

// ── Add Fuel Modal ───────────────────────────────────────────
function AddFuelModal({ fleet, subHire, staffName, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: todayStr(), plate: "", product: "Diesel", mode: "amount", amount: "", litres: "", remarks: "", currentKm: "",
    isShowroomCar: false, showroomDescription: "",
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [pdfReady, setPdfReady] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Merge fleet + active sub-hire plates
  const allCars = useMemo(() => {
    const subHireActive = (subHire || [])
      .filter(s => s.status === "Active" && s.plate)
      .map(s => ({
        plate:         s.plate,
        type:          s.vehicleDesc || s.type || "",
        status:        "Sub-Hire",
        currentClient: s.client || "",
        clientPhone:   s.clientPhone || "",
        returnDate:    s.returnDate || "",
        location:      s.location || "",
        garage:        "",
      }));
    const seen = new Set();
    return [...(fleet||[]).filter(c => c.plate), ...subHireActive].filter(c => {
      if (seen.has(c.plate)) return false; seen.add(c.plate); return true;
    });
  }, [fleet, subHire]);

  const plateOptions = useMemo(() => allCars.map(c => c.plate).filter(Boolean).sort(), [allCars]);

  // Detect car state when plate is selected
  const carState = useMemo(() => {
    if (!form.plate) return null;
    const norm = form.plate.trim().toLowerCase().replace(/\s+/g, "");
    const car  = allCars.find(c => c.plate.trim().toLowerCase().replace(/\s+/g, "") === norm);
    if (!car) return null;
    if (car.status === "Sub-Hire")
      return { type: "subhire", car, label: `Sub-Hire vehicle${car.currentClient ? ` — Client: ${car.currentClient}` : ""}`, sub: `${car.type ? car.type + (car.returnDate ? " · " : "") : ""}${car.returnDate ? `Return: ${car.returnDate}` : ""}` || null, linkedClient: car.currentClient || "" };
    if (car.status === "Rented" && car.currentClient)
      return { type: "rented",    car, label: `Currently rented to: ${car.currentClient}`, sub: car.returnDate ? `Due back: ${car.returnDate}` : null, linkedClient: car.currentClient };
    if (car.status === "Staff Use" && car.currentClient)
      return { type: "staff",     car, label: `Currently used by: ${car.currentClient}`,   sub: car.location || null,                                  linkedClient: car.currentClient };
    if (car.status === "Maintenance")
      return { type: "garage",    car, label: `Currently at garage: ${car.garage || car.location || "Garage"}`, sub: null,                             linkedClient: car.garage || car.location || "" };
    if ((car.location || "").toLowerCase().includes("showroom"))
      return { type: "showroom",  car, label: `Currently at showroom: ${car.location}`,    sub: null,                                                  linkedClient: car.location };
    return null;
  }, [form.plate, allCars]);

  // Keep backward compat alias
  const currentRental = carState;

  const handleSave = async () => {
    if (form.isShowroomCar) {
      if (!form.showroomDescription.trim()) return setError("Please describe the showroom car.");
    } else {
      if (!form.plate) return setError("Please select a vehicle.");
    }
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
        plate:        form.isShowroomCar ? `Showroom: ${form.showroomDescription.trim()}` : form.plate,
        type:         form.isShowroomCar ? "Showroom Car" : undefined,
        product:      form.product,
        amount:       form.mode === "amount" ? form.amount.replace(/,/g, "") : "",
        litres:       form.mode === "litres" ? form.litres : "",
        authorisedBy: staffName,
        submittedBy:  staffName,
        remarks:      form.remarks || "",
        currentKm:    form.currentKm.replace(/,/g,"") || "",
        // Auto-link to current rental — not applicable for showroom cars
        linkedClient: !form.isShowroomCar && carState ? carState.linkedClient : "",
        linkedClientPhone: !form.isShowroomCar ? (carState?.car?.clientPhone || "") : "",
      };
      const res = await post(payload);
      if (!res.success) throw new Error(res.error || "Save failed");

      // Generate PDF blob and show popup
      const entry = { ...payload, refNo: res.refNo, remarks: form.remarks || "", currentKm: form.currentKm || "" };
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
        <div style={{ background:"var(--surface)", borderRadius:16, width:340, maxWidth:"calc(100% - 32px)", padding:"2rem", textAlign:"center", boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
          <h3 style={{ fontSize:18, fontWeight:700, color:"var(--text)", margin:"0 0 6px" }}>Fuel Request Saved</h3>
          <p style={{ fontSize:14, color:"var(--text-muted)", margin:"0 0 24px" }}>Ref: <strong style={{ color:"var(--text)" }}>{refNo}</strong><br/>What would you like to do with the PDF?</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <button onClick={handleDownload}
              style={{ padding:"12px", fontSize:14, fontWeight:600, background:"var(--sc-blue)", color:"var(--surface)", border:"none", borderRadius:10, cursor:"pointer" }}>
              ⬇ Download PDF
            </button>
            <button onClick={handleShare}
              style={{ padding:"12px", fontSize:14, fontWeight:600, background:"var(--green-bg)", color:"var(--green)", border:"1.5px solid var(--green-border)", borderRadius:10, cursor:"pointer" }}>
              📤 Share
            </button>
            <button onClick={handleWhatsApp}
              style={{ padding:"12px", fontSize:14, fontWeight:600, background:"var(--green-bg)", color:"var(--green)", border:"1.5px solid var(--green-border)", borderRadius:10, cursor:"pointer" }}>
              💬 Share to WhatsApp
            </button>
            <button onClick={onClose}
              style={{ padding:"10px", fontSize:13, background:"none", color:"var(--text-muted)", border:"none", cursor:"pointer", marginTop:4 }}>
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

          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 500, color: "var(--text-muted)", margin: "2px 0 8px", cursor: "pointer" }}>
            <input type="checkbox" checked={form.isShowroomCar}
              onChange={e => set("isShowroomCar", e.target.checked)}
              style={{ width: 15, height: 15, cursor: "pointer" }} />
            Showroom Car <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>(not in our fleet / unregistered)</span>
          </label>

          {form.isShowroomCar ? (
            <input type="text" value={form.showroomDescription}
              onChange={e => set("showroomDescription", e.target.value)}
              placeholder="Describe the car (e.g. make, model, or any ID available)"
              style={S.input} />
          ) : (
            <PlateSearch
              plates={plateOptions}
              value={form.plate}
              onChange={v => set("plate", v)}
            />
          )}

          {!form.isShowroomCar && carState && (() => {
            const themes = {
              rented:   { bg:"var(--yellow-bg)", border:"var(--yellow-border)", color:"var(--yellow)", icon:"🚗" },
              staff:    { bg:"var(--blue-bg)", border:"var(--blue-border)", color:"var(--sc-blue)", icon:"👤" },
              garage:   { bg:"var(--orange-bg)", border:"var(--orange-border)", color:"var(--orange)", icon:"🔧" },
              showroom: { bg:"var(--green-bg)", border:"var(--green-border)", color:"var(--green)", icon:"🏢" },
              subhire:  { bg:"var(--purple-bg)", border:"var(--purple-border)", color:"var(--purple)", icon:"🔄" },
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
          {!form.isShowroomCar && form.plate && !carState && (
            <div style={{ marginTop:8,fontSize:12,color:"var(--text-faint)" }}>
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
              <label style={{ display:"flex",alignItems:"center",gap:8,marginTop:8,cursor:"pointer",fontSize:13,color:"var(--text)" }}>
                <input type="checkbox" checked={!!form.fullTank}
                  onChange={e => { set("fullTank", e.target.checked); if (e.target.checked) set("litres", "Full Tank"); else set("litres", ""); }}
                  style={{ width:16,height:16,cursor:"pointer" }} />
                Full Tank
              </label>
            </div>
          )}

          <label style={S.label}>Authorised By</label>
          <input value={staffName} readOnly
            style={{ ...S.input, background: "var(--border-light)", color: "var(--text-muted)" }} />

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
// Receipts print the date as DD-MM-YYYY ("26-08-2026") — converts to the
// YYYY-MM-DD a <input type="date"> needs. Returns "" (never a guess) for
// anything that doesn't cleanly match, leaving it for manual entry.
function parseReceiptDate(str) {
  if (!str) return "";
  const m = String(str).match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// One row per uploaded receipt photo — OCR'd, then reviewed/corrected by a
// human before anything saves. The plate is the one field never trusted
// from OCR alone: it's pre-filled as a starting guess into the same
// PlateSearch picker used elsewhere, so confirming it means actually
// picking a real fleet plate, not accepting raw handwriting.
function BulkFuelScanModal({ fleet, staffName, onClose, onSaved }) {
  const [rows, setRows] = useState([]); // { id, previewUrl, plate, date, product, litres, amount, litresConfidence, amountConfidence, plateConfidence, scanError }
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedCount, setSavedCount] = useState(null);

  const plateOptions = useMemo(() => (fleet || []).map(c => c.plate).filter(Boolean).sort(), [fleet]);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = ""; // allow re-selecting the same file(s) later
    setError(""); setScanning(true);

    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let compressed;
      try {
        compressed = await compressImage(file);
      } catch {
        setRows(rs => [...rs, { id, previewUrl: URL.createObjectURL(file), scanError: "Could not read that image." }]);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      try {
        const res = await post({ action: "scanFuelReceipt", imageBase64: compressed.base64, mimeType: compressed.mimeType, staffName });
        const d = res.data;
        setRows(rs => [...rs, {
          id, previewUrl,
          plate: d.plate || "", plateConfidence: d.plateConfidence,
          date: parseReceiptDate(d.receiptDate),
          product: d.product && ["Diesel", "Super", "Unleaded"].includes(d.product) ? d.product : (d.product || ""),
          litres: d.litres != null ? String(d.litres) : "",
          litresConfidence: d.litresConfidence,
          amount: d.totalAmount != null ? String(d.totalAmount) : "",
          amountConfidence: d.totalAmountConfidence,
        }]);
      } catch (ex) {
        setRows(rs => [...rs, { id, previewUrl, scanError: ex.message }]);
      }
    }
    setScanning(false);
  };

  const updateRow = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeRow = (id) => setRows(rs => rs.filter(r => r.id !== id));

  const validRows = rows.filter(r => !r.scanError);
  const readyToSave = validRows.length > 0 && validRows.every(r => r.plate && r.date && (r.litres || r.amount));

  const handleSaveAll = async () => {
    if (!readyToSave) { setError("Every receipt needs a plate, date, and at least a litres or amount value."); return; }
    setSaving(true); setError("");
    try {
      const receipts = validRows.map(r => ({ plate: r.plate, date: r.date, product: r.product || "", litres: r.litres || "", amount: r.amount || "" }));
      const res = await post({ action: "confirmFuelReceipts", staffName, receipts });
      if (!res.success) throw new Error(res.error || "Save failed");
      setSavedCount(receipts.length);
      onSaved?.();
    } catch (ex) {
      setError(ex.message);
    } finally {
      setSaving(false);
    }
  };

  if (savedCount != null) {
    return (
      <div style={S.overlay} onClick={onClose}>
        <div style={{ ...S.modal, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
          <div style={S.mHead}><span style={{ fontWeight: 700 }}>Done</span><button type="button" style={S.closeBtn} onClick={onClose}>✕</button></div>
          <div style={S.mBody}>
            <p style={{ fontSize: 14 }}>✅ Saved {savedCount} receipt{savedCount === 1 ? "" : "s"} — matched to existing fuel entries where one was waiting, created new ones otherwise.</p>
          </div>
          <div style={S.mFoot}><button type="button" style={S.saveBtn} onClick={onClose}>Close</button></div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div style={S.mHead}>
          <span style={{ fontWeight: 700 }}>Bulk Upload Fuel Receipts</span>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
            Select all of today's receipt photos at once. Each one is read automatically — check the plate especially, since it's handwritten on the receipt and OCR can misread it.
          </p>
          <label style={{ ...S.addBtn, display: "inline-block", cursor: "pointer" }}>
            {scanning ? "Reading receipts…" : "＋ Choose Photos"}
            <input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={scanning} onChange={handleFiles} />
          </label>

          {rows.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map(r => (
                <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "flex", gap: 10 }}>
                  <img src={r.previewUrl} alt="" style={{ width: 60, height: 80, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                  {r.scanError ? (
                    <div style={{ flex: 1, fontSize: 12.5, color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>{r.scanError}</span>
                      <button type="button" style={S.iconBtn} onClick={() => removeRow(r.id)}>🗑</button>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          Plate {r.plateConfidence === "low" && <span style={{ color: "var(--amber, #b45309)" }}>(check this — handwriting unclear)</span>}
                        </label>
                        <PlateSearch plates={plateOptions} value={r.plate} onChange={p => updateRow(r.id, { plate: p })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Date</label>
                        <input type="date" style={S.input} value={r.date} onChange={e => updateRow(r.id, { date: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Product</label>
                        <select style={S.input} value={r.product} onChange={e => updateRow(r.id, { product: e.target.value })}>
                          <option value="">— Select —</option>
                          <option value="Diesel">Diesel</option>
                          <option value="Super">Super</option>
                          <option value="Unleaded">Unleaded</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            Litres {r.litresConfidence === "low" && r.litres && <span style={{ color: "var(--amber, #b45309)" }}>⚠</span>}
                          </label>
                          <input type="number" style={S.input} value={r.litres} onChange={e => updateRow(r.id, { litres: e.target.value })} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                            Amount {r.amountConfidence === "low" && r.amount && <span style={{ color: "var(--amber, #b45309)" }}>⚠</span>}
                          </label>
                          <input type="number" style={S.input} value={r.amount} onChange={e => updateRow(r.id, { amount: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  )}
                  {!r.scanError && <button type="button" style={{ ...S.iconBtn, alignSelf: "flex-start" }} onClick={() => removeRow(r.id)}>🗑</button>}
                </div>
              ))}
            </div>
          )}
          {error && <p style={S.error}>{error}</p>}
        </div>
        <div style={S.mFoot}>
          <button type="button" style={S.cancelBtn} onClick={onClose}>Cancel</button>
          <button type="button" style={{ ...S.saveBtn, opacity: (saving || !readyToSave) ? 0.65 : 1 }} disabled={saving || !readyToSave} onClick={handleSaveAll}>
            {saving ? "Saving…" : `Save ${validRows.length || ""} Receipt${validRows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FuelPage({ staffName, role, fuelAccess }) {
  const isAdmin   = role === "Admin" || role === "Manager";
  const hasAccess = Array.isArray(fuelAccess) && fuelAccess.map(n => n.trim().toLowerCase()).includes(staffName.trim().toLowerCase());

  const [entries,       setEntries]       = useState([]);
  const [fleet,         setFleet]         = useState([]);
  const [subHire,       setSubHire]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showAdd,       setShowAdd]       = useState(false);
  const [editEntry,     setEditEntry]     = useState(null);
  const [accessDenied,  setAccessDenied]  = useState(false);
  const [filterPlate,   setFilterPlate]   = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterFrom,    setFilterFrom]    = useState("");
  const [filterTo,      setFilterTo]      = useState("");
  const [showBulkScan,  setShowBulkScan]  = useState(false);
  // Whether THIS staff member can use the fuel-voucher bulk upload — Admin
  // always can (see requireFuelVoucherAccess on the backend); everyone else
  // needs the ⛽ flag granted in Admin Panel's Staff tab.
  const [canBulkScan,   setCanBulkScan]   = useState(role === "Admin");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fuelRes, fleetRes, subHireRes] = await Promise.all([get("getFuel"), get("getFleet"), get("getSubHire")]);
      if (fuelRes.success)     setEntries(fuelRes.data   || []);
      if (fleetRes.success)    setFleet(fleetRes.data    || []);
      if (subHireRes.success)  setSubHire(subHireRes.data || []);
      if (role !== "Admin") {
        const staffRes = await get("getStaffList");
        const me = (staffRes.staff || []).find(s => s.name.trim().toLowerCase() === staffName.trim().toLowerCase());
        setCanBulkScan(!!me?.canIssueFuelVoucher);
      }
    } catch {}
    setLoading(false);
  }, [role, staffName]);

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

  const totalAmount = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalLitres = filtered.reduce((s, e) => s + (Number(e.litres) || 0), 0);

  return (
    <div style={{ padding: "4px 0" }}>

      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontSize:22,fontWeight:700,color:"var(--text)" }}>Fuel Requisitions</div>
        <div style={{ fontSize:13,color:"var(--text-muted)",marginTop:2 }}>{entries.length} entries logged.</div>
      </div>

      {/* Stats */}
      <div className="sc-stat-grid sc-fuel-stats" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="sc-stat-card tint-blue">
          <div className="sc-stat-label">{(filterFrom || filterTo) ? "Entries (filtered)" : "Total Entries"}</div>
          <div className="sc-stat-value">{filtered.length}</div>
        </div>
        <div className="sc-stat-card tint-green">
          <div className="sc-stat-label">{(filterFrom || filterTo) ? "Amount (filtered)" : "Total Amount"}</div>
          <div className="sc-stat-value">TSH {fmtNum(totalAmount)}</div>
        </div>
        <div className="sc-stat-card tint-yellow">
          <div className="sc-stat-label">{(filterFrom || filterTo) ? "Litres (filtered)" : "Total Litres"}</div>
          <div className="sc-stat-value">{totalLitres > 0 ? `${fmtNum(totalLitres)} Ltrs` : "—"}</div>
        </div>
      </div>

      {/* Filter row */}
      <div className="sc-filter-row">
        <input placeholder="Search plate, client or type…" value={filterPlate}
          onChange={e => setFilterPlate(e.target.value)} style={{ ...S.filterInput, minWidth: 220 }} className="sc-search" />

        <div className="sc-hf-row2">
          <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} style={S.filterInput}>
            <option value="">All Products</option>
            <option value="Diesel">Diesel</option>
            <option value="Super">Super</option>
          </select>
          <DateField label="From" style={S.filterInput} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div className="sc-hf-row3">
          <DateField label="To" style={S.filterInput} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          {canBulkScan && (
            <button type="button" className="btn btn-ghost" onClick={() => setShowBulkScan(true)}>📎 Bulk Upload Receipts</button>
          )}
          <button type="button" className="btn btn-add" onClick={() => hasAccess ? setShowAdd(true) : setAccessDenied(true)}>＋ Add New</button>
        </div>
        {(filterPlate || filterProduct || filterFrom || filterTo) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFilterPlate(""); setFilterProduct(""); setFilterFrom(""); setFilterTo(""); }}>✕ Clear</button>
        )}
        <span className="result-count">{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-screen"><div className="spinner" />Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "var(--text-faint)" }}>No fuel entries found.</div>
      ) : (
        <div className="table-wrap sc-fuel-table">
          <table style={S.table}>
            <thead>
              <tr>
                {["Ref No","Date","Plate No.","Type","Product","Amount","Litres","Client Name","Authorised By","Actions"].map(h => (
                  <th key={h} data-label={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.refNo}>
                  <td data-label="Ref No" style={{ ...S.td, fontWeight: 600, color: "var(--sc-blue)" }}>{e.refNo}</td>
                  <td data-label="Date" style={S.td}>{displayDate(e.date)}</td>
                  <td data-label="Plate No." style={{ ...S.td, fontWeight: 600 }}>{e.plate}</td>
                  <td data-label="Type" style={{ ...S.td, color: "var(--text-muted)" }}>{e.type}</td>
                  <td data-label="Product" style={S.td}>
                    <span style={{
                      padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                      background: e.product === "Diesel" ? "var(--blue-bg)" : "var(--amber-bg)",
                      color:      e.product === "Diesel" ? "var(--sc-blue)" : "var(--amber)",
                    }}>{e.product}</span>
                  </td>
                  <td data-label="Amount" style={S.td}>{e.amount ? `TSH ${fmtNum(e.amount)}` : "—"}</td>
                  <td data-label="Litres" style={S.td}>{e.litres || "—"}</td>
                  <td data-label="Client Name" style={{ ...S.td, fontSize: 12 }}>
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
                      return <span style={{ fontWeight:500,color:"var(--text)" }}>{icon} {e.linkedClient}</span>;
                    })()
                    : <span style={{ color:"var(--text-faint)" }}>—</span>}
                  </td>
                  <td data-label="Authorised By" style={S.td}>{e.authorisedBy}</td>
                  <td data-label="Actions" style={{ ...S.td, whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => handleDownloadPDF(e)}
                      title="Download PDF" style={S.iconBtn}>📄</button>
                    {isAdmin && (
                      <button type="button" onClick={() => setEditEntry(e)}
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
          <div style={{ background:"var(--surface)",borderRadius:14,width:340,maxWidth:"100%",padding:"2rem",textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:44,marginBottom:12 }}>⛽</div>
            <h3 style={{ fontSize:18,fontWeight:700,color:"var(--text)",margin:"0 0 8px" }}>Access Denied</h3>
            <p style={{ fontSize:14,color:"var(--text-muted)",margin:"0 0 20px",lineHeight:1.5 }}>
              You are not authorised to submit fuel requests.<br/>
              Please contact your manager.
            </p>
            <button type="button" className="btn btn-primary"
              onClick={() => setAccessDenied(false)}>Close</button>
          </div>
        </div>
      )}
      {showAdd && (
        <AddFuelModal
          fleet={fleet} subHire={subHire} staffName={staffName}
          onClose={() => setShowAdd(false)} onSaved={load} />
      )}
      {editEntry && (
        <EditFuelModal
          entry={editEntry} fleet={fleet} staffName={staffName}
          onClose={() => setEditEntry(null)} onSaved={load} />
      )}
      {showBulkScan && (
        <BulkFuelScanModal
          fleet={fleet} staffName={staffName}
          onClose={() => setShowBulkScan(false)} onSaved={load} />
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────
const S = {
  statsRow:  { display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  statCard:  { flex: 1, minWidth: 150, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px" },
  statNum:   { fontSize: 20, fontWeight: 700, color: "var(--text)" },
  statLabel: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 },
  filterRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
  filterInput:{ padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, minWidth: 110 },
  addBtn:    { background: "var(--sc-blue)", color: "var(--surface)", border: "none", borderRadius: 7, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:        { padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" },
  td:        { padding: "10px 14px", color: "var(--text)", borderBottom: "1px solid var(--border-light)" },
  iconBtn:   { background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "2px 4px", borderRadius: 4 },
  overlay:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal:     { background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" },
  mHead:     { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)" },
  mBody:     { padding: "16px 20px", overflowY: "auto", flex: 1 },
  mFoot:     { padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" },
  closeBtn:  { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--text-muted)" },
  label:     { display: "block", fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 4, marginTop: 14 },
  input:     { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, boxSizing: "border-box" },
  toggleRow: { display: "flex", gap: 8 },
  toggleBtn: { flex: 1, padding: "9px 0", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", cursor: "pointer", fontSize: 14, fontWeight: 500 },
  toggleOn:  { background: "var(--sc-blue)", color: "var(--surface)", border: "1px solid var(--sc-blue)" },
  unit:      { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-muted)", fontWeight: 600, pointerEvents: "none" },
  cancelBtn: { padding: "9px 20px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", fontSize: 14 },
  saveBtn:   { padding: "9px 20px", border: "none", borderRadius: 8, background: "var(--sc-blue)", color: "var(--surface)", cursor: "pointer", fontSize: 14, fontWeight: 600 },
  error:     { marginTop: 10, color: "var(--red)", fontSize: 13, padding: "8px 12px", background: "var(--red-bg)", borderRadius: 6 },
};
