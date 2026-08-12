import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { compressImage } from "../lib/imageCompress";

const DOC_TYPES = ["License", "National ID", "Defensive Driving Cert", "Other"];
const photoUrl = (fileId) => `/api?action=file&id=${encodeURIComponent(fileId)}`;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

// Red if expired or expiring within 7 days, amber within 30, otherwise
// neutral — mirrors the 30/7-day reminder thresholds so the visual signal
// matches what actually triggers a notification.
function expiryStyle(dateStr) {
  const days = daysUntil(dateStr);
  if (days == null) return { color: "var(--text-faint)", label: "—" };
  if (days < 0) return { color: "var(--red)", label: `Expired ${Math.abs(days)}d ago` };
  if (days <= 7) return { color: "var(--red)", label: `Expires in ${days}d` };
  if (days <= 30) return { color: "#d97706", label: `Expires in ${days}d` };
  return { color: "var(--green)", label: `Expires in ${days}d` };
}

export default function DriversPage({ staffName, role }) {
  // Admin always can; everyone else needs canManageDrivers explicitly
  // granted in Admin Panel — role alone (Manager/Garage Manager) is
  // deliberately NOT sufficient here, matching the backend's
  // requireDriverManageAccess check.
  const [canEdit, setCanEdit] = useState(role === "Admin");
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    load();
    if (role !== "Admin") {
      api.getStaffList().then(res => {
        const me = (res?.staff || []).find(s => s.name === staffName);
        if (me?.canManageDrivers) setCanEdit(true);
      }).catch(() => {});
    }
  }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const res = await api.getDriversV2();
      setDrivers(res?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load drivers.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = drivers.filter(d =>
    !search.trim() || d.name.toLowerCase().includes(search.toLowerCase()) || (d.phone || "").includes(search)
  );

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <input type="text" placeholder="Search drivers…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, minWidth: 220, fontFamily: "inherit" }} />
        {canEdit && <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ Add Driver</button>}
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic", textAlign: "center", padding: "2rem 0" }}>
          {search ? "No matching drivers." : "No drivers yet."}
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {filtered.map(d => (
            <DriverCard key={d.id} driver={d} onClick={() => setSelected(d)} />
          ))}
        </div>
      )}

      {showAdd && (
        <AddDriverModal staffName={staffName} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {selected && (
        <DriverDetailModal driverId={selected.id} staffName={staffName} canEdit={canEdit}
          onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  );
}

function DriverCard({ driver, onClick }) {
  const [docs, setDocs] = useState(null);
  useEffect(() => {
    api.getDriverDocuments(driver.id).then(res => setDocs(res?.data || [])).catch(() => setDocs([]));
  }, [driver.id]);

  const worstExpiry = docs && docs.length > 0
    ? docs.filter(d => d.expiryDate).sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate))[0]
    : null;
  const flag = worstExpiry ? expiryStyle(worstExpiry.expiryDate) : null;

  return (
    <div onClick={onClick} style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "12px 14px", cursor: "pointer", boxShadow: "var(--shadow-sm)",
    }}>
      <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{driver.name}{!driver.active && <span style={{ color: "var(--text-faint)", fontWeight: 500 }}> (inactive)</span>}</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "3px 0 0" }}>{driver.phone || "No phone on file"}</p>
      {docs === null ? (
        <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "6px 0 0" }}>Loading documents…</p>
      ) : docs.length === 0 ? (
        <p style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic", margin: "6px 0 0" }}>No documents on file</p>
      ) : flag && (flag.label.startsWith("Expired") || flag.label.includes("in 7") || flag.label.match(/in [1-7]d/)) ? (
        <p style={{ fontSize: 11, fontWeight: 700, color: flag.color, margin: "6px 0 0" }}>⚠ {flag.label}</p>
      ) : (
        <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "6px 0 0" }}>{docs.length} document{docs.length !== 1 ? "s" : ""} on file</p>
      )}
    </div>
  );
}

