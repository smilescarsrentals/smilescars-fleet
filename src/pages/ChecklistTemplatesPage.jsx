import { useState, useEffect } from "react";
import { api } from "../lib/api";

const STATES = ["Good", "Needs Attention", "Fail"];
const STATE_COLORS = { "Good": "var(--green)", "Needs Attention": "#d97706", "Fail": "var(--red)" };

export default function ChecklistTemplatesPage({ staffName, role }) {
  const canEdit = role !== "Manager";
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filling, setFilling] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const res = await api.getChecklistTemplates();
      setTemplates(res?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load checklist templates.");
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete checklist "${t.name}"?`)) return;
    try { await api.deleteChecklistTemplate({ id: t.id, staffName }); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Reusable checklists — fill one out against a work order, or standalone for a periodic inspection.
        </p>
        {canEdit && <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ New Checklist</button>}
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : templates.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic" }}>No checklists yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", opacity: t.active ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</span>
                    {!t.active && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-faint)", background: "var(--border-light)", borderRadius: 10, padding: "1px 8px" }}>Inactive</span>}
                  </div>
                  {t.description && <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 0" }}>{t.description}</p>}
                  {t.items.length > 0 && (
                    <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "6px 0 0" }}>
                      {t.items.length} item{t.items.length !== 1 ? "s" : ""}: {t.items.map(i => i.label).join(", ")}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {t.active && t.items.length > 0 && (
                    <button type="button" onClick={() => setFilling(t)}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                        border: "1.5px solid var(--green)", background: "var(--surface)", color: "var(--green)" }}>
                      Fill Out
                    </button>
                  )}
                  {canEdit && (
                    <>
                      <button type="button" onClick={() => setEditing(t)}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                          border: "1.5px solid var(--sc-blue)", background: "var(--surface)", color: "var(--sc-blue)" }}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(t)}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                          border: "1.5px solid var(--red)", background: "var(--surface)", color: "var(--red)" }}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <TemplateModal staffName={staffName} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {editing && (
        <TemplateModal staffName={staffName} template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {filling && (
        <FillOutModal template={filling} staffName={staffName} onClose={() => setFilling(null)} onSubmitted={() => setFilling(null)} />
      )}
    </div>
  );
}

function TemplateModal({ template, staffName, onClose, onSaved }) {
  const isEdit = !!template;
  const [form, setForm] = useState({ name: template?.name || "", description: template?.description || "", active: template ? template.active : true });
  const [items, setItems] = useState(template?.items || []);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("Checklist name is required."); return; }
    setSaving(true); setErr("");
    try {
      if (isEdit) await api.editChecklistTemplate({ id: template.id, ...form, staffName });
      else await api.addChecklistTemplate({ ...form, staffName });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleAddItem = async () => {
    if (!isEdit) { setErr("Save the checklist first, then add its items."); return; }
    if (!newLabel.trim()) return;
    try {
      await api.addChecklistTemplateItem({ templateId: template.id, label: newLabel.trim(), sortOrder: items.length, staffName });
      setItems(it => [...it, { label: newLabel.trim() }]);
      setNewLabel("");
    } catch (e) { setErr(e.message); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>{isEdit ? "Edit Checklist" : "New Checklist"}</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Name *</label>
            <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Pre-Rental Inspection" autoFocus /></div>
          <div style={S.field}><label style={S.label}>Description</label>
            <textarea style={S.textarea} rows={2} value={form.description} onChange={e => set("description", e.target.value)} /></div>

          {isEdit && (
            <div style={{ marginTop: 4, marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, display: "block", marginBottom: 6 }}>Items</span>
              {items.length === 0 && <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No items yet — add at least one before this checklist can be filled out.</p>}
              {items.map((it, i) => <p key={i} style={{ fontSize: 12.5, margin: "3px 0" }}>{i + 1}. {it.label}</p>)}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="e.g. Tyres" value={newLabel}
                  onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddItem()} />
                <button type="button" onClick={handleAddItem} style={{ padding: "0 14px", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer" }}>Add</button>
              </div>
            </div>
          )}

          {isEdit && (
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, color: "var(--text-muted)", cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer" }} />
              Active
            </label>
          )}

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Checklist"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Standalone fill-out flow — plate entered directly, no work order required.
// (Filling one out FROM a work order is handled inline on the Maintenance
// work order detail view, which passes workOrderId + plate automatically.)
function FillOutModal({ template, staffName, onClose, onSubmitted }) {
  const [plate, setPlate] = useState("");
  const [results, setResults] = useState(template.items.map(it => ({ label: it.label, state: "Good", note: "" })));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const setResult = (i, patch) => setResults(r => r.map((x, idx) => idx === i ? { ...x, ...patch } : x));

  const handleSubmit = async () => {
    if (!plate.trim()) { setErr("Plate is required."); return; }
    setSaving(true); setErr("");
    try {
      const res = await api.submitChecklist({ templateId: template.id, plate: plate.trim(), items: results, staffName });
      if (res.hasFailure) alert("⚠ This checklist has one or more items marked Fail — flagged on the car's profile.");
      onSubmitted();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ ...S.overlay, zIndex: 110 }} onClick={onClose}>
      <div style={{ ...S.modal, width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--green)" }}>
          <p style={S.mTitle}>{template.name}</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Plate No. *</label>
            <input style={S.input} value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="e.g. T 128 EDP" autoFocus /></div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            {results.map((r, i) => (
              <div key={i} style={{ border: "1px solid var(--border-light)", borderRadius: 8, padding: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>{r.label}</p>
                <div style={{ display: "flex", gap: 6, marginBottom: r.state !== "Good" ? 6 : 0 }}>
                  {STATES.map(s => (
                    <button key={s} type="button" onClick={() => setResult(i, { state: s })}
                      style={{ flex: 1, padding: "6px 0", fontSize: 11.5, fontWeight: 600, borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                        border: `1.5px solid ${r.state === s ? STATE_COLORS[s] : "var(--border)"}`,
                        background: r.state === s ? `${STATE_COLORS[s]}18` : "var(--surface)",
                        color: r.state === s ? STATE_COLORS[s] : "var(--text-muted)" }}>
                      {s}
                    </button>
                  ))}
                </div>
                {r.state !== "Good" && (
                  <input style={{ ...S.input, fontSize: 12.5 }} placeholder="Note (optional)…" value={r.note}
                    onChange={e => setResult(i, { note: e.target.value })} />
                )}
              </div>
            ))}
          </div>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--green)", opacity: saving ? 0.65 : 1 }} onClick={handleSubmit} disabled={saving}>
            {saving ? "Submitting…" : "Submit Checklist"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:    { background: "var(--surface)", borderRadius: 14, width: 420, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "var(--shadow-lg)" },
  mHead:    { padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  mTitle:   { fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 },
  closeBtn: { background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  mBody:    { padding: "1.25rem" },
  field:    { marginBottom: "0.85rem" },
  label:    { fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 4 },
  input:    { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--surface)", color: "var(--text)", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  btn:      { width: "100%", padding: "11px", fontSize: 14, fontWeight: 600, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4, fontFamily: "inherit" },
  err:      { color: "var(--red)", fontSize: 13, margin: "6px 0" },
};
