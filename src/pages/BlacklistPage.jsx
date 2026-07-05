import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-TZ", { day:"2-digit", month:"short", year:"numeric" }) +
    " " + d.toLocaleTimeString("en-TZ", { hour:"2-digit", minute:"2-digit" });
}

export default function BlacklistPage({ staffName, role }) {
  const canDelete = role === "Admin" || role === "Manager";
  const [entries,  setEntries]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [showAdd,  setShowAdd]  = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const res = await api.getBlacklist(); setEntries(res.data || []); }
    catch {}
    setLoading(false);
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

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1.25rem",flexWrap:"wrap",gap:12 }}>
        <div>
          <h2 style={{ fontSize:20,fontWeight:700,color:"#111",margin:0 }}>⛔ Blacklist</h2>
          <p style={{ fontSize:13,color:"#888",margin:"4px 0 0" }}>{entries.length} flagged {entries.length===1?"person":"people"}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding:"8px 16px",fontSize:13,fontWeight:600,background:"#dc2626",color:"#fff",border:"none",borderRadius:7,cursor:"pointer" }}>
          + Add to Blacklist
        </button>
      </div>

      <div style={{ marginBottom:"1rem" }}>
        <input style={{ width:"100%",maxWidth:360,padding:"9px 12px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:8,boxSizing:"border-box" }}
          placeholder="Search name, phone or license number…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div style={{ textAlign:"center",padding:"3rem",color:"#666" }}>Loading…</div> : (
        <div className="sc-table-wrap">
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
            <thead>
              <tr>{["Name","Phone","License No","License Image","Added By","Date Added",""].map(h =>
                <th key={h} style={{ padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:600,color:"#888",borderBottom:"1px solid #e5e7eb",background:"#fafafa",textTransform:"uppercase",letterSpacing:".4px",whiteSpace:"nowrap" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign:"center",padding:"2.5rem",color:"#aaa",fontSize:14 }}>
                  {entries.length === 0 ? "No flagged persons yet." : "No results match your search."}
                </td></tr>
              )}
              {filtered.map((e, i) => (
                <tr key={e.id} style={{ borderBottom:"1px solid #f3f4f6" }}>
                  <td data-label="Name" style={{ padding:"12px",fontWeight:600,fontSize:13,color:"#111" }}>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ width:32,height:32,borderRadius:"50%",background:"#fee2e2",color:"#dc2626",fontSize:13,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                        {e.name.charAt(0).toUpperCase()}
                      </span>
                      {e.name}
                    </div>
                  </td>
                  <td data-label="Phone" style={{ padding:"12px",color:"#555" }}>{e.phone||"—"}</td>
                  <td data-label="License No" style={{ padding:"12px",fontFamily:"monospace",color:"#374151" }}>{e.licenseNo||"—"}</td>
                  <td data-label="License Image" style={{ padding:"12px" }}>
                    {e.licenseImageUrl
                      ? <a href={e.licenseImageUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize:12,fontWeight:600,color:"#2563eb",textDecoration:"none",background:"#eff6ff",padding:"3px 10px",borderRadius:6,border:"1px solid #bfdbfe" }}>
                          View Image
                        </a>
                      : <span style={{ color:"#ccc",fontSize:12 }}>—</span>}
                  </td>
                  <td data-label="Added By" style={{ padding:"12px",fontSize:12,color:"#555" }}>{e.addedBy||"—"}</td>
                  <td data-label="Date Added" style={{ padding:"12px",fontSize:12,color:"#888" }}>{fmtDateTime(e.timestamp)}</td>
                  <td style={{ padding:"12px" }}>
                    {canDelete && (
                      <button onClick={() => setSelected(e)}
                        style={{ fontSize:11,padding:"4px 10px",borderRadius:6,border:"1px solid #dc2626",background:"#fef2f2",color:"#dc2626",cursor:"pointer",fontWeight:500 }}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd   && <AddModal   staffName={staffName} onClose={()=>setShowAdd(false)}  onSaved={()=>{setShowAdd(false);load();}} />}
      {selected  && <DeleteModal entry={selected}     onClose={()=>setSelected(null)} onDeleted={()=>{setSelected(null);load();}} />}
    </div>
  );
}

function AddModal({ staffName, onClose, onSaved }) {
  const [form,   setForm]   = useState({ name:"", phone:"", licenseNo:"", licenseImageUrl:"" });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSave = async () => {
    if (!form.name.trim() && !form.phone.trim() && !form.licenseNo.trim())
      { setErr("At least one of name, phone or license number is required."); return; }
    setSaving(true); setErr("");
    try {
      await api.addToBlacklist({ ...form, addedBy: staffName });
      onSaved();
    } catch(e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{ ...S.mHead,background:"#dc2626" }}>
          <div><p style={S.mTitle}>⛔ Add to Blacklist</p></div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={{ background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#b91c1c" }}>
            This person will be blocked from renting any car. Staff will see a hard block during checkout.
          </div>
          <div style={S.field}><label style={S.label}>Full Name</label>
            <input style={S.input} value={form.name} onChange={e=>set("name",e.target.value)} placeholder="As on driving license" autoFocus /></div>
          <div style={S.field}><label style={S.label}>Phone Number</label>
            <input style={S.input} value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="+255..." /></div>
          <div style={S.field}><label style={S.label}>License Number</label>
            <input style={S.input} value={form.licenseNo} onChange={e=>set("licenseNo",e.target.value)} placeholder="Driving license number" /></div>
          <div style={S.field}><label style={S.label}>License Image URL <span style={{ color:"#aaa",fontWeight:400 }}>(optional)</span></label>
            <input style={S.input} value={form.licenseImageUrl} onChange={e=>set("licenseImageUrl",e.target.value)} placeholder="Dropbox or image link" /></div>
          {err && <p style={S.err}>{err}</p>}
          <button style={{ ...S.btn,background:"#dc2626",opacity:saving?0.65:1 }} onClick={handleSave} disabled={saving}>
            {saving?"Adding…":"Add to Blacklist"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ entry, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try { await api.deleteFromBlacklist({ id: entry.id }); onDeleted(); }
    catch(e) { alert(e.message); setDeleting(false); }
  };
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal,maxWidth:360 }} onClick={e=>e.stopPropagation()}>
        <div style={S.mBody}>
          <div style={{ textAlign:"center",padding:"1rem 0" }}>
            <div style={{ fontSize:44,marginBottom:12 }}>🗑</div>
            <h3 style={{ fontSize:16,fontWeight:700,color:"#111",margin:"0 0 8px" }}>Remove from Blacklist?</h3>
            <p style={{ fontSize:14,color:"#555",margin:"0 0 4px" }}><strong>{entry.name}</strong></p>
            <p style={{ fontSize:13,color:"#888",margin:"0 0 20px" }}>This person will be able to rent cars again.</p>
            <div style={{ display:"flex",gap:8 }}>
              <button style={{ ...S.btn,background:"#f3f4f6",color:"#555",flex:1,marginTop:0 }} onClick={onClose}>Cancel</button>
              <button style={{ ...S.btn,background:"#dc2626",flex:1,marginTop:0,opacity:deleting?0.65:1 }} onClick={handleDelete} disabled={deleting}>
                {deleting?"Removing…":"Yes, Remove"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 },
  modal:   { background:"#fff",borderRadius:14,width:440,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.18)" },
  mHead:   { padding:"1rem 1.25rem",borderRadius:"14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center" },
  mTitle:  { fontSize:16,fontWeight:700,color:"#fff",margin:0 },
  closeBtn:{ background:"rgba(255,255,255,0.25)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14 },
  mBody:   { padding:"1.25rem" },
  field:   { marginBottom:"0.85rem" },
  label:   { fontSize:12,fontWeight:500,color:"#555",display:"block",marginBottom:4 },
  input:   { width:"100%",padding:"9px 11px",fontSize:13,border:"1.5px solid #e5e7eb",borderRadius:7,background:"#fff",color:"#111",boxSizing:"border-box",fontFamily:"inherit" },
  btn:     { width:"100%",padding:"11px",fontSize:14,fontWeight:600,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",marginTop:4,fontFamily:"inherit" },
  err:     { color:"#dc2626",fontSize:13,margin:"6px 0" },
};