function AddDriverModal({ staffName, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", phone: "", licenseNumber: "", nationalId: "", address: "", notes: "" });
  const [photo, setPhoto] = useState(null); // { base64, mimeType, filename, previewUrl }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setPhoto({ ...compressed, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
    } catch { setErr("Could not read that file."); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("Driver name is required."); return; }
    if (!form.phone.trim()) { setErr("Phone number is required."); return; }
    setSaving(true); setErr("");
    try {
      const res = await api.addDriverV2({ ...form, staffName });
      // License document is optional — attach it after the driver exists,
      // since addDriverV2 only creates the driver record itself. A failure
      // here shouldn't block the driver from being saved (it already was),
      // so this is best-effort rather than part of the same transaction.
      if (photo && res.id) {
        await api.addDriverDocument({
          driverId: res.id, docType: "License", staffName,
          imageBase64: photo.base64, mimeType: photo.mimeType, filename: photo.filename,
        }).catch(() => {});
      }
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>New Driver</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={{ marginBottom: "1rem" }}>
            <label style={S.label}>License Document (optional)</label>
            <div style={{ border: "2px dashed var(--border)", borderRadius: 10, overflow: "hidden", cursor: "pointer", position: "relative", background: "var(--bg)", minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => document.getElementById("driver-license-input").click()}>
              {photo?.previewUrl ? (
                <img src={photo.previewUrl} alt="Preview" style={{ width: "100%", maxHeight: 200, objectFit: "cover" }} />
              ) : photo ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "1.5rem" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{photo.filename}</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "var(--text-faint)", padding: "1.5rem" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Click to upload license</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>JPG, PNG, PDF</div>
                </div>
              )}
              <input id="driver-license-input" type="file" accept="image/*,application/pdf"
                style={{ display: "none" }} onChange={handleFile} />
            </div>
          </div>

          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Name *</label>
              <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} autoFocus /></div>
            <div style={S.field}><label style={S.label}>Phone *</label>
              <input style={S.input} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+255…" /></div>
          </div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>License Number</label>
              <input style={S.input} value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} /></div>
            <div style={S.field}><label style={S.label}>National ID</label>
              <input style={S.input} value={form.nationalId} onChange={e => set("nationalId", e.target.value)} /></div>
          </div>
          <div style={S.field}><label style={S.label}>Address</label>
            <input style={S.input} value={form.address} onChange={e => set("address", e.target.value)} /></div>
          <div style={S.field}><label style={S.label}>Notes</label>
            <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Add Driver"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DriverDetailModal({ driverId, staffName, canEdit, onClose, onChanged }) {
  const [driver, setDriver] = useState(null);
  const [docs, setDocs] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);

  const load = () => {
    api.getDriverById(driverId).then(res => {
      if (res.success) { setDriver(res.data); setForm(res.data); }
    }).catch(() => {});
    api.getDriverDocuments(driverId).then(res => setDocs(res?.data || [])).catch(() => setDocs([]));
  };
  useEffect(load, [driverId]);

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await api.editDriver({ id: driverId, ...form, staffName });
      onChanged();
      load();
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (!driver) return null;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <div>
            <p style={S.mTitle}>{driver.name}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "2px 0 0" }}>{driver.phone || "No phone on file"}</p>
          </div>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.mBody}>
          {!editing ? (
            <>
              {[
                ["Phone", driver.phone || "—"],
                ["License Number", driver.licenseNumber || "—"],
                ["National ID", driver.nationalId || "—"],
                ["Address", driver.address || "—"],
                ["Notes", driver.notes || "—"],
                ["Status", driver.active ? "Active" : "Inactive"],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{val}</span>
                </div>
              ))}
              {canEdit && (
                <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => setEditing(true)}>
                  Edit Details
                </button>
              )}

              <DriverDocuments driverId={driverId} docs={docs} canEdit={canEdit} staffName={staffName}
                addingDoc={addingDoc} setAddingDoc={setAddingDoc} onChanged={load} />
            </>
          ) : (
            <>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Name</label>
                  <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Phone</label>
                  <input style={S.input} value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
              </div>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>License Number</label>
                  <input style={S.input} value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>National ID</label>
                  <input style={S.input} value={form.nationalId} onChange={e => set("nationalId", e.target.value)} /></div>
              </div>
              <div style={S.field}><label style={S.label}>Address</label>
                <input style={S.input} value={form.address} onChange={e => set("address", e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Notes</label>
                <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, color: "var(--text-muted)", cursor: "pointer", marginBottom: 10 }}>
                <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                Active
              </label>

              {err && <p style={S.err}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setEditing(false); setForm(driver); }}>Cancel</button>
                <button type="button" style={{ ...S.btn, flex: 1, marginTop: 0, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DriverDocuments({ driverId, docs, canEdit, staffName, addingDoc, setAddingDoc, onChanged }) {
  const [newDoc, setNewDoc] = useState({ docType: "License", label: "", expiryDate: "", notes: "" });
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setPhoto({ ...compressed, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
    } catch { setErr("Could not read that file."); }
  };

  const handleAdd = async () => {
    if (newDoc.docType === "Other" && !newDoc.label.trim()) { setErr("Please describe this document."); return; }
    setSaving(true); setErr("");
    try {
      await api.addDriverDocument({
        driverId, docType: newDoc.docType, label: newDoc.label, expiryDate: newDoc.expiryDate || undefined,
        notes: newDoc.notes, staffName,
        imageBase64: photo?.base64, mimeType: photo?.mimeType, filename: photo?.filename,
      });
      setNewDoc({ docType: "License", label: "", expiryDate: "", notes: "" });
      setPhoto(null);
      setAddingDoc(false);
      onChanged();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await api.deleteDriverDocument({ id, staffName }); onChanged(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Documents</span>
        {!addingDoc && canEdit && <button type="button" onClick={() => setAddingDoc(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>+ Add Document</button>}
      </div>

      {docs === null ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</p>
      ) : docs.length === 0 && !addingDoc ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No documents yet</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docs.map(doc => {
            const flag = expiryStyle(doc.expiryDate);
            return (
              <div key={doc.id} style={{ border: "1px solid var(--border-light)", borderRadius: 8, padding: 10, display: "flex", gap: 10 }}>
                {doc.fileId && (
                  <img src={photoUrl(doc.fileId)} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{doc.docType === "Other" && doc.label ? doc.label : doc.docType}</p>
                  <p style={{ fontSize: 11.5, color: flag.color, fontWeight: 600, margin: "2px 0 0" }}>{flag.label}</p>
                  {doc.notes && <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "2px 0 0" }}>{doc.notes}</p>}
                </div>
                {canEdit && (
                  <button type="button" onClick={() => handleDelete(doc.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addingDoc && (
        <div style={{ border: "1.5px solid var(--sc-blue)", borderRadius: 8, padding: 10, marginTop: 8 }}>
          <select style={{ ...S.input, marginBottom: 6 }} value={newDoc.docType} onChange={e => setNewDoc(d => ({ ...d, docType: e.target.value }))}>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {newDoc.docType === "Other" && (
            <input style={{ ...S.input, marginBottom: 6 }} placeholder="What is this document?" value={newDoc.label}
              onChange={e => setNewDoc(d => ({ ...d, label: e.target.value }))} />
          )}
          <div style={S.field}>
            <label style={S.label}>Expiry Date (optional)</label>
            <input style={S.input} type="date" value={newDoc.expiryDate} onChange={e => setNewDoc(d => ({ ...d, expiryDate: e.target.value }))} />
          </div>
          <div style={S.field}>
            <label style={S.label}>Photo/Scan (optional)</label>
            <div style={{ border: "2px dashed var(--border)", borderRadius: 10, overflow: "hidden", cursor: "pointer", position: "relative", background: "var(--bg)", minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => document.getElementById("driver-doc-input").click()}>
              {photo?.previewUrl ? (
                <img src={photo.previewUrl} alt="Preview" style={{ width: "100%", maxHeight: 180, objectFit: "cover" }} />
              ) : photo ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "1.25rem" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{photo.filename}</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "var(--text-faint)", padding: "1.25rem" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>Click to upload document</div>
                  <div style={{ fontSize: 10.5, marginTop: 3 }}>JPG, PNG, PDF</div>
                </div>
              )}
              <input id="driver-doc-input" type="file" accept="image/*,application/pdf"
                style={{ display: "none" }} onChange={handleFile} />
            </div>
          </div>
          {err && <p style={S.err}>{err}</p>}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 12 }} onClick={() => { setAddingDoc(false); setErr(""); setPhoto(null); setNewDoc({ docType: "License", label: "", expiryDate: "", notes: "" }); }}>Cancel</button>
            <button type="button" disabled={saving} style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.65 : 1 }} onClick={handleAdd}>
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  overlay:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:    { background: "var(--surface)", borderRadius: 14, width: 460, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "var(--shadow-lg)" },
  mHead:    { padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  mTitle:   { fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 },
  closeBtn: { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  mBody:    { padding: "1.25rem" },
  field:    { marginBottom: "0.85rem" },
  two:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  label:    { fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 4 },
  input:    { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--surface)", color: "var(--text)", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  btn:      { width: "100%", padding: "11px", fontSize: 14, fontWeight: 600, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4, fontFamily: "inherit" },
  err:      { color: "var(--red)", fontSize: 13, margin: "6px 0" },
};
