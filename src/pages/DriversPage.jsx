import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { compressImage } from "../lib/imageCompress";
import { parseDriverCsv } from "../lib/driverImport";

const DOC_TYPES = ["Driving License", "National ID (NIDA)", "TIN Certificate", "Defensive Driving Cert", "Others"];
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
  const [canEdit, setCanEdit] = useState(role === "Admin");
  const [drivers, setDrivers] = useState([]);
  const [docsByDriver, setDocsByDriver] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

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
      const [driversRes, docsRes] = await Promise.all([api.getDriversV2(), api.getAllDriverDocuments()]);
      setDrivers(driversRes?.data || []);
      const grouped = {};
      (docsRes?.data || []).forEach(doc => {
        (grouped[doc.driverId] ||= []).push(doc);
      });
      setDocsByDriver(grouped);
    } catch (e) {
      setErr(e.message || "Could not load drivers.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = drivers.filter(d =>
    !search.trim() || d.name.toLowerCase().includes(search.toLowerCase()) || (d.phone || "").includes(search)
  );

  const selectedDriver = selectedId ? drivers.find(d => d.id === selectedId) : null;

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <input type="text" placeholder="Search drivers…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, minWidth: 220, fontFamily: "inherit" }} />
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowImport(true)}>⬆ Import CSV</button>
            <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ Add Driver</button>
          </div>
        )}
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
          {filtered.map(d => {
            const docs = docsByDriver[d.id] || [];
            const worstExpiry = docs.filter(doc => doc.expiryDate).sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate))[0];
            const flag = worstExpiry ? expiryStyle(worstExpiry.expiryDate) : null;
            const isUrgent = flag && (flag.label.startsWith("Expired") || flag.label.match(/in [1-7]d/));
            return (
              <button key={d.id} type="button" onClick={() => setSelectedId(d.id)} style={{
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                padding: "12px 14px", cursor: "pointer", boxShadow: "var(--shadow-sm)",
                textAlign: "left", display: "block", width: "100%", fontFamily: "inherit",
                appearance: "none", WebkitAppearance: "none",
              }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                  {d.name}{!d.active && <span style={{ color: "var(--text-faint)", fontWeight: 500 }}> (inactive)</span>}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "3px 0 0" }}>{d.phone || "No phone on file"}</p>
                {docs.length === 0 ? (
                  <p style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic", margin: "6px 0 0" }}>No documents on file</p>
                ) : isUrgent ? (
                  <p style={{ fontSize: 11, fontWeight: 700, color: flag.color, margin: "6px 0 0" }}>⚠ {flag.label}</p>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "6px 0 0" }}>{docs.length} document{docs.length !== 1 ? "s" : ""} on file</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddDriverModal staffName={staffName} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {showImport && (
        <ImportCsvModal staffName={staffName} onClose={() => setShowImport(false)} onSaved={() => { setShowImport(false); load(); }} />
      )}
      {selectedDriver && (
        <DriverDetailModal driver={selectedDriver} docs={docsByDriver[selectedDriver.id] || []} staffName={staffName} canEdit={canEdit}
          onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </div>
  );
}

function AddDriverModal({ staffName, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", phone: "", licenseNumber: "", nationalId: "", address: "", notes: "" });
  const [photo, setPhoto] = useState(null);
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
      if (photo && res.id) {
        await api.addDriverDocument({
          driverId: res.id, docType: "Driving License", staffName,
          imageBase64: photo.base64, mimeType: photo.mimeType, filename: photo.filename,
        }).catch(() => {});
      }
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Add Driver</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}>
            <label style={S.label}>License Photo/Scan (optional)</label>
            <div style={{ border: "2px dashed var(--border)", borderRadius: 10, overflow: "hidden", cursor: "pointer", position: "relative", background: "var(--bg)", minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => document.getElementById("add-driver-doc-input").click()}>
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
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>Click to upload license image</div>
                  <div style={{ fontSize: 10.5, marginTop: 3 }}>JPG, PNG, PDF</div>
                </div>
              )}
              <input id="add-driver-doc-input" type="file" accept="image/*,application/pdf"
                style={{ display: "none" }} onChange={handleFile} />
            </div>
          </div>

          <div style={S.field}><label style={S.label}>Full Name *</label>
            <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} placeholder="As on driving license" autoFocus /></div>
          <div style={S.field}><label style={S.label}>Phone Number *</label>
            <input style={S.input} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+255…" /></div>
          <div style={S.field}><label style={S.label}>License Number</label>
            <input style={S.input} value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} placeholder="Driving license number" /></div>
          <div style={S.field}><label style={S.label}>National ID</label>
            <input style={S.input} value={form.nationalId} onChange={e => set("nationalId", e.target.value)} /></div>
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

