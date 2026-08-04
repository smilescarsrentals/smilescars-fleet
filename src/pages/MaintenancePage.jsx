import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

const STATUSES = ["Queued", "In Progress", "Awaiting Parts", "Completed"];
const STATUS_COLORS = {
  "Queued":         "#3b82f6",
  "In Progress":    "#d97706",
  "Awaiting Parts": "#8b5cf6",
  "Completed":      "var(--green)",
};

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export default function MaintenancePage({ staffName, role }) {
  const [logs,    setLogs]    = useState([]);
  const [fleet,   setFleet]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const [logRes, fleetRes] = await Promise.all([api.getMaintenanceLog(), api.getFleet()]);
      setLogs(logRes?.data || []);
      setFleet(fleetRes?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load maintenance records.");
    } finally {
      setLoading(false);
    }
  }

  // Keep the open detail modal's data fresh after edits (re-derive from the
  // latest logs list rather than trusting a stale closure).
  const openDetailLog = showDetail ? logs.find(l => l.id === showDetail.id) || showDetail : null;

  const byStatus = useMemo(() => {
    const map = {}; STATUSES.forEach(s => map[s] = []);
    logs.forEach(l => { if (map[l.status]) map[l.status].push(l); });
    return map;
  }, [logs]);

  return (
    <div style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Maintenance</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 0" }}>
            {logs.length} work order{logs.length !== 1 ? "s" : ""} on file
          </p>
        </div>
        <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ New Work Order</button>
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {STATUSES.map(status => (
            <div key={status} style={{
              flex: "0 0 280px", background: "var(--bg)", border: "1.5px solid var(--border)",
              borderRadius: 12, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 190px)",
            }}>
              <div style={{
                padding: "10px 12px", borderBottom: "1px solid var(--border-light)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                position: "sticky", top: 0, background: "var(--bg)", borderRadius: "12px 12px 0 0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[status] }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{status}</span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
                  background: "var(--surface)", borderRadius: 20, padding: "1px 8px",
                }}>{byStatus[status].length}</span>
              </div>

              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {byStatus[status].length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center", padding: "1rem 0" }}>No work orders</p>
                )}
                {byStatus[status].map(log => (
                  <WorkOrderCard key={log.id} log={log} onClick={() => setShowDetail(log)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddWorkOrderModal
          staffName={staffName}
          fleet={fleet}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load(); }}
        />
      )}

      {openDetailLog && (
        <DetailModal
          log={openDetailLog}
          onClose={() => setShowDetail(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}

// ── Work order card ────────────────────────────────────────
function WorkOrderCard({ log, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderLeft: `3px solid ${STATUS_COLORS[log.status]}`,
      borderRadius: 8, padding: "9px 10px", boxShadow: "var(--shadow-sm)", cursor: "pointer",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{log.plate}</span>
        <span style={{ fontSize: 10, color: "var(--text-faint)" }}>{log.refNo || log.id}</span>
      </div>
      {log.issueDescription && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.4 }}>{log.issueDescription}</p>
      )}
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "5px 0 0" }}>🔧 {log.assignedMechanic || "—"}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
          {log.status === "Completed" ? `Closed ${fmtDateTime(log.dateClosed)}` : `Opened ${fmtDateTime(log.dateOpened)}`}
        </span>
        {log.totalCost > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--sc-blue)" }}>TZS {fmtMoney(log.totalCost)}</span>}
      </div>
    </div>
  );
}

