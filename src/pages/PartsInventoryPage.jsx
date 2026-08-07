import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { compressImage } from "../lib/imageCompress";
import { SupplierPicker } from "./MaintenancePage";

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
  const [showScan, setShowScan] = useState(false);
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
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowScan(true)}>📷 Scan Invoice</button>
            <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ Add Part</button>
          </div>
        )}
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
      {showScan && (
        <ScanInvoiceModal staffName={staffName} onClose={() => setShowScan(false)} onSaved={load} />
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

  const [costHistory, setCostHistory] = useState(null);
  useEffect(() => {
    if (!isEdit) return;
    api.getPartCostHistory(part.id).then(res => setCostHistory(res?.data || [])).catch(() => setCostHistory([]));
  }, [isEdit, part?.id]);

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

          {isEdit && costHistory && costHistory.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 6px" }}>
                Price History
              </p>
              <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden" }}>
                {costHistory.map(h => (
                  <div key={h.id} style={{ padding: "7px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>
                        {h.oldUnitCost != null ? `TZS ${h.oldUnitCost.toLocaleString()} → ` : ""}
                        <strong>TZS {h.newUnitCost.toLocaleString()}</strong>
                      </span>
                      <span style={{ color: "var(--text-faint)" }}>{new Date(h.createdAt).toLocaleDateString()}</span>
                    </div>
                    {h.supplierName && <p style={{ color: "var(--text-faint)", margin: "2px 0 0" }}>via {h.supplierName} (invoice scan)</p>}
                  </div>
                ))}
              </div>
            </div>
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

// ── Scan Invoice (Phase 1) ──────────────────────────────────────────────
// Photo in, extracted data shown for review — nothing is saved to
// Suppliers/Inventory yet. That's Phase 2+, once supplier/part matching
// logic exists. This phase proves the extraction itself is reliable
// enough to build on.
// Mutually-exclusive link to either a Work Order or a Customer Job, per
// instruction — pick the type first, then search within it. Entirely
// optional; the invoice saves fine with neither.
function WorkOrderJobPicker({ value, onChange }) {
  const [type, setType] = useState(value.workOrderId ? "wo" : value.customerJobId ? "cj" : "");
  const [workOrders, setWorkOrders] = useState([]);
  const [customerJobs, setCustomerJobs] = useState([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (type === "wo" && workOrders.length === 0) {
      api.getMaintenanceLog().then(res => setWorkOrders(res?.data || [])).catch(() => {});
    }
    if (type === "cj" && customerJobs.length === 0) {
      api.getCustomerJobs().then(res => setCustomerJobs(res?.data || [])).catch(() => {});
    }
  }, [type]);

  const list = type === "wo" ? workOrders : customerJobs;
  const label = (item) => type === "wo"
    ? `${item.refNo || item.id} — ${item.plate}`
    : `${item.refNo || item.id} — ${item.customerName} (${item.plate || "—"})`;
  const filtered = query.trim().length > 0
    ? list.filter(item => label(item).toLowerCase().includes(query.toLowerCase()))
    : list;

  const selectedId = type === "wo" ? value.workOrderId : type === "cj" ? value.customerJobId : "";
  const selectedItem = list.find(item => item.id === selectedId);

  return (
    <div style={S.field}>
      <label style={S.label}>Link to (optional)</label>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        {[["", "None"], ["wo", "Work Order"], ["cj", "Customer Job"]].map(([val, lab]) => (
          <button key={val} type="button"
            onClick={() => { setType(val); setQuery(""); onChange({ workOrderId: "", customerJobId: "" }); }}
            style={{ flex: 1, padding: "6px 0", fontSize: 11.5, fontWeight: 600, borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
              border: `1.5px solid ${type === val ? "var(--sc-blue)" : "var(--border)"}`,
              background: type === val ? "var(--blue-bg)" : "var(--surface)",
              color: type === val ? "var(--sc-blue)" : "var(--text-muted)" }}>
            {lab}
          </button>
        ))}
      </div>
      {type && (
        <div style={{ position: "relative" }}>
          <input style={{ ...S.input, background: selectedItem ? "var(--blue-bg)" : "var(--surface)" }}
            placeholder={type === "wo" ? "Search work orders…" : "Search customer jobs…"} autoComplete="off"
            value={selectedItem ? label(selectedItem) : query}
            onChange={e => { setQuery(e.target.value); onChange({ workOrderId: "", customerJobId: "" }); setOpen(true); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && filtered.length > 0 && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow)", zIndex: 50, maxHeight: 180, overflowY: "auto" }}>
              {filtered.slice(0, 20).map(item => (
                <div key={item.id} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12.5, borderBottom: "1px solid var(--border-light)" }}
                  onMouseDown={() => {
                    onChange(type === "wo" ? { workOrderId: item.id, customerJobId: "" } : { workOrderId: "", customerJobId: item.id });
                    setQuery(""); setOpen(false);
                  }}>
                  {label(item)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScanInvoiceModal({ staffName, onClose, onSaved }) {
  const [photo, setPhoto] = useState(null); // { base64, mimeType, previewUrl }
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null); // extracted data, plus supplierVendorId/each item's partId once matched
  const [link, setLink] = useState({ workOrderId: "", customerJobId: "" });
  const [suppliers, setSuppliers] = useState([]);
  const [parts, setParts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([api.getVendors(), api.getParts()]).then(([vRes, pRes]) => {
      setSuppliers((vRes?.data || []).filter(v => v.active && (v.vendorType === "Parts Supplier" || v.vendorType === "Both")));
      setParts((pRes?.data || []).filter(p => p.active));
    }).catch(() => {});
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(""); setResult(null);
    try {
      const compressed = await compressImage(file);
      setPhoto({ ...compressed, previewUrl: URL.createObjectURL(file) });
    } catch (ex) {
      setErr("Could not read that image — try a different photo.");
    }
  };

  const handleScan = async () => {
    if (!photo) { setErr("Take or choose a photo first."); return; }
    setScanning(true); setErr("");
    try {
      const res = await api.scanInvoice({ imageBase64: photo.base64, mimeType: photo.mimeType, staffName });
      // Best-effort auto-match on the extracted supplier name — still shown
      // in the picker for the reviewer to confirm or change, never silent.
      const guess = res.data.supplierName
        ? suppliers.find(s => s.name.trim().toLowerCase() === res.data.supplierName.trim().toLowerCase())
        : null;
      setResult({
        ...res.data,
        supplierVendorId: guess?.id || "",
        items: res.data.items.map(it => {
          const partGuess = it.itemName ? parts.find(p => p.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()) : null;
          return { ...it, partId: partGuess?.id || "" };
        }),
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setScanning(false);
    }
  };

  const updateItem = (i, patch) => {
    setResult(r => ({ ...r, items: r.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  };

  const handleConfirm = async () => {
    if (!photo) { setErr("Photo is missing."); return; }
    if (!result.supplierVendorId && !result.supplierName.trim()) { setErr("Enter or select a supplier."); return; }
    const validItems = result.items.filter(it => it.itemName && it.itemName.trim());
    if (validItems.length === 0) { setErr("At least one item is required."); return; }
    setSaving(true); setErr("");
    try {
      await api.confirmInvoiceScan({
        staffName, imageBase64: photo.base64, mimeType: photo.mimeType,
        supplierVendorId: result.supplierVendorId || undefined, supplierName: result.supplierName,
        invoiceDate: result.invoiceDate, totalAmount: result.totalAmount,
        items: validItems,
        workOrderId: link.workOrderId || undefined, customerJobId: link.customerJobId || undefined,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Scan Invoice</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}>
            <label style={S.label}>Invoice Photo</label>
            <input type="file" accept="image/*" capture="environment" onChange={handleFile}
              style={{ fontSize: 13, fontFamily: "inherit" }} />
          </div>

          {photo?.previewUrl && (
            <img src={photo.previewUrl} alt="Invoice preview" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 10 }} />
          )}

          {err && <p style={S.err}>{err}</p>}

          {!result && (
            <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: scanning || !photo ? 0.65 : 1 }}
              disabled={scanning || !photo} onClick={handleScan}>
              {scanning ? "Reading invoice…" : "Scan"}
            </button>
          )}

          {result && (
            <div style={{ marginTop: 8 }}>
              <div style={S.field}>
                <label style={S.label}>Supplier {result.supplierVendorId ? "" : "(new — will be created)"}</label>
                <SupplierPicker suppliers={suppliers} value={result.supplierVendorId} location=""
                  onChange={(id) => {
                    const match = suppliers.find(s => s.id === id);
                    setResult(r => ({ ...r, supplierVendorId: id, supplierName: match ? match.name : r.supplierName }));
                  }}
                  onSupplierAdded={s => setSuppliers(list => [...list, s])} />
                {!result.supplierVendorId && (
                  <input style={{ ...S.input, marginTop: 6 }} value={result.supplierName}
                    onChange={e => setResult(r => ({ ...r, supplierName: e.target.value }))}
                    placeholder="Supplier name (from scan — edit if needed)" />
                )}
              </div>
              <div style={S.two}>
                <div style={S.field}>
                  <label style={S.label}>Invoice Date</label>
                  <input style={S.input} value={result.invoiceDate} onChange={e => setResult(r => ({ ...r, invoiceDate: e.target.value }))} placeholder="Not detected" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Total Amount</label>
                  <input style={S.input} type="number" value={result.totalAmount ?? ""} onChange={e => setResult(r => ({ ...r, totalAmount: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Not detected" />
                </div>
              </div>

              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, margin: "14px 0 8px" }}>
                Items ({result.items.length})
              </p>
              {result.items.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No items detected.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.items.map((it, i) => (
                    <div key={i} style={{ border: "1px solid var(--border-light)", borderRadius: 8, padding: 8 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <input style={{ ...S.input, flex: 2 }} value={it.itemName} onChange={e => updateItem(i, { itemName: e.target.value })} placeholder="Item name" />
                        <input style={{ ...S.input, width: 55 }} type="number" value={it.quantity} onChange={e => updateItem(i, { quantity: Number(e.target.value) || 0 })} title="Quantity" />
                        <input style={{ ...S.input, width: 80 }} type="number" value={it.unitPrice ?? ""} onChange={e => updateItem(i, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Unit price" />
                      </div>
                      <select style={{ ...S.input, fontSize: 12 }} value={it.partId} onChange={e => updateItem(i, { partId: e.target.value })}>
                        <option value="">— New part (will be created) —</option>
                        {parts.map(p => <option key={p.id} value={p.id}>{p.name} — {p.quantityOnHand} in stock, TZS {p.unitCost.toLocaleString()}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <WorkOrderJobPicker value={link} onChange={setLink} />
              </div>

              <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "12px 0 10px" }}>
                Confirming updates stock (and cost, if it changed) for matched parts, creates new parts/supplier as needed, and saves the invoice photo.
              </p>
              <button type="button" style={{ ...S.btn, background: "var(--green)", opacity: saving ? 0.65 : 1 }} disabled={saving} onClick={handleConfirm}>
                {saving ? "Saving…" : "Confirm & Save"}
              </button>
            </div>
          )}
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
