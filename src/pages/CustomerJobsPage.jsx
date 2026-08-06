import { useState, useEffect } from "react";
import { api } from "../lib/api";

const STATUSES = ["Queued", "In Progress", "Awaiting Parts", "Completed"];
const STATUS_COLORS = {
  "Queued":         "#3b82f6",
  "In Progress":    "#d97706",
  "Awaiting Parts": "#8b5cf6",
  "Completed":      "var(--green)",
};
const TRANSITIONS = {
  "Queued":         ["In Progress"],
  "In Progress":    ["Awaiting Parts", "Completed"],
  "Awaiting Parts": ["In Progress", "Completed"],
  "Completed":      [],
};
const PAYMENT_STATUSES = ["Unpaid", "Partial", "Paid"];
const PAYMENT_COLORS = { "Unpaid": "var(--red)", "Partial": "#d97706", "Paid": "var(--green)" };

function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function CustomerJobsPage({ staffName, role }) {
  const canEdit = role !== "Manager";
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const res = await api.getCustomerJobs();
      setJobs(res?.data || []);
    } catch (e) {
      setErr(e.message || "Could not load customer jobs.");
    } finally {
      setLoading(false);
    }
  }

  const openDetailJob = showDetail ? jobs.find(j => j.id === showDetail.id) || showDetail : null;

  const byStatus = {};
  STATUSES.forEach(s => byStatus[s] = []);
  jobs.forEach(j => { if (byStatus[j.status]) byStatus[j.status].push(j); });

  const revenueTotal = jobs.reduce((sum, j) => sum + (Number(j.priceCharged) || 0), 0);
  const costTotal = jobs.reduce((sum, j) => sum + (Number(j.totalCost) || 0), 0);
  const unpaidCount = jobs.filter(j => j.paymentStatus !== "Paid").length;

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Outside customers' cars serviced at SmilesCars Garage — separate from fleet maintenance.
        </p>
        {canEdit && <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ New Customer Job</button>}
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {!loading && jobs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 16, border: "1.5px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>Revenue (Charged)</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0", color: "var(--green)" }}>TZS {fmtMoney(revenueTotal)}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>Our Cost</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0" }}>TZS {fmtMoney(costTotal)}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>Margin</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0", color: "var(--sc-blue)" }}>TZS {fmtMoney(revenueTotal - costTotal)}</p>
          </div>
          {unpaidCount > 0 && (
            <div>
              <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>Not Fully Paid</p>
              <p style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0", color: "var(--red)" }}>{unpaidCount} job{unpaidCount !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {STATUSES.map(status => (
            <div key={status} style={{
              minWidth: 0, background: "var(--bg)", border: "1.5px solid var(--border)",
              borderRadius: 12, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 260px)",
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
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", background: "var(--surface)", borderRadius: 20, padding: "1px 8px" }}>
                  {byStatus[status].length}
                </span>
              </div>

              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {byStatus[status].length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center", padding: "1rem 0" }}>No jobs</p>
                )}
                {byStatus[status].map(job => (
                  <JobCard key={job.id} job={job} onClick={() => setShowDetail(job)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddJobModal staffName={staffName} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {openDetailJob && (
        <DetailModal job={openDetailJob} staffName={staffName} canEdit={canEdit} onClose={() => setShowDetail(null)} onUpdated={load} />
      )}
    </div>
  );
}

function JobCard({ job, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderLeft: `3px solid ${STATUS_COLORS[job.status]}`,
      borderRadius: 8, padding: "9px 10px", boxShadow: "var(--shadow-sm)", cursor: "pointer",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{job.plate}</span>
        <span style={{ fontSize: 9.5, color: "var(--text-faint)", wordBreak: "break-all", textAlign: "right" }}>{job.refNo || job.id}</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>{job.customerName}</p>
      {job.issueDescription && <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "3px 0 0", lineHeight: 1.4 }}>{job.issueDescription}</p>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 10, color: "#fff", background: PAYMENT_COLORS[job.paymentStatus] }}>{job.paymentStatus}</span>
        {job.priceCharged > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--green)" }}>TZS {fmtMoney(job.priceCharged)}</span>}
      </div>
    </div>
  );
}

function AddJobModal({ staffName, onClose, onSaved }) {
  const [form, setForm] = useState({
    customerName: "", customerPhone: "", plate: "", carDescription: "", assignedMechanic: "",
    issueDescription: "", odometer: "", notes: "", priceCharged: "", paymentStatus: "Unpaid",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.customerName.trim()) { setErr("Customer name is required."); return; }
    if (!form.customerPhone.trim()) { setErr("Customer phone is required."); return; }
    if (!form.plate.trim()) { setErr("Plate is required."); return; }
    setSaving(true); setErr("");
    try {
      await api.addCustomerJob({ ...form, priceCharged: Number(form.priceCharged) || 0, staffName });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>New Customer Job</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Customer Name *</label>
              <input style={S.input} value={form.customerName} onChange={e => set("customerName", e.target.value)} autoFocus /></div>
            <div style={S.field}><label style={S.label}>Phone *</label>
              <input style={S.input} value={form.customerPhone} onChange={e => set("customerPhone", e.target.value)} placeholder="+255…" /></div>
          </div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Plate No. *</label>
              <input style={S.input} value={form.plate} onChange={e => set("plate", e.target.value.toUpperCase())} placeholder="e.g. T 123 ABC" /></div>
            <div style={S.field}><label style={S.label}>Car (make/model)</label>
              <input style={S.input} value={form.carDescription} onChange={e => set("carDescription", e.target.value)} placeholder="e.g. Toyota Hilux" /></div>
          </div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Assigned Mechanic</label>
              <input style={S.input} value={form.assignedMechanic} onChange={e => set("assignedMechanic", e.target.value)} /></div>
            <div style={S.field}><label style={S.label}>Odometer</label>
              <input style={S.input} value={form.odometer} onChange={e => set("odometer", e.target.value)} placeholder="e.g. 84,200" /></div>
          </div>
          <div style={S.field}><label style={S.label}>Issue Description</label>
            <textarea style={S.textarea} rows={2} value={form.issueDescription} onChange={e => set("issueDescription", e.target.value)} /></div>
          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Price Charged (TZS)</label>
              <input style={S.input} type="number" min="0" value={form.priceCharged} onChange={e => set("priceCharged", e.target.value)} /></div>
            <div style={S.field}><label style={S.label}>Payment Status</label>
              <select style={S.input} value={form.paymentStatus} onChange={e => set("paymentStatus", e.target.value)}>
                {PAYMENT_STATUSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select></div>
          </div>
          <div style={S.field}><label style={S.label}>Notes</label>
            <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>

          <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "0 0 8px" }}>
            A reference number (e.g. SC/CUST/2026/08/0001) is generated automatically.
          </p>
          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Create Job"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ job, staffName, canEdit, onClose, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    customerName: job.customerName, customerPhone: job.customerPhone, carDescription: job.carDescription,
    assignedMechanic: job.assignedMechanic, issueDescription: job.issueDescription, odometer: job.odometer,
    notes: job.notes, priceCharged: String(job.priceCharged || ""), paymentStatus: job.paymentStatus, amountPaid: String(job.amountPaid || ""),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const moveStatus = async (newStatus) => {
    setSaving(true); setErr("");
    try {
      await api.editCustomerJob({ id: job.id, status: newStatus, staffName });
      onUpdated();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await api.editCustomerJob({ id: job.id, ...form, priceCharged: Number(form.priceCharged) || 0, amountPaid: Number(form.amountPaid) || 0, staffName });
      onUpdated();
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const rows = [
    ["Ref No.", job.refNo || "—"],
    ["Customer", job.customerName],
    ["Phone", job.customerPhone],
    ["Plate", job.plate],
    ["Car", job.carDescription || "—"],
    ["Assigned Mechanic", job.assignedMechanic || "—"],
    ["Odometer", job.odometer || "—"],
    ["Issue Description", job.issueDescription || "—"],
    ["Price Charged", `TZS ${fmtMoney(job.priceCharged)}`],
    ["Payment Status", job.paymentStatus],
    ["Amount Paid", `TZS ${fmtMoney(job.amountPaid)}`],
    ["Opened By", job.openedBy || "—"],
    ["Date Opened", fmtDateTime(job.dateOpened)],
    ...(job.status === "Completed" ? [["Date Closed", fmtDateTime(job.dateClosed)]] : []),
  ];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: STATUS_COLORS[job.status] }}>
          <div>
            <p style={S.mTitle}>{job.plate}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "2px 0 0" }}>{job.status} · {job.refNo || job.id}</p>
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

              <JobCardItems jobId={job.id} totalCost={job.totalCost} canEdit={canEdit} staffName={staffName} onChanged={onUpdated} />
              <UpdatesTimeline jobId={job.id} staffName={staffName} canEdit={canEdit} />

              {err && <p style={S.err}>{err}</p>}

              {canEdit && (
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {TRANSITIONS[job.status].map(s => (
                    <button key={s} type="button" disabled={saving} onClick={() => moveStatus(s)}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer", opacity: saving ? 0.6 : 1,
                        border: `1.5px solid ${STATUS_COLORS[s]}`, background: "var(--surface)", color: STATUS_COLORS[s] }}>
                      Move to {s}
                    </button>
                  ))}
                </div>
              )}
              {canEdit && (
                <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => setEditing(true)}>
                  Edit Details
                </button>
              )}
            </>
          ) : (
            <>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Customer Name</label>
                  <input style={S.input} value={form.customerName} onChange={e => set("customerName", e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Phone</label>
                  <input style={S.input} value={form.customerPhone} onChange={e => set("customerPhone", e.target.value)} /></div>
              </div>
              <div style={S.field}><label style={S.label}>Car (make/model)</label>
                <input style={S.input} value={form.carDescription} onChange={e => set("carDescription", e.target.value)} /></div>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Assigned Mechanic</label>
                  <input style={S.input} value={form.assignedMechanic} onChange={e => set("assignedMechanic", e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Odometer</label>
                  <input style={S.input} value={form.odometer} onChange={e => set("odometer", e.target.value)} /></div>
              </div>
              <div style={S.field}><label style={S.label}>Issue Description</label>
                <textarea style={S.textarea} rows={2} value={form.issueDescription} onChange={e => set("issueDescription", e.target.value)} /></div>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Price Charged (TZS)</label>
                  <input style={S.input} type="number" min="0" value={form.priceCharged} onChange={e => set("priceCharged", e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Payment Status</label>
                  <select style={S.input} value={form.paymentStatus} onChange={e => set("paymentStatus", e.target.value)}>
                    {PAYMENT_STATUSES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select></div>
              </div>
              <div style={S.field}><label style={S.label}>Amount Paid (TZS)</label>
                <input style={S.input} type="number" min="0" value={form.amountPaid} onChange={e => set("amountPaid", e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Notes</label>
                <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>

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

function JobCardItems({ jobId, totalCost, canEdit, staffName, onChanged }) {
  const [items, setItems] = useState([]);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [fromStock, setFromStock] = useState(true);
  const [selectedPartId, setSelectedPartId] = useState("");
  const [newItem, setNewItem] = useState({ itemName: "", quantity: "1", unitCost: "" });
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, [jobId]);

  async function load() {
    setLoading(true);
    try {
      const [itemsRes, partsRes] = await Promise.all([api.getCustomerJobItems(jobId), api.getParts()]);
      setItems(itemsRes?.data || []);
      setParts((partsRes?.data || []).filter(p => p.active));
    } finally {
      setLoading(false);
    }
  }

  const selectedPart = parts.find(p => p.id === selectedPartId);
  const selectPart = (partId) => {
    setSelectedPartId(partId);
    const p = parts.find(x => x.id === partId);
    if (p) setNewItem(n => ({ ...n, itemName: p.name, unitCost: String(p.unitCost) }));
  };

  const handleAdd = async () => {
    if (!newItem.itemName.trim()) { setErr("Item name is required."); return; }
    const qty = Number(newItem.quantity) || 1;
    if (fromStock && selectedPart && qty > selectedPart.quantityOnHand) { setErr(`Only ${selectedPart.quantityOnHand} in stock.`); return; }
    setErr("");
    try {
      await api.addCustomerJobItem({
        jobId, itemName: newItem.itemName, quantity: qty, unitCost: Number(newItem.unitCost) || 0, staffName,
        partId: fromStock && selectedPartId ? selectedPartId : undefined,
      });
      setNewItem({ itemName: "", quantity: "1", unitCost: "" });
      setSelectedPartId("");
      setAdding(false);
      await load();
      onChanged();
    } catch (e) { setErr(e.message); }
  };

  const handleDelete = async (id) => {
    try { await api.deleteCustomerJobItem({ id, staffName }); await load(); onChanged(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Job Card Items</span>
        {!adding && canEdit && <button type="button" onClick={() => setAdding(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>+ Add Item</button>}
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading items…</p>
      ) : items.length === 0 && !adding ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No items yet</p>
      ) : (
        <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden" }}>
          {items.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12.5, gap: 8 }}>
              <span style={{ flex: 1 }}>{item.itemName}{item.partId && <span title="From stock" style={{ marginLeft: 5, fontSize: 10, color: "var(--sc-blue)" }}>📦</span>}</span>
              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{item.quantity} × {fmtMoney(item.unitCost)}</span>
              <span style={{ fontWeight: 700, flexShrink: 0, minWidth: 70, textAlign: "right" }}>{fmtMoney(item.lineTotal)}</span>
              {canEdit && (
                <button type="button" onClick={() => handleDelete(item.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, padding: "0 2px", flexShrink: 0 }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ border: "1.5px solid var(--sc-blue)", borderRadius: 8, padding: 10, marginTop: items.length > 0 ? 0 : 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[["stock","From Stock"],["free","Free Text"]].map(([val,lab]) => (
              <button key={val} type="button"
                onClick={() => { setFromStock(val==="stock"); setSelectedPartId(""); setNewItem({ itemName:"", quantity:"1", unitCost:"" }); setErr(""); }}
                style={{ flex:1, padding:"6px 0", fontSize:11.5, fontWeight:600, borderRadius:6, cursor:"pointer", fontFamily:"inherit",
                  border:`1.5px solid ${(val==="stock")===fromStock ? "var(--sc-blue)" : "var(--border)"}`,
                  background: (val==="stock")===fromStock ? "var(--blue-bg)" : "var(--surface)",
                  color: (val==="stock")===fromStock ? "var(--sc-blue)" : "var(--text-muted)" }}>
                {lab}
              </button>
            ))}
          </div>
          {fromStock ? (
            <select style={{ ...S.input, marginBottom: 6 }} value={selectedPartId} onChange={e => selectPart(e.target.value)}>
              <option value="">Select a part…</option>
              {parts.map(p => <option key={p.id} value={p.id} disabled={p.quantityOnHand <= 0}>{p.name} — {p.quantityOnHand} in stock{p.quantityOnHand <= 0 ? " (out of stock)" : ""}</option>)}
            </select>
          ) : (
            <input style={{ ...S.input, marginBottom: 6 }} placeholder="Item name" value={newItem.itemName} onChange={e => setNewItem(n => ({ ...n, itemName: e.target.value }))} autoFocus />
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...S.input, width: 70 }} type="number" min="0" placeholder="Qty" value={newItem.quantity} onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))} />
            <input style={{ ...S.input, flex: 1 }} type="number" min="0" placeholder="Unit cost (TZS)" value={newItem.unitCost} disabled={fromStock && !!selectedPart} onChange={e => setNewItem(n => ({ ...n, unitCost: e.target.value }))} />
          </div>
          {err && <p style={S.err}>{err}</p>}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 12 }} onClick={() => { setAdding(false); setErr(""); setSelectedPartId(""); }}>Cancel</button>
            <button type="button" style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer" }} onClick={handleAdd}>Add</button>
          </div>
        </div>
      )}

      {(items.length > 0 || totalCost > 0) && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 2px 0", fontSize: 13, fontWeight: 700 }}>
          <span>Our Cost</span>
          <span style={{ color: "var(--sc-blue)" }}>TZS {fmtMoney(totalCost)}</span>
        </div>
      )}
    </div>
  );
}

function UpdatesTimeline({ jobId, staffName, canEdit }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, [jobId]);

  async function load() {
    setLoading(true);
    try { const res = await api.getCustomerJobUpdates(jobId); setUpdates(res?.data || []); }
    finally { setLoading(false); }
  }

  const handleAdd = async () => {
    if (!message.trim()) { setErr("Update can't be empty."); return; }
    setSaving(true); setErr("");
    try {
      await api.addCustomerJobUpdate({ jobId, author: staffName, message });
      setMessage(""); setAdding(false); await load();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Notes / Updates</span>
        {!adding && canEdit && <button type="button" onClick={() => setAdding(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>+ Add Update</button>}
      </div>
      {adding && (
        <div style={{ border: "1.5px solid var(--sc-blue)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <textarea style={S.textarea} rows={2} placeholder="What's new on this job…" value={message} onChange={e => setMessage(e.target.value)} autoFocus />
          {err && <p style={S.err}>{err}</p>}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 12 }} onClick={() => { setAdding(false); setMessage(""); setErr(""); }}>Cancel</button>
            <button type="button" disabled={saving} style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.65 : 1 }} onClick={handleAdd}>
              {saving ? "Posting…" : "Post Update"}
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading updates…</p>
      ) : updates.length === 0 && !adding ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic", margin: 0 }}>No updates yet</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {updates.map(u => (
            <div key={u.id} style={{ borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
              <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{u.message}</p>
              <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "3px 0 0" }}>{u.author ? `${u.author} · ` : ""}{fmtDateTime(u.createdAt)}</p>
            </div>
          ))}
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