// ── Detail / Edit Modal ──────────────────────────────────────
function DetailModal({ log, onClose, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    assignedMechanic: log.assignedMechanic, issueDescription: log.issueDescription,
    odometer: log.odometer, notes: log.notes,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const moveStatus = async (newStatus) => {
    setSaving(true); setErr("");
    try {
      await api.editMaintenanceLog({ id: log.id, status: newStatus });
      onUpdated();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await api.editMaintenanceLog({ id: log.id, ...form });
      onUpdated();
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const otherStatuses = STATUSES.filter(s => s !== log.status);
  const rows = [
    ["Ref No.", log.refNo || "—"],
    ["Plate", log.plate],
    ["Assigned Mechanic", log.assignedMechanic || "—"],
    ["Odometer", log.odometer || "—"],
    ["Issue Description", log.issueDescription || "—"],
    ["Notes", log.notes || "—"],
    ["Opened By", log.openedBy || "—"],
    ["Date Opened", fmtDateTime(log.dateOpened)],
    ...(log.status === "Completed" ? [["Date Closed", fmtDateTime(log.dateClosed)]] : []),
  ];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: STATUS_COLORS[log.status] }}>
          <div>
            <p style={S.mTitle}>{log.plate}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "2px 0 0" }}>{log.status} · {log.refNo || log.id}</p>
          </div>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.mBody}>
          {!editing ? (
            <>
              {rows.map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border-light)", fontSize: 13, gap: 10 }}>
                  <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>{val}</span>
                </div>
              ))}

              <JobCardItems workOrderId={log.id} totalCost={log.totalCost} onChanged={onUpdated} />

              {err && <p style={S.err}>{err}</p>}

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {otherStatuses.map(s => (
                  <button key={s} type="button" disabled={saving}
                    onClick={() => moveStatus(s)}
                    style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer", opacity: saving ? 0.6 : 1,
                      border: `1.5px solid ${STATUS_COLORS[s]}`, background: "var(--surface)", color: STATUS_COLORS[s] }}>
                    Move to {s}
                  </button>
                ))}
              </div>

              <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: 14 }} onClick={() => setEditing(true)}>
                Edit Details
              </button>
            </>
          ) : (
            <>
              <div style={S.field}><label style={S.label}>Assigned Mechanic</label>
                <input style={S.input} value={form.assignedMechanic} onChange={e => set("assignedMechanic", e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Odometer</label>
                <input style={S.input} value={form.odometer} onChange={e => set("odometer", e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Issue Description</label>
                <textarea style={S.textarea} rows={3} value={form.issueDescription} onChange={e => set("issueDescription", e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Notes</label>
                <textarea style={S.textarea} rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>

              {err && <p style={S.err}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancel</button>
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

// ── Job card line items ──────────────────────────────────────
// Item-level cost breakdown for a work order — this IS the cost of the job,
// there's no separate labor lump sum. Each add/edit/delete recomputes the
// parent work order's total_cost server-side.
function JobCardItems({ workOrderId, totalCost, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ itemName: "", quantity: "1", unitCost: "" });
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, [workOrderId]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getMaintenanceItems(workOrderId);
      setItems(res?.data || []);
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = async () => {
    if (!newItem.itemName.trim()) { setErr("Item name is required."); return; }
    setErr("");
    try {
      await api.addMaintenanceItem({
        workOrderId, itemName: newItem.itemName,
        quantity: Number(newItem.quantity) || 1, unitCost: Number(newItem.unitCost) || 0,
      });
      setNewItem({ itemName: "", quantity: "1", unitCost: "" });
      setAdding(false);
      await load();
      onChanged();
    } catch (e) { setErr(e.message); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteMaintenanceItem({ id });
      await load();
      onChanged();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Job Card Items</span>
        {!adding && <button type="button" onClick={() => setAdding(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>+ Add Item</button>}
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading items…</p>
      ) : items.length === 0 && !adding ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No items yet</p>
      ) : (
        <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden" }}>
          {items.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12.5, gap: 8 }}>
              <span style={{ flex: 1 }}>{item.itemName}</span>
              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{item.quantity} × {fmtMoney(item.unitCost)}</span>
              <span style={{ fontWeight: 700, flexShrink: 0, minWidth: 70, textAlign: "right" }}>{fmtMoney(item.lineTotal)}</span>
              <button type="button" onClick={() => handleDelete(item.id)}
                style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, padding: "0 2px", flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ border: "1.5px solid var(--sc-blue)", borderRadius: 8, padding: 10, marginTop: items.length > 0 ? 0 : 8 }}>
          <input style={{ ...S.input, marginBottom: 6 }} placeholder="Item name (e.g. Brake pads)" value={newItem.itemName}
            onChange={e => setNewItem(n => ({ ...n, itemName: e.target.value }))} autoFocus />
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...S.input, width: 70 }} type="number" min="0" placeholder="Qty" value={newItem.quantity}
              onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))} />
            <input style={{ ...S.input, flex: 1 }} type="number" min="0" placeholder="Unit cost (TZS)" value={newItem.unitCost}
              onChange={e => setNewItem(n => ({ ...n, unitCost: e.target.value }))} />
          </div>
          {err && <p style={S.err}>{err}</p>}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 12 }} onClick={() => { setAdding(false); setErr(""); }}>Cancel</button>
            <button type="button" style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer" }} onClick={handleAdd}>Add</button>
          </div>
        </div>
      )}

      {(items.length > 0 || totalCost > 0) && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 2px 0", fontSize: 13, fontWeight: 700 }}>
          <span>Total</span>
          <span style={{ color: "var(--sc-blue)" }}>TZS {fmtMoney(totalCost)}</span>
        </div>
      )}
    </div>
  );
}

