import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

export default function VendorsPage({ staffName, role }) {
  const canEdit = role !== "Manager";
  const [vendors, setVendors] = useState([]);
  const [vendorCategories, setVendorCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const [vendorRes, catRes] = await Promise.all([api.getVendors(), api.getVendorCategories()]);
      setVendors(vendorRes?.data || []);
      setVendorCategories(catRes?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load vendors.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter(v => {
      if (categoryFilter && !(v.categoryList || []).some(c => c.id === categoryFilter)) return false;
      if (!q) return true;
      return v.name.toLowerCase().includes(q) ||
        (v.categories || "").toLowerCase().includes(q) ||
        (v.contactPerson || "").toLowerCase().includes(q) ||
        (v.categoryList || []).some(c => c.name.toLowerCase().includes(q));
    });
  }, [vendors, search, categoryFilter]);

  const handleDelete = async (vendor) => {
    if (!window.confirm(`Delete vendor "${vendor.name}"?`)) return;
    try {
      await api.deleteVendor({ id: vendor.id, staffName });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flex: "1 1 auto", flexWrap: "wrap" }}>
          <input type="text" placeholder="Search vendors…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: "1 1 220px", padding: "8px 12px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit" }} />
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            style={{ padding: "8px 10px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit" }}>
            <option value="">All categories</option>
            {vendorCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {canEdit && <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ Add Vendor</button>}
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic" }}>
          {search ? "No matching vendors." : "No vendors yet."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(v => (
            <div key={v.id} style={{
              border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px",
              background: v.active ? "var(--surface)" : "var(--bg)", opacity: v.active ? 1 : 0.6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--sc-blue)", background: "var(--blue-bg)", borderRadius: 10, padding: "1px 8px" }}>{v.vendorType}</span>
                    {!v.active && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-faint)", background: "var(--border-light)", borderRadius: 10, padding: "1px 8px" }}>Inactive</span>}
                  </div>
                  {v.categories && <p style={{ fontSize: 12, color: "var(--sc-blue)", margin: "3px 0 0" }}>{v.categories}</p>}
                  {v.categoryList && v.categoryList.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                      {v.categoryList.map(c => (
                        <span key={c.id} style={{ fontSize: 10.5, fontWeight: 600, color: "#8b5cf6", background: "#f3e8ff", borderRadius: 10, padding: "2px 8px" }}>{c.name}</span>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 0" }}>
                    {v.contactPerson && <>{v.contactPerson} · </>}{v.phone || "—"}
                  </p>
                  {v.location && <p style={{ fontSize: 12, color: "var(--text-faint)", margin: "2px 0 0" }}>{v.location}</p>}
                  {v.paymentTerms && <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "2px 0 0" }}>Terms: {v.paymentTerms}</p>}
                  {v.notes && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", fontStyle: "italic" }}>{v.notes}</p>}
                </div>
                {canEdit && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => setEditing(v)}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                        border: "1.5px solid var(--sc-blue)", background: "var(--surface)", color: "var(--sc-blue)" }}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(v)}
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
      )}

      {showAdd && (
        <VendorModal staffName={staffName} vendorCategories={vendorCategories} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {editing && (
        <VendorModal staffName={staffName} vendorCategories={vendorCategories} vendor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function VendorModal({ staffName, vendor, vendorCategories, onClose, onSaved }) {
  const isEdit = !!vendor;
  const [form, setForm] = useState({
    name: vendor?.name || "", contactPerson: vendor?.contactPerson || "", phone: vendor?.phone || "",
    location: vendor?.location || "", categories: vendor?.categories || "", paymentTerms: vendor?.paymentTerms || "",
    vendorType: vendor?.vendorType || "Parts Supplier",
    notes: vendor?.notes || "", active: vendor ? vendor.active : true,
  });
  const [selectedCategories, setSelectedCategories] = useState((vendor?.categoryList || []).map(c => c.id));
  const [categoryList, setCategoryList] = useState(vendorCategories || []);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleCategory = (id) => setSelectedCategories(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await api.addVendorCategory({ name: newCategoryName.trim(), staffName });
      const newCat = { id: res.id, name: newCategoryName.trim() };
      setCategoryList(list => [...list, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCategories(sel => [...sel, res.id]);
      setNewCategoryName("");
      setAddingCategory(false);
    } catch (e) { setErr(e.message); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("Vendor name is required."); return; }
    setSaving(true); setErr("");
    try {
      let vendorId = vendor?.id;
      if (isEdit) await api.editVendor({ id: vendor.id, ...form, staffName });
      else { const res = await api.addVendor({ ...form, staffName }); vendorId = res.id; }
      await api.setVendorCategories({ vendorId, categoryIds: selectedCategories, staffName });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>{isEdit ? "Edit Vendor" : "Add Vendor"}</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Name *</label>
            <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} autoFocus /></div>
          <div style={S.field}><label style={S.label}>Vendor Type</label>
            <select style={S.input} value={form.vendorType} onChange={e => set("vendorType", e.target.value)}>
              <option value="Parts Supplier">Parts Supplier</option>
              <option value="Service Provider">Service Provider</option>
              <option value="Both">Both</option>
            </select></div>

          <div style={S.field}>
            <label style={S.label}>Categories</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {categoryList.map(c => (
                <button key={c.id} type="button" onClick={() => toggleCategory(c.id)}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${selectedCategories.includes(c.id) ? "#8b5cf6" : "var(--border)"}`,
                    background: selectedCategories.includes(c.id) ? "#f3e8ff" : "var(--surface)",
                    color: selectedCategories.includes(c.id) ? "#8b5cf6" : "var(--text-muted)" }}>
                  {c.name}
                </button>
              ))}
            </div>
            {addingCategory ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="New category name" value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddCategory()} autoFocus />
                <button type="button" onClick={handleAddCategory} style={{ padding: "0 14px", fontSize: 12, fontWeight: 600, color: "#fff", background: "#8b5cf6", border: "none", borderRadius: 6, cursor: "pointer" }}>Add</button>
                <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryName(""); }} style={{ padding: "0 10px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>✕</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingCategory(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "#8b5cf6", background: "none", border: "none", cursor: "pointer", marginTop: 8, padding: 0 }}>+ New Category</button>
            )}
          </div>
          <div style={S.field}><label style={S.label}>Contact Person</label>
            <input style={S.input} value={form.contactPerson} onChange={e => set("contactPerson", e.target.value)} /></div>
          <div style={S.field}><label style={S.label}>Phone</label>
            <input style={S.input} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+255…" /></div>
          <div style={S.field}><label style={S.label}>Location</label>
            <input style={S.input} value={form.location} onChange={e => set("location", e.target.value)} /></div>
          <div style={S.field}><label style={S.label}>Categories</label>
            <input style={S.input} value={form.categories} onChange={e => set("categories", e.target.value)} placeholder="e.g. Brakes, Filters, Tyres" /></div>
          <div style={S.field}><label style={S.label}>Payment Terms</label>
            <input style={S.input} value={form.paymentTerms} onChange={e => set("paymentTerms", e.target.value)} placeholder="e.g. Net 30, Cash on delivery" /></div>
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
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Vendor"}
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
