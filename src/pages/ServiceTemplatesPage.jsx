import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtDate(d) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}

export default function ServiceTemplatesPage({ staffName, role }) {
  const canEdit = role !== "Manager";
  const [view, setView] = useState("templates"); // "templates" | "assignments"
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [parts, setParts] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showAssign, setShowAssign] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const [tplRes, assignRes, partsRes, fleetRes] = await Promise.all([
        api.getServiceTemplates(), api.getCarServiceAssignments(), api.getParts(), api.getFleet(),
      ]);
      setTemplates(tplRes?.data || []);
      setAssignments(assignRes?.data || []);
      setParts((partsRes?.data || []).filter(p => p.active));
      setFleet(fleetRes?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load service templates.");
    } finally {
      setLoading(false);
    }
  }

  const templateName = (id) => templates.find(t => t.id === id)?.name || "—";

  // "Next due" for an assignment: whichever of km/date comes first, same
  // whichever-comes-first rule the template's interval itself is defined by.
  const dueInfo = (a) => {
    const now = new Date();
    let dueByDate = null, daysRemaining = null;
    if (a.intervalMonths && a.lastDoneDate) {
      const [y, m, d] = a.lastDoneDate.split("-").map(Number);
      dueByDate = new Date(y, m - 1 + a.intervalMonths, d);
      daysRemaining = Math.ceil((dueByDate - now) / (1000 * 60 * 60 * 24));
    }
    let dueByKm = null, kmRemaining = null;
    const car = fleet.find(c => c.plate === a.plate);
    if (a.intervalKm && a.lastDoneKm != null && car?.lastKnownOdometer != null) {
      dueByKm = a.lastDoneKm + a.intervalKm;
      kmRemaining = dueByKm - car.lastKnownOdometer;
    }
    // Whichever metric is more urgent (smaller remaining) drives the status,
    // but only metrics that actually have enough data to compute show up.
    const candidates = [];
    if (daysRemaining != null) candidates.push({ type: "date", remaining: daysRemaining, urgent: daysRemaining <= 14 });
    if (kmRemaining != null) candidates.push({ type: "km", remaining: kmRemaining, urgent: kmRemaining <= 500 });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.remaining - b.remaining);
    return candidates[0];
  };

  const dueSoon = useMemo(() => {
    return assignments
      .map(a => ({ ...a, due: dueInfo(a) }))
      .filter(a => a.due && a.due.urgent)
      .sort((a, b) => a.due.remaining - b.due.remaining);
  }, [assignments, fleet]);

  const handleCreateFromTemplate = async (assignment) => {
    if (!window.confirm(`Create a work order for ${assignment.plate} from "${assignment.templateName}"?`)) return;
    try {
      const res = await api.createWorkOrderFromTemplate({ assignmentId: assignment.id, staffName });
      alert(`Work order ${res.refNo} created.`);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleDeleteTemplate = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try { await api.deleteServiceTemplate({ id: t.id, staffName }); load(); }
    catch (e) { alert(e.message); }
  };

  const handleRemoveAssignment = async (a) => {
    if (!window.confirm(`Remove ${a.plate} from "${a.templateName}"?`)) return;
    try { await api.removeServiceAssignment({ id: a.id, staffName }); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {!loading && dueSoon.length > 0 && (
        <div style={{ marginBottom: 16, border: "1.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "var(--bg)", borderBottom: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>⚠ Recurring Services Due Soon</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {dueSoon.map(a => {
              const overdue = a.due.remaining <= 0;
              return (
                <div key={a.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 14px", borderBottom: "1px solid var(--border-light)",
                  background: overdue ? "var(--red-bg)" : "var(--surface)",
                }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{a.plate}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{a.templateName}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: overdue ? "var(--red)" : "#d97706" }}>
                      {a.due.type === "km"
                        ? (overdue ? `Overdue by ${fmtMoney(Math.abs(a.due.remaining))}km` : `Due in ${fmtMoney(a.due.remaining)}km`)
                        : (overdue ? `Overdue by ${Math.abs(a.due.remaining)}d` : `Due in ${a.due.remaining}d`)}
                    </span>
                    {canEdit && (
                      <button type="button" onClick={() => handleCreateFromTemplate(a)}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                          border: "1.5px solid var(--sc-blue)", background: "var(--surface)", color: "var(--sc-blue)" }}>
                        Create Work Order
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["templates","Templates"],["assignments","Car Assignments"]].map(([val,lab]) => (
          <button key={val} type="button" onClick={() => setView(val)}
            style={{ padding: "7px 14px", fontSize: 12.5, fontWeight: 600, borderRadius: 20, cursor: "pointer",
              border: `1.5px solid ${view===val ? "var(--sc-blue)" : "var(--border)"}`,
              background: view===val ? "var(--blue-bg)" : "var(--surface)",
              color: view===val ? "var(--sc-blue)" : "var(--text-muted)" }}>
            {lab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {canEdit && view === "templates" && <button type="button" className="btn btn-add" onClick={() => setShowAddTemplate(true)}>+ New Template</button>}
        {canEdit && view === "assignments" && <button type="button" className="btn btn-add" onClick={() => setShowAssign(true)}>+ Assign to Car</button>}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : view === "templates" ? (
        templates.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic" }}>No templates yet.</p>
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
                    <p style={{ fontSize: 12, color: "var(--sc-blue)", margin: "3px 0 0" }}>
                      {[t.intervalKm ? `Every ${fmtMoney(t.intervalKm)}km` : null, t.intervalMonths ? `Every ${t.intervalMonths}mo` : null].filter(Boolean).join(" or ")}
                    </p>
                    {t.description && <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 0" }}>{t.description}</p>}
                    {t.parts.length > 0 && (
                      <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "6px 0 0" }}>
                        Standard parts: {t.parts.map(p => `${p.partName} (${p.quantity}×)`).join(", ")}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button type="button" onClick={() => setEditingTemplate(t)}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                          border: "1.5px solid var(--sc-blue)", background: "var(--surface)", color: "var(--sc-blue)" }}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDeleteTemplate(t)}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                          border: "1.5px solid var(--red)", background: "var(--surface)", color: "var(--red)" }}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        assignments.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic" }}>No cars assigned to any template yet.</p>
        ) : (
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {assignments.map(a => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border-light)" }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{a.plate}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{a.templateName}</span>
                  <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "3px 0 0" }}>
                    Last done: {a.lastDoneDate ? fmtDate(a.lastDoneDate) : "—"}{a.lastDoneKm != null ? ` · ${fmtMoney(a.lastDoneKm)}km` : ""}
                  </p>
                </div>
                {canEdit && (
                  <button type="button" onClick={() => handleRemoveAssignment(a)}
                    style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                      border: "1.5px solid var(--red)", background: "var(--surface)", color: "var(--red)" }}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {showAddTemplate && (
        <TemplateModal parts={parts} staffName={staffName} onClose={() => setShowAddTemplate(false)} onSaved={() => { setShowAddTemplate(false); load(); }} />
      )}
      {editingTemplate && (
        <TemplateModal parts={parts} staffName={staffName} template={editingTemplate} onClose={() => setEditingTemplate(null)} onSaved={() => { setEditingTemplate(null); load(); }} />
      )}
      {showAssign && (
        <AssignModal fleet={fleet} templates={templates.filter(t => t.active)} staffName={staffName} onClose={() => setShowAssign(false)} onSaved={() => { setShowAssign(false); load(); }} />
      )}
    </div>
  );
}

function TemplateModal({ parts, template, staffName, onClose, onSaved }) {
  const isEdit = !!template;
  const [form, setForm] = useState({
    name: template?.name || "", description: template?.description || "",
    intervalKm: template ? String(template.intervalKm || "") : "",
    intervalMonths: template ? String(template.intervalMonths || "") : "",
    active: template ? template.active : true,
  });
  const [templateParts, setTemplateParts] = useState(template?.parts || []);
  const [addingPart, setAddingPart] = useState(false);
  const [newPart, setNewPart] = useState({ partId: "", quantity: "1" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("Template name is required."); return; }
    if (!form.intervalKm && !form.intervalMonths) { setErr("Set at least one interval (km or months)."); return; }
    setSaving(true); setErr("");
    const payload = {
      ...form,
      intervalKm: form.intervalKm ? Number(form.intervalKm) : null,
      intervalMonths: form.intervalMonths ? Number(form.intervalMonths) : null,
    };
    try {
      if (isEdit) await api.editServiceTemplate({ id: template.id, ...payload, staffName });
      else await api.addServiceTemplate({ ...payload, staffName });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleAddPart = async () => {
    if (!isEdit) { setErr("Save the template first, then add its standard parts."); return; }
    if (!newPart.partId) return;
    try {
      await api.addTemplatePart({ templateId: template.id, partId: newPart.partId, quantity: Number(newPart.quantity) || 1, staffName });
      const part = parts.find(p => p.id === newPart.partId);
      setTemplateParts(tp => [...tp, { partId: part.id, partName: part.name, unitCost: part.unitCost, quantity: Number(newPart.quantity) || 1 }]);
      setNewPart({ partId: "", quantity: "1" });
      setAddingPart(false);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>{isEdit ? "Edit Template" : "New Template"}</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Name *</label>
            <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Oil Change" autoFocus /></div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Interval (km)</label>
              <input style={S.input} type="number" min="0" value={form.intervalKm} onChange={e => set("intervalKm", e.target.value)} placeholder="e.g. 5000" /></div>
            <div style={S.field}><label style={S.label}>Interval (months)</label>
              <input style={S.input} type="number" min="0" value={form.intervalMonths} onChange={e => set("intervalMonths", e.target.value)} placeholder="e.g. 3" /></div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "-6px 0 10px" }}>Whichever comes first triggers the due alert.</p>
          <div style={S.field}><label style={S.label}>Description</label>
            <textarea style={S.textarea} rows={2} value={form.description} onChange={e => set("description", e.target.value)} /></div>

          {isEdit && (
            <div style={{ marginTop: 4, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Standard Parts</span>
                {!addingPart && <button type="button" onClick={() => setAddingPart(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>+ Add Part</button>}
              </div>
              {templateParts.length === 0 && !addingPart && <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No standard parts set</p>}
              {templateParts.map((p, i) => (
                <p key={i} style={{ fontSize: 12.5, margin: "3px 0" }}>{p.partName} — {p.quantity}× (TZS {fmtMoney(p.unitCost)} each)</p>
              ))}
              {addingPart && (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <select style={{ ...S.input, flex: 1 }} value={newPart.partId} onChange={e => setNewPart(n => ({ ...n, partId: e.target.value }))}>
                    <option value="">Select a part…</option>
                    {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input style={{ ...S.input, width: 60 }} type="number" min="1" value={newPart.quantity} onChange={e => setNewPart(n => ({ ...n, quantity: e.target.value }))} />
                  <button type="button" onClick={handleAddPart} style={{ padding: "0 12px", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer" }}>Add</button>
                </div>
              )}
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
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignModal({ fleet, templates, staffName, onClose, onSaved }) {
  const [plate, setPlate] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [lastDoneKm, setLastDoneKm] = useState("");
  const [lastDoneDate, setLastDoneDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const filtered = query.trim().length > 0
    ? fleet.filter(c => c.plate.toLowerCase().replace(/\s/g, "").includes(query.toLowerCase().replace(/\s/g, "")))
    : [];

  const handleSave = async () => {
    if (!plate) { setErr("Select a car."); return; }
    if (!templateId) { setErr("Select a template."); return; }
    setSaving(true); setErr("");
    try {
      await api.assignServiceTemplate({
        plate, templateId,
        lastDoneKm: lastDoneKm ? Number(lastDoneKm) : null,
        lastDoneDate: lastDoneDate || null,
        staffName,
      });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Assign Template to Car</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}>
            <label style={S.label}>Plate No. *</label>
            <div style={{ position: "relative" }}>
              <input style={S.input} placeholder="Type plate number…" value={query} autoComplete="off"
                onChange={e => { setQuery(e.target.value); setPlate(""); setOpen(true); }}
                onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
              {open && filtered.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow)", zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
                  {filtered.slice(0, 15).map(c => (
                    <div key={c.plate} style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border-light)" }}
                      onMouseDown={() => { setPlate(c.plate); setQuery(c.plate); setOpen(false); }}>
                      {c.plate}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={S.field}><label style={S.label}>Template *</label>
            <select style={S.input} value={templateId} onChange={e => setTemplateId(e.target.value)}>
              <option value="">Select a template…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Last Done (km)</label>
              <input style={S.input} type="number" min="0" value={lastDoneKm} onChange={e => setLastDoneKm(e.target.value)} placeholder="Optional" /></div>
            <div style={S.field}><label style={S.label}>Last Done (date)</label>
              <input style={S.input} type="date" value={lastDoneDate} onChange={e => setLastDoneDate(e.target.value)} /></div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "-6px 0 10px" }}>Leave blank if unknown — the due alert just won't show until a baseline is set.</p>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:    { background: "var(--surface)", borderRadius: 14, width: 440, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "var(--shadow-lg)" },
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