// ── Add Work Order Modal ─────────────────────────────────────
function AddWorkOrderModal({ staffName, fleet, onClose, onSaved }) {
  const [form, setForm] = useState({
    plate: "", assignedMechanic: "", issueDescription: "", odometer: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.plate.trim())            { setErr("Plate is required."); return; }
    if (!form.assignedMechanic.trim()) { setErr("Assigned mechanic is required."); return; }
    setSaving(true); setErr("");
    try {
      await api.addMaintenanceLog({ ...form, openedBy: staffName });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>New Work Order</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Plate No. *</label>
            <PlateField fleet={fleet} value={form.plate} onChange={p => set("plate", p)} />
          </div>
          <div style={S.field}><label style={S.label}>Assigned Mechanic *</label>
            <input style={S.input} value={form.assignedMechanic} onChange={e => set("assignedMechanic", e.target.value)} placeholder="Mechanic's name" /></div>
          <div style={S.field}><label style={S.label}>Odometer</label>
            <input style={S.input} value={form.odometer} onChange={e => set("odometer", e.target.value)} placeholder="e.g. 84,200 km" /></div>
          <div style={S.field}><label style={S.label}>Issue Description</label>
            <textarea style={S.textarea} rows={3} value={form.issueDescription} onChange={e => set("issueDescription", e.target.value)} placeholder="What's wrong / what's being serviced…" /></div>
          <div style={S.field}><label style={S.label}>Notes</label>
            <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any additional notes…" /></div>

          <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "0 0 8px" }}>
            A reference number (e.g. SC/GAR/2026/08/0001) is generated automatically. Job card items can be added once the work order is created.
          </p>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Create Work Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Plate search — deliberately NOT filtered to "Available" cars only, unlike
// Reservations' PlateSearch, since a car needing maintenance can be in any
// status (already broken down, mid-rental issue reported, etc).
function PlateField({ fleet, value, onChange }) {
  const [query, setQuery] = useState(value || "");
  const [open,  setOpen]  = useState(false);
  const filtered = query.trim().length > 0
    ? fleet.filter(c => c.plate.toLowerCase().replace(/\s/g, "").includes(query.toLowerCase().replace(/\s/g, "")))
    : [];
  const select = (car) => { onChange(car.plate); setQuery(car.plate); setOpen(false); };

  return (
    <div style={{ position: "relative" }}>
      <input style={{ ...S.input, background: value ? "var(--blue-bg)" : "var(--surface)", paddingRight: value ? 32 : 11 }}
        placeholder="Type plate number…" value={query} autoComplete="off"
        onChange={e => { setQuery(e.target.value); onChange(""); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {value && <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "var(--sc-blue)", fontWeight: 700 }}>✓</span>}
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow)", zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
          {filtered.slice(0, 15).map(c => (
            <div key={c.plate} style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between" }}
              onMouseDown={() => select(c)}>
              <span style={{ fontWeight: 600 }}>{c.plate}</span>
              <span style={{ color: "var(--text-muted)" }}>{c.type} · {c.status}</span>
            </div>
          ))}
        </div>
      )}
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
  label:    { fontSize: 12, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 4 },
  input:    { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--surface)", color: "var(--text)", boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "9px 11px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 7, background: "var(--surface)", color: "var(--text)", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" },
  btn:      { width: "100%", padding: "11px", fontSize: 14, fontWeight: 600, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4, fontFamily: "inherit" },
  err:      { color: "var(--red)", fontSize: 13, margin: "6px 0" },
};
