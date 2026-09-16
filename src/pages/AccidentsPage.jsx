import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { compressImage } from "../lib/imageCompress";

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 };
const modalStyle = { background: "#fff", borderRadius: 14, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" };
const inputStyle = { width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, color: "#888", display: "block", marginBottom: 3 };
const primaryBtnStyle = { padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 7, cursor: "pointer" };
const secondaryBtnStyle = { padding: "9px 16px", fontSize: 13, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 7, cursor: "pointer" };
const closeBtnStyle = { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888" };

// Mirrors lib/files.js's MAX_FILE_BYTES — checked client-side, before ever
// attempting an upload, same reasoning as the Workflows/Cover Notes uploads:
// a large file base64-encoded can push the request past what Vercel's
// serverless functions accept, surfacing a bare, unhelpful error otherwise.
const MAX_FILE_BYTES = 3 * 1024 * 1024;
function checkFileSize(file) {
  if (file.size > MAX_FILE_BYTES) return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — please use a file under ${MAX_FILE_BYTES / 1024 / 1024} MB.`;
  return null;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function loadJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => res(window.jspdf.jsPDF); s.onerror = rej;
    document.head.appendChild(s);
  });
}
// Fetches an already-uploaded image and returns it as a data URL, ready for
// jsPDF's addImage — same "fetch then convert" approach RentalAgreementModal
// already uses for its logo, just against our own file-serving endpoint.
function fetchAsDataUrl(url) {
  return fetch(url)
    .then(r => r.blob())
    .then(blob => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Could not load image for the report."));
      r.readAsDataURL(blob);
    }));
}

// Builds and downloads a printable PDF incident report — company-agnostic,
// plain black-and-white layout since this is an internal/insurer-facing
// record, not a client-facing branded document like the rental agreement.
async function generateAccidentPDF(accident) {
  const jsPDF = await loadJsPDF();
  const W = 210, ml = 18, mr = 18, cw = W - ml - mr;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 20;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Vehicle Accident Report", ml, y); y += 6;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3); doc.line(ml, y, ml + cw, y); y += 8;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const row = (label, value) => {
    doc.setFont("helvetica", "bold"); doc.text(label, ml, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(String(value || "—"), cw - 45);
    doc.text(lines, ml + 45, y);
    y += Math.max(6, lines.length * 5);
  };
  row("Plate No.:", accident.plate);
  row("Driver:", accident.driverName);
  row("Date of Accident:", fmtDate(accident.accidentDate));
  row("Station Report:", accident.stationReport);
  row("Injuries Occurred:", accident.injuriesOccurred ? "Yes" : "No");
  row("Details:", accident.details);
  row("Reported By:", accident.reportedBy);
  row("Date Logged:", fmtDateTime(accident.createdAt));
  y += 4;

  const photos = (accident.files || []).filter(f => f.fileType === "Photo");
  const docs = (accident.files || []).filter(f => f.fileType === "Document");

  if (photos.length > 0) {
    doc.setDrawColor(180, 180, 180); doc.line(ml, y, ml + cw, y); y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Photos", ml, y); y += 6;
    const imgW = (cw - 6) / 2, imgH = 55;
    let col = 0;
    for (const p of photos) {
      try {
        const dataUrl = await fetchAsDataUrl(p.fileUrl);
        const fmt = /png/i.test(p.fileMimeType) ? "PNG" : "JPEG";
        if (y + imgH > 280) { doc.addPage(); y = 20; col = 0; }
        const x = ml + col * (imgW + 6);
        doc.addImage(dataUrl, fmt, x, y, imgW, imgH, undefined, "FAST");
        if (col === 1) y += imgH + 6;
        col = col === 0 ? 1 : 0;
      } catch { /* skip a photo that fails to load rather than break the whole report */ }
    }
    if (col === 1) y += imgH + 6;
  }

  if (docs.length > 0) {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setDrawColor(180, 180, 180); doc.line(ml, y, ml + cw, y); y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Attached Documents", ml, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    for (const d of docs) { doc.text(`• ${d.filename || d.fileId}`, ml, y); y += 5.5; }
  }

  doc.save(`Accident Report - ${accident.plate} - ${accident.accidentDate || "undated"}.pdf`);
}

function AddAccidentModal({ staffName, plates, onClose, onSaved }) {
  const [plate, setPlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [accidentDate, setAccidentDate] = useState(new Date().toISOString().slice(0, 10));
  const [stationReport, setStationReport] = useState("");
  const [injuriesOccurred, setInjuriesOccurred] = useState(false);
  const [details, setDetails] = useState("");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [docFiles, setDocFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const pickFiles = (setter) => (e) => {
    const files = Array.from(e.target.files || []);
    const sizeErr = files.map(checkFileSize).find(Boolean);
    if (sizeErr) { setErr(sizeErr); e.target.value = ""; return; }
    setErr("");
    setter(files);
  };

  const submit = async () => {
    if (!plate.trim()) { setErr("Plate number is required."); return; }
    if (!accidentDate) { setErr("Date of accident is required."); return; }
    setSaving(true); setErr("");
    try {
      const res = await api.addAccident({ staffName, plate: plate.trim(), driverName: driverName.trim(), accidentDate, stationReport, injuriesOccurred, details });
      const accidentId = res.id;
      for (const file of photoFiles) {
        const payload = await compressImage(file);
        await api.addAccidentFile({ staffName, accidentId, fileType: "Photo", fileBase64: payload.base64, mimeType: payload.mimeType, filename: payload.filename });
      }
      for (const file of docFiles) {
        const payload = await compressImage(file); // passes non-images through untouched
        await api.addAccidentFile({ staffName, accidentId, fileType: "Document", fileBase64: payload.base64, mimeType: payload.mimeType, filename: payload.filename });
      }
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Report Accident</p>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: "1.1rem 1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Plate No. *</label>
              <input list="fleet-plates" value={plate} onChange={e => setPlate(e.target.value)} style={inputStyle} placeholder="e.g. T 123 ABC" />
              <datalist id="fleet-plates">{plates.map(p => <option key={p} value={p} />)}</datalist>
            </div>
            <div>
              <label style={labelStyle}>Driver</label>
              <input value={driverName} onChange={e => setDriverName(e.target.value)} style={inputStyle} placeholder="Name of driver" />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Date of Accident *</label>
            <input type="date" value={accidentDate} onChange={e => setAccidentDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Station Report</label>
            <input value={stationReport} onChange={e => setStationReport(e.target.value)} style={inputStyle} placeholder="e.g. Kinondoni Police Station, Ref: 12345" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={injuriesOccurred} onChange={e => setInjuriesOccurred(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Any injuries occurred</span>
          </label>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Details (if any)</label>
            <textarea value={details} onChange={e => setDetails(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="What happened, extent of damage, injuries, etc." />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Upload Photos</label>
            <input type="file" accept="image/*" multiple onChange={pickFiles(setPhotoFiles)} style={inputStyle} />
            {photoFiles.length > 0 && <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>{photoFiles.length} photo{photoFiles.length === 1 ? "" : "s"} selected</p>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Upload Docs</label>
            <input type="file" multiple onChange={pickFiles(setDocFiles)} style={inputStyle} />
            {docFiles.length > 0 && <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>{docFiles.length} document{docFiles.length === 1 ? "" : "s"} selected</p>}
          </div>
          {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 10px" }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={saving} onClick={submit} style={{ ...primaryBtnStyle, opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : "Save Report"}</button>
            <button type="button" onClick={onClose} disabled={saving} style={secondaryBtnStyle}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoViewerPopup({ file, onClose }) {
  return (
    <div style={{ ...overlayStyle, zIndex: 200 }} onClick={onClose}>
      <img src={file.fileUrl} alt="Accident" style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: 8 }} onClick={e => e.stopPropagation()} />
    </div>
  );
}

function AccidentDetailModal({ staffName, role, accidentId, onClose, onChanged }) {
  const [accident, setAccident] = useState(null);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");

  const load = () => api.getAccidentById(accidentId).then(res => { if (res.success) setAccident(res.data); else setErr(res.error); }).catch(e => setErr(e.message));
  useEffect(load, [accidentId]);

  const removeFile = async (fileRecordId) => {
    if (!window.confirm("Remove this attachment?")) return;
    try { await api.deleteAccidentFile({ staffName, fileRecordId }); load(); }
    catch (e) { alert(e.message); }
  };
  const removeAccident = async () => {
    if (!window.confirm("Delete this accident record permanently? This removes all attached photos and documents too.")) return;
    try { await api.deleteAccident({ staffName, id: accidentId }); onChanged(); }
    catch (e) { alert(e.message); }
  };
  const printReport = async () => {
    setGenerating(true); setErr("");
    try { await generateAccidentPDF(accident); }
    catch (e) { setErr(e.message); }
    finally { setGenerating(false); }
  };

  if (!accident) return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 320, padding: "1.25rem" }} onClick={e => e.stopPropagation()}>
        <p style={{ fontSize: 13, color: err ? "#dc2626" : "#888" }}>{err || "Loading…"}</p>
      </div>
    </div>
  );

  const photos = accident.files.filter(f => f.fileType === "Photo");
  const docs = accident.files.filter(f => f.fileType === "Document");

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{accident.plate}</p>
            <p style={{ fontSize: 11.5, color: "#888", margin: "2px 0 0" }}>{fmtDate(accident.accidentDate)}</p>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <div style={{ padding: "1.1rem 1.25rem" }}>
          {[
            ["Driver", accident.driverName || "—"],
            ["Station Report", accident.stationReport || "—"],
            ["Injuries Occurred", accident.injuriesOccurred ? "Yes" : "No"],
            ["Details", accident.details || "—"],
            ["Reported By", accident.reportedBy],
            ["Logged", fmtDateTime(accident.createdAt)],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "6px 0", borderBottom: "1px solid #f5f5f5" }}>
              <span style={{ fontSize: 11.5, color: "#888", flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 12.5, textAlign: "right" }}>{value}</span>
            </div>
          ))}

          {photos.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".3px", margin: "0 0 8px" }}>Photos ({photos.length})</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
                {photos.map(f => (
                  <div key={f.id} style={{ position: "relative" }}>
                    <img src={f.fileUrl} alt="" onClick={() => setViewingPhoto(f)} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, cursor: "pointer", border: "1px solid #e5e7eb" }} />
                    <button type="button" onClick={() => removeFile(f.id)} title="Remove"
                      style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 11, cursor: "pointer", lineHeight: 1 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {docs.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".3px", margin: "0 0 8px" }}>Documents ({docs.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {docs.map(f => (
                  <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #f0f0f0", borderRadius: 7, padding: "6px 10px" }}>
                    <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.filename || "Document"}</span>
                    <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 8 }}>
                      <a href={f.fileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue, #04519B)" }}>View</a>
                      <button type="button" onClick={() => removeFile(f.id)} style={{ fontSize: 11.5, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "12px 0 0" }}>{err}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" disabled={generating} onClick={printReport} style={{ ...primaryBtnStyle, opacity: generating ? 0.65 : 1 }}>{generating ? "Generating…" : "🖨 Print Report"}</button>
            {(role === "Admin" || role === "Manager") && (
              <button type="button" onClick={removeAccident} style={{ ...secondaryBtnStyle, color: "#dc2626", borderColor: "#fecaca" }}>Delete</button>
            )}
          </div>
        </div>
      </div>
      {viewingPhoto && <PhotoViewerPopup file={viewingPhoto} onClose={() => setViewingPhoto(null)} />}
    </div>
  );
}

export default function AccidentsPage({ staffName, role }) {
  const [accidents, setAccidents] = useState([]);
  const [plates, setPlates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getAccidents(), api.getFleet()])
      .then(([accRes, fleetRes]) => {
        setAccidents(accRes.data || []);
        setPlates((fleetRes.data || []).map(c => c.plate).sort());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Accidents</h2>
        <button type="button" onClick={() => setShowAdd(true)} style={primaryBtnStyle}>+ Report Accident</button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>
      ) : accidents.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>No accidents recorded.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {accidents.map(a => (
            <button type="button" key={a.id} onClick={() => setSelectedId(a.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", padding: "12px 14px",
                border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", cursor: "pointer", width: "100%", fontFamily: "inherit" }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.plate}{a.driverName ? ` · ${a.driverName}` : ""}</div>
                <div style={{ fontSize: 11.5, color: "#888" }}>{fmtDate(a.accidentDate)} · Reported by {a.reportedBy}{a.fileCount > 0 ? ` · ${a.fileCount} file${a.fileCount === 1 ? "" : "s"}` : ""}</div>
                {a.stationReport && <div style={{ fontSize: 11.5, color: "#888", marginTop: 2 }}>{a.stationReport}</div>}
              </div>
              {a.injuriesOccurred && (
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#fee2e2", color: "#991b1b", whiteSpace: "nowrap" }}>Injuries</span>
              )}
            </button>
          ))}
        </div>
      )}

      {showAdd && <AddAccidentModal staffName={staffName} plates={plates} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {selectedId && (
        <AccidentDetailModal staffName={staffName} role={role} accidentId={selectedId}
          onClose={() => setSelectedId(null)} onChanged={() => { setSelectedId(null); load(); }} />
      )}
    </div>
  );
}