// CSV import: parse -> review (valid rows shown editable, errors shown
// separately and skipped, per instruction) -> confirm -> bulk create.
// Nothing is saved until Confirm; parsing happens entirely client-side
// (src/lib/driverImport.js), so the backend only ever receives clean,
// already-reviewed row objects.
function ImportCsvModal({ staffName, onClose, onSaved }) {
  const [rows, setRows] = useState(null); // null = no file parsed yet
  const [errors, setErrors] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { created, failed } after confirm

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setErr(""); setResult(null);
    try {
      const parsed = await parseDriverCsv(file);
      setRows(parsed.rows);
      setErrors(parsed.errors);
    } catch (ex) {
      setErr("Could not read that file — make sure it's a valid CSV.");
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (i, patch) => {
    setRows(list => list.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };

  const removeRow = (i) => {
    setRows(list => list.filter((_, idx) => idx !== i));
  };

  const handleConfirm = async () => {
    setSaving(true); setErr("");
    try {
      const res = await api.bulkAddDrivers({ rows, staffName });
      setResult(res);
      if (res.failed.length === 0) {
        onSaved();
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Import Drivers from CSV</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          {rows === null ? (
            <>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
                CSV columns: <strong>Name, Phone</strong> (required), License Number, National ID, Address (optional).
                Column names are matched flexibly — "Phone", "Phone Number", "Mobile" all work.
              </p>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={parsing}
                style={{ fontSize: 13, fontFamily: "inherit" }} />
              {parsing && <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>Reading file…</p>}
              {err && <p style={S.err}>{err}</p>}
            </>
          ) : result ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--green)", margin: "0 0 8px" }}>
                ✓ Created {result.created.length} driver{result.created.length !== 1 ? "s" : ""}
              </p>
              {result.failed.length > 0 && (
                <>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", margin: "12px 0 6px" }}>
                    {result.failed.length} row{result.failed.length !== 1 ? "s" : ""} failed
                  </p>
                  <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden" }}>
                    {result.failed.map((f, i) => (
                      <div key={i} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                        Row {f.rowNum} ({f.name || "no name"}): {f.reason}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button type="button" style={{ ...S.btn, background: "var(--sc-blue)" }} onClick={onSaved}>Done</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>
                {rows.length} row{rows.length !== 1 ? "s" : ""} ready to import
              </p>
              {errors.length > 0 && (
                <p style={{ fontSize: 12, color: "var(--red)", margin: "0 0 10px" }}>
                  {errors.length} row{errors.length !== 1 ? "s" : ""} skipped (missing name or phone) — these won't be imported.
                </p>
              )}

              {rows.length > 0 && (
                <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, maxHeight: 280, overflowY: "auto", marginBottom: 10 }}>
                  {rows.map((r, i) => (
                    <div key={i} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-light)", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10.5, color: "var(--text-faint)", width: 24, flexShrink: 0 }}>#{r.rowNum}</span>
                      <input style={{ ...S.input, flex: 1.3 }} value={r.name} onChange={e => updateRow(i, { name: e.target.value })} placeholder="Name" />
                      <input style={{ ...S.input, flex: 1 }} value={r.phone} onChange={e => updateRow(i, { phone: e.target.value })} placeholder="Phone" />
                      <button type="button" onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {errors.length > 0 && (
                <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                  {errors.map((e, i) => (
                    <p key={i} style={{ fontSize: 11.5, color: "var(--red)", margin: "2px 0" }}>Row {e.rowNum}: {e.reason}</p>
                  ))}
                </div>
              )}

              {err && <p style={S.err}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setRows(null); setErrors([]); }}>Choose Different File</button>
                <button type="button" style={{ ...S.btn, flex: 1, marginTop: 0, background: "var(--sc-blue)", opacity: saving || rows.length === 0 ? 0.65 : 1 }}
                  disabled={saving || rows.length === 0} onClick={handleConfirm}>
                  {saving ? "Importing…" : `Import ${rows.length} Driver${rows.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DriverDetailModal({ driver, docs, staffName, canEdit, onClose, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(driver);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await api.editDriver({ id: driver.id, ...form, staffName });
      onChanged();
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <div>
            <p style={S.mTitle}>{driver.name}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "2px 0 0" }}>{driver.phone || "No phone on file"}</p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            {canEdit && !editing && (
              <button type="button" onClick={() => setEditing(true)} style={{
                background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 20,
                padding: "5px 12px", cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
              }}>
                Edit Details
              </button>
            )}
            <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
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

              <DriverDocuments driverId={driver.id} docs={docs} canEdit={canEdit} staffName={staffName}
                addingDoc={addingDoc} setAddingDoc={setAddingDoc} onChanged={onChanged} />

              <DriverAssignmentLog driverName={driver.name} />
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
  const [newDoc, setNewDoc] = useState({ docType: "Driving License", label: "", expiryDate: "", notes: "" });
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
    if (!newDoc.docType) { setErr("Document type is required."); return; }
    setSaving(true); setErr("");
    try {
      await api.addDriverDocument({
        driverId, docType: newDoc.docType, label: newDoc.label, expiryDate: newDoc.expiryDate, notes: newDoc.notes,
        staffName, imageBase64: photo?.base64, mimeType: photo?.mimeType, filename: photo?.filename,
      });
      setNewDoc({ docType: "Driving License", label: "", expiryDate: "", notes: "" });
      setPhoto(null);
      setAddingDoc(false);
      onChanged();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await api.deleteDriverDocument({ id, staffName }); onChanged(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Documents</span>
        {!addingDoc && canEdit && <button type="button" onClick={() => setAddingDoc(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>+ Add Document</button>}
        {addingDoc && (
          <button type="button" onClick={() => { setAddingDoc(false); setErr(""); setPhoto(null); setNewDoc({ docType: "Driving License", label: "", expiryDate: "", notes: "" }); }}
            style={{ fontSize: 13, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>✕</button>
        )}
      </div>

      {docs.length === 0 && !addingDoc ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No documents on file</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map(doc => {
            const flag = expiryStyle(doc.expiryDate);
            return (
              <div key={doc.id} style={{ border: "1px solid var(--border-light)", borderRadius: 8, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0 }}>{doc.docType === "Others" && doc.label ? doc.label : doc.docType}</p>
                  {doc.expiryDate && <p style={{ fontSize: 11, color: flag.color, margin: "2px 0 0" }}>{flag.label}</p>}
                  {doc.fileId && <a href={photoUrl(doc.fileId)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--sc-blue)" }}>View file</a>}
                </div>
                {canEdit && (
                  <button type="button" onClick={() => handleDelete(doc.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14 }}>✕</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {addingDoc && (
        <div style={{ border: "1.5px solid var(--sc-blue)", borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div style={S.field}>
            <label style={S.label}>Type</label>
            <select style={S.input} value={newDoc.docType} onChange={e => setNewDoc(n => ({ ...n, docType: e.target.value }))}>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {newDoc.docType === "Others" && (
            <div style={S.field}><label style={S.label}>Label</label>
              <input style={S.input} value={newDoc.label} onChange={e => setNewDoc(n => ({ ...n, label: e.target.value }))} placeholder="e.g. First Aid Certificate" /></div>
          )}
          <div style={S.field}><label style={S.label}>Expiry Date (optional)</label>
            <div style={{ overflow: "hidden", borderRadius: 7, width: "100%" }}>
              <input style={{ ...S.input, display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box", fontSize: 16 }}
                type="date" value={newDoc.expiryDate} onChange={e => setNewDoc(n => ({ ...n, expiryDate: e.target.value }))} />
            </div>
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
          <button type="button" disabled={saving} style={{ width: "100%", padding: "9px 0", fontSize: 12.5, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.65 : 1, marginTop: 8, fontFamily: "inherit" }} onClick={handleAdd}>
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}

// Built entirely from existing checkout/transfer history — not a
// separately maintained field, so it can never drift from what actually
// happened and needs zero manual entry from staff.
function DriverAssignmentLog({ driverName }) {
  const [log, setLog] = useState(null);

  useEffect(() => {
    api.getDriverAssignmentLog(driverName).then(res => setLog(res?.data || [])).catch(() => setLog([]));
  }, [driverName]);

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  };

  const current = log && log.length > 0 ? log[0] : null;

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 8px" }}>
        Client Assignments
      </p>

      {log === null ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</p>
      ) : log.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No assignment history yet — this fills in automatically after this driver is used on a checkout.</p>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "var(--blue-bg, #eff6ff)", borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>Current / Most Recent</span>
            <span style={{ fontWeight: 700 }}>{current.client || "—"}</span>
          </div>

          <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
            {log.map((entry, i) => (
              <div key={i} style={{ padding: "7px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{entry.client || "—"}</span>
                  <span style={{ color: "var(--text-faint)" }}>{entry.plate}</span>
                </div>
                <p style={{ color: "var(--text-faint)", margin: "2px 0 0" }}>
                  {fmtDate(entry.bookedFrom)} → {fmtDate(entry.returnDate)} · {entry.action}
                </p>
              </div>
            ))}
          </div>
        </>
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
