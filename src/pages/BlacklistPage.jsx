import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

export default function BlacklistPage({ staffName, role }) {
  const canDelete = role === "Admin" || role === "Manager";
  const [entries,   setEntries]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [showAdd,   setShowAdd]   = useState(false);
  const [lightbox,  setLightbox]  = useState(null); // selected entry for lightbox

  const load = async () => {
    setLoading(true);
    try { const res = await api.getBlacklist(); setEntries(res.data || []); }
    catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter(e =>
      !q ||
      e.name.toLowerCase().includes(q) ||
      (e.phone||"").includes(q) ||
      (e.licenseNo||"").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const handleDelete = async (entry) => {
    if (!window.confirm(`Remove ${entry.name} from blacklist?`)) return;
    try {
      await api.deleteFromBlacklist({ id: entry.id, fileId: entry.fileId });
      setLightbox(null);
      load();
    } catch(e) { alert(e.message); }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.25rem",flexWrap:"wrap",gap:12 }}>
        <div>
          <h2 style={{ fontSize:20,fontWeight:700,color:"#111",margin:0 }}>⛔ Blacklist</h2>
          <p style={{ fontSize:13,color:"#888",margin:"4px 0 0" }}>{entries.length} flagged {entries.length===1?"person":"people"}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding:"9px 18px",fontSize:13,fontWeight:600,background:"#dc2626",color:"#fff",border:"none",borderRadius:8,cursor:"pointer" }}>
          + Add to Blacklist
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom:"1.25rem" }}>
        <input style={{ width:"100%",maxWidth:360,padding:"9px 12px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:8,boxSizing:"border-box" }}
          placeholder="Search name, phone or license number…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Gallery */}
      {loading ? (
        <div style={{ textAlign:"center",padding:"3rem",color:"#666" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center",padding:"3rem",color:"#aaa",fontSize:14 }}>
          {entries.length === 0 ? "No flagged persons yet." : "No results match your search."}
        </div>
      ) : (
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16 }} className="sc-blacklist-grid">
          {filtered.map(entry => (
            <div key={entry.id} onClick={() => setLightbox(entry)}
              style={{ background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.08)",cursor:"pointer",border:"1px solid #e5e7eb",transition:"transform .15s,box-shadow .15s" }}
              onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.08)"; }}>

              {/* License image */}
              <div style={{ width:"100%",height:180,background:"#f3f4f6",overflow:"hidden",position:"relative" }}>
                {entry.imageUrl ? (
                  <img src={entry.imageUrl} alt="License" style={{ width:"100%",height:"100%",objectFit:"cover" }} />
                ) : (
                  <div style={{ width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#d1d5db" }}>
                    <div style={{ fontSize:40 }}>🪪</div>
                    <div style={{ fontSize:11,marginTop:6 }}>No image</div>
                  </div>
                )}
                {/* Blacklisted banner */}
                <div style={{ position:"absolute",top:0,left:0,right:0,background:"rgba(220,38,38,0.85)",color:"#fff",fontSize:10,fontWeight:700,textAlign:"center",padding:"4px 0",letterSpacing:"1px" }}>
                  ⛔ BLACKLISTED
                </div>
              </div>

              {/* Info */}
              <div style={{ padding:"12px" }}>
                <div style={{ fontWeight:700,fontSize:14,color:"#111",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{entry.name||"—"}</div>
                {entry.phone && <div style={{ fontSize:12,color:"#555",marginBottom:2 }}>📞 {entry.phone}</div>}
                {entry.licenseNo && <div style={{ fontSize:12,color:"#374151",fontFamily:"monospace" }}>🪪 {entry.licenseNo}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <AddModal staffName={staffName} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}
          onClick={() => setLightbox(null)}>
          <div style={{ background:"#fff",borderRadius:16,overflow:"hidden",width:480,maxWidth:"100%",maxHeight:"90vh",display:"flex",flexDirection:"column" }}
            onClick={e => e.stopPropagation()}>

            {/* Lightbox image */}
            <div style={{ background:"#111",minHeight:260,display:"flex",alignItems:"center",justifyContent:"center",position:"relative" }}>
              {lightbox.imageUrl ? (
                <img src={lightbox.imageUrl} alt="License" style={{ maxWidth:"100%",maxHeight:340,objectFit:"contain" }} />
              ) : (
                <div style={{ color:"#555",textAlign:"center",padding:"3rem" }}>
                  <div style={{ fontSize:60 }}>🪪</div>
                  <div style={{ fontSize:13,marginTop:8 }}>No image uploaded</div>
                </div>
              )}
              <button onClick={() => setLightbox(null)}
                style={{ position:"absolute",top:12,right:12,background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:16 }}>✕</button>
              <div style={{ position:"absolute",top:0,left:0,right:0,background:"rgba(220,38,38,0.8)",color:"#fff",fontSize:11,fontWeight:700,textAlign:"center",padding:"5px 0",letterSpacing:"1px" }}>
                ⛔ BLACKLISTED
              </div>
            </div>

            {/* Details */}
            <div style={{ padding:"1.25rem" }}>
              <h3 style={{ fontSize:18,fontWeight:700,color:"#111",margin:"0 0 12px" }}>{lightbox.name||"Unknown"}</h3>
              {[
                ["Phone",      lightbox.phone],
                ["License No", lightbox.licenseNo],
              ].map(([label, val]) => val ? (
                <div key={label} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #f3f4f6",fontSize:13 }}>
                  <span style={{ fontWeight:600,color:"#888",fontSize:12,textTransform:"uppercase",letterSpacing:".3px" }}>{label}</span>
                  <span style={{ color:"#111" }}>{val}</span>
                </div>
              ) : null)}

              {canDelete && (
                <button onClick={() => handleDelete(lightbox)}
                  style={{ width:"100%",marginTop:16,padding:"11px",fontSize:14,fontWeight:600,background:"#dc2626",color:"#fff",border:"none",borderRadius:8,cursor:"pointer" }}>
                  🗑 Remove from Blacklist
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Modal ─────────────────────────────────────────────────
function AddModal({ staffName, onClose, onSaved }) {
  const [name,       setName]       = useState("");
  const [phone,      setPhone]      = useState("");
  const [licenseNo,  setLicenseNo]  = useState("");
  const [imageFile,  setImageFile]  = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState("");
  const [progress,   setProgress]   = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!name.trim() && !phone.trim() && !licenseNo.trim())
      { setErr("Please enter at least a name, phone or license number."); return; }
    setSaving(true); setErr(""); setProgress("");
    try {
      let imageUrl = ""; let fileId = "";

      if (imageFile) {
        setProgress("Uploading image…");
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload  = () => res(r.result.split(",")[1]);
          r.onerror = () => rej(new Error("Read failed"));
          r.readAsDataURL(imageFile);
        });
        const upRes = await api.uploadBlacklistImage({
          imageBase64: base64,
          mimeType:    imageFile.type,
          filename:    licenseNo ? `${licenseNo}.${imageFile.name.split(".").pop()}` : imageFile.name,
        });
        if (upRes.success) { imageUrl = upRes.url; fileId = upRes.fileId; }
      }

      setProgress("Saving…");
      await api.addToBlacklist({ name, phone, licenseNo, imageUrl, fileId, addedBy: staffName });
      onSaved();
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); setProgress(""); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ background:"#dc2626",padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <p style={{ fontSize:16,fontWeight:700,color:"#fff",margin:0 }}>⛔ Add to Blacklist</p>
          <button style={{ background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding:"1.25rem" }}>
          <div style={{ background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#b91c1c" }}>
            This person will be hard-blocked during checkout — staff cannot proceed.
          </div>

          {/* Image upload */}
          <div style={{ marginBottom:"1rem" }}>
            <label style={S.label}>License Image</label>
            <div style={{ border:"2px dashed #e5e7eb",borderRadius:10,overflow:"hidden",cursor:"pointer",position:"relative",background:"#fafafa",minHeight:160,display:"flex",alignItems:"center",justifyContent:"center" }}
              onClick={() => document.getElementById("bl-image-input").click()}>
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" style={{ width:"100%",maxHeight:200,objectFit:"cover" }} />
              ) : (
                <div style={{ textAlign:"center",color:"#9ca3af",padding:"1.5rem" }}>
                  <div style={{ fontSize:36,marginBottom:8 }}>📷</div>
                  <div style={{ fontSize:13,fontWeight:500 }}>Click to upload license image</div>
                  <div style={{ fontSize:11,marginTop:4 }}>JPG, PNG, PDF</div>
                </div>
              )}
              <input id="bl-image-input" type="file" accept="image/*,application/pdf"
                style={{ display:"none" }} onChange={handleFileChange} />
            </div>
          </div>

          <div style={S.field}><label style={S.label}>Full Name</label>
            <input style={S.input} value={name} onChange={e=>setName(e.target.value)} placeholder="As on driving license" autoFocus /></div>
          <div style={S.field}><label style={S.label}>Phone Number</label>
            <input style={S.input} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+255..." /></div>
          <div style={S.field}><label style={S.label}>License Number</label>
            <input style={S.input} value={licenseNo} onChange={e=>setLicenseNo(e.target.value)} placeholder="Driving license number" /></div>

          {err      && <p style={{ color:"#dc2626",fontSize:13,margin:"6px 0" }}>{err}</p>}
          {progress && <p style={{ color:"#888",fontSize:12,margin:"6px 0" }}>{progress}</p>}

          <button style={{ width:"100%",padding:"11px",fontSize:14,fontWeight:600,color:"#fff",background:"#dc2626",border:"none",borderRadius:8,cursor:"pointer",marginTop:4,fontFamily:"inherit",opacity:saving?0.65:1 }}
            onClick={handleSave} disabled={saving}>
            {saving ? progress||"Saving…" : "Add to Blacklist"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 },
  modal:   { background:"#fff",borderRadius:14,width:440,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" },
  field:   { marginBottom:"0.85rem" },
  label:   { fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:4 },
  input:   { width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111",boxSizing:"border-box",fontFamily:"inherit" },
};
