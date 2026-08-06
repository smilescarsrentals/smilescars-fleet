import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function PartsInventoryPage({ staffName, role }) {
  const canEdit = role !== "Manager";
  const [parts, setParts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const [partsRes, vendorsRes] = await Promise.all([api.getParts(), api.getVendors()]);
      setParts(partsRes?.data || []);
      setVendors(vendorsRes?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load parts inventory.");
    } finally {
      setLoading(false);
    }
  }

  const vendorName = (id) => vendors.find(v => v.id === id)?.name || "—";
  const isLowStock = (p) => p.reorderThreshold > 0 && p.quantityOnHand <= p.reorderThreshold;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parts.filter(p => {
      if (lowStockOnly && !isLowStock(p)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q) || vendorName(p.vendorId).toLowerCase().includes(q);
    });
  }, [parts, search, lowStockOnly, vendors]);

  const lowStockCount = useMemo(() => parts.filter(isLowStock).length, [parts]);

  const handleDelete = async (part) => {
    if (!window.confirm(`Delete part "${part.name}"?`)) return;
    try {
      await api.deletePart({ id: part.id, staffName });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flex: "1 1 auto", flexWrap: "wrap" }}>
          <input type="text" placeholder="Search parts…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: "1 1 220px", padding: "8px 12px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit" }} />
          <button type="button" onClick={() => setLowStockOnly(v => !v)}
            style={{ fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
              border: `1.5px solid ${lowStockOnly ? "#d97706" : "var(--border)"}`,
              background: lowStockOnly ? "var(--amber-bg)" : "var(--surface)",
              color: lowStockOnly ? "#d97706" : "var(--text-muted)" }}>
            ⚠ Low Stock {lowStockCount > 0 && `(${lowStockCount})`}
          </button>
        </div>
        {canEdit && <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ Add Part</button>}
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic" }}>
          {search || lowStockOnly ? "No matching parts." : "No parts in inventory yet."}
        </p>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          {filtered.map(p => {
            const low = isLowStock(p);
            return (
              <div key={p.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                padding: "10px 14px", borderBottom: "1px solid var(--border-light)",
                background: low ? "var(--amber-bg)" : "var(--surface)", opacity: p.active ? 1 : 0.6,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</span>
                    {low && <span style={{ fontSize: 10, fontWeight: 700, color: "#d97706" }}>⚠ LOW STOCK</span>}
                    {!p.active && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-faint)", background: "var(--border-light)", borderRadius: 10, padding: "1px 8px" }}>Inactive</span>}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "3px 0 0" }}>
                    {p.category || "—"} · {vendorName(p.vendorId)}
                  </p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: low ? "#d97706" : "var(--text)" }}>
                    {p.quantityOnHand} in stock
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "2px 0 0" }}>TZS {fmtMoney(p.unitCost)} / unit</p>
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => setEditing(p)}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                        border: "1.5px solid var(--sc-blue)", background: "var(--surface)", color: "var(--sc-blue)" }}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(p)}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                        border: "1.5px solid var(--red)", background: "var(--surface)", color: "var(--red)" }}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <PartModal staffName={staffName} vendors={vendors} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {editing && (
        <PartModal staffName={staffName} vendors={vendors} part={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function PartModal({ staffName, vendors, part, onClose, onSaved }) {
  const isEdit = !!part;
  const [form, setForm] = useState({
    name: part?.name || "", category: part?.category || "", vendorId: part?.vendorId || "",
    unitCost: part ? String(part.unitCost) : "", quantityOnHand: part ? String(part.quantityOnHand) : "0",
    reorderThreshold: part ? String(part.reorderThreshold) : "0", notes: part?.notes || "",
    active: part ? part.active : true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("Part name is required."); return; }
    setSaving(true); setErr("");
    const payload = {
      ...form,
      unitCost: Number(form.unitCost) || 0,
      quantityOnHand: Number(form.quantityOnHand) || 0,
      reorderThreshold: Number(form.reorderThreshold) || 0,
    };
    try {
      if (isEdit) await api.editPart({ id: part.id, ...payload, staffName });
      else await api.addPart({ ...payload, staffName });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>{isEdit ? "Edit Part" : "Add Part"}</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Name *</label>
            <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} autoFocus /></div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Category</label>
              <input style={S.input} value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. Brakes" /></div>
            <div style={S.field}><label style={S.label}>Supplier</label>
              <select style={S.input} value={form.vendorId} onChange={e => set("vendorId", e.target.value)}>
                <option value="">No supplier</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
          </div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Unit Cost (TZS)</label>
              <input style={S.input} type="number" min="0" value={form.unitCost} onChange={e => set("unitCost", e.target.value)} /></div>
            <div style={S.field}><label style={S.label}>Quantity on Hand</label>
              <input style={S.input} type="number" min="0" value={form.quantityOnHand} onChange={e => set("quantityOnHand", e.target.value)} /></div>
          </div>
          <div style={S.field}><label style={S.label}>Reorder Threshold</label>
            <input style={S.input} type="number" min="0" value={form.reorderThreshold} onChange={e => set("reorderThreshold", e.target.value)} placeholder="Alert when stock falls to/below this" /></div>
          <div style={S.field}><label style={S.label}>Notes</label>
            <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
          {isEdit && (
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, color: "var(--text-muted)", cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer" }} />
              Active
            </label>
          )}
          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Part"}
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
