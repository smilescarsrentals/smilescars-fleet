import { useState } from "react";
import { api } from "../lib/api";
import { toTitleCase } from "../lib/textFormat";

export default function AddCarModal({ locations, onClose, onSaved }) {
  const [plate,    setPlate]    = useState("");
  const [type,     setType]     = useState("");
  const [location, setLocation] = useState(locations && locations[0] ? locations[0] : "");
  const [regCardUrl, setRegCardUrl] = useState("");
  const [photosUrl,  setPhotosUrl]  = useState("");
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const handleSave = async () => {
    if (!plate.trim())    { setErr("Plate number is required."); return; }
    if (!type.trim())     { setErr("Type is required."); return; }
    if (!location.trim()) { setErr("Location is required."); return; }
    setSaving(true); setErr("");
    try {
      await api.addCar({
        plate: plate.trim().toUpperCase(),
        type: type.trim(),
        location: location.trim(),
        regCardUrl: regCardUrl.trim(),
        photosUrl: photosUrl.trim(),
      });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.head}>
          <p style={S.title}>Add Car to Fleet</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <div style={S.field}>
            <label style={S.label}>Plate No. *</label>
            <input style={S.input} value={plate} onChange={e=>setPlate(e.target.value)} placeholder="e.g. T 123 ABC" autoFocus />
          </div>
          <div style={S.field}>
            <label style={S.label}>Type *</label>
            <input style={S.input} value={type} onChange={e=>setType(e.target.value)} onBlur={e=>setType(toTitleCase(e.target.value))} placeholder="e.g. Harrier" />
          </div>
          <div style={S.field}>
            <label style={S.label}>Location *</label>
            {locations && locations.length > 0 ? (
              <select style={{ ...S.input, fontFamily:"inherit" }} value={location} onChange={e=>setLocation(e.target.value)}>
                {locations.map(l => <option key={l}>{l}</option>)}
              </select>
            ) : (
              <input style={S.input} value={location} onChange={e=>setLocation(e.target.value)} onBlur={e=>setLocation(toTitleCase(e.target.value))} placeholder="e.g. Dar Es Salaam" />
            )}
          </div>

          <div style={{ height:1, background:"#f3f4f6", margin:"4px 0 12px" }} />

          <div style={S.field}>
            <label style={S.label}>Reg Card URL <span style={{ color:"#aaa", fontWeight:400 }}>(optional)</span></label>
            <input style={S.input} value={regCardUrl} onChange={e=>setRegCardUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div style={S.field}>
            <label style={S.label}>Photos URL <span style={{ color:"#aaa", fontWeight:400 }}>(optional)</span></label>
            <input style={S.input} value={photosUrl} onChange={e=>setPhotosUrl(e.target.value)} placeholder="https://..." />
          </div>

          <p style={{ fontSize:12, color:"#888", margin:"0 0 12px" }}>Status will be set to <strong>Available</strong> automatically.</p>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Adding…" : "Add Car"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 },
  modal:   { background:"#fff", borderRadius:14, width:420, maxWidth:"100%", maxHeight:"92vh", overflow:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.18)" },
  head:    { padding:"1rem 1.25rem", borderRadius:"14px 14px 0 0", display:"flex", justifyContent:"space-between", alignItems:"flex-start", background:"#1d4ed8" },
  title:   { fontSize:16, fontWeight:700, color:"#fff", margin:0 },
  closeBtn:{ background:"rgba(255,255,255,0.25)", border:"none", color:"#fff", borderRadius:6, padding:"4px 8px", cursor:"pointer", fontSize:14 },
  body:    { padding:"1.25rem" },
  field:   { marginBottom:"0.85rem" },
  label:   { fontSize:12, fontWeight:500, color:"#555", display:"block", marginBottom:4 },
  input:   { width:"100%", padding:"9px 11px", fontSize:13, border:"1.5px solid #e5e7eb", borderRadius:7, background:"#fff", color:"#111", boxSizing:"border-box", fontFamily:"inherit" },
  btn:     { width:"100%", padding:"11px", fontSize:14, fontWeight:600, color:"#fff", background:"#1d4ed8", border:"none", borderRadius:8, cursor:"pointer", marginTop:4, fontFamily:"inherit" },
  err:     { color:"#dc2626", fontSize:13, margin:"6px 0" },
};
