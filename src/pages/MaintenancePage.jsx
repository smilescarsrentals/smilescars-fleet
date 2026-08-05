import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

const STATUSES = ["Queued", "In Progress", "Awaiting Parts", "Completed"];
const STATUS_COLORS = {
  "Queued":         "#3b82f6",
  "In Progress":    "#d97706",
  "Awaiting Parts": "#8b5cf6",
  "Completed":      "var(--green)",
};

// Explicit allowed transitions, rather than "move to any other status" —
// keeps the lifecycle meaningful (e.g. you can't skip Queued -> Completed
// by accident). Completed isn't a transition target here; it's handled by
// the separate "Mark Available" closing action.
const TRANSITIONS = {
  "Queued":         ["In Progress"],
  "In Progress":    ["Awaiting Parts", "Completed"],
  "Awaiting Parts": ["In Progress", "Completed"],
  "Completed":      [],
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
// Odometer is entered as free text but always displayed/stored consistently
// as "0,000 Km" — strips anything non-numeric, then reformats with commas.
function fmtOdometer(val) {
  const digits = String(val || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString() + " Km";
}

export default function MaintenancePage({ staffName, role }) {
  // Manager gets full visibility into Maintenance but can't touch anything —
  // this is Garage Manager's operational tool. Admin and Garage Manager can
  // both edit; Manager is the one role that's explicitly view-only here.
  const canEdit = role !== "Manager";
  const [logs,    setLogs]    = useState([]);
  const [fleet,   setFleet]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [search,      setSearch]      = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");

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

  // Search + status + date-range filter, applied before grouping into
  // columns. All three combine (AND), not either/or.
  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      if (q && !(l.plate.toLowerCase().includes(q) || (l.assignedMechanic||"").toLowerCase().includes(q) || (l.refNo||"").toLowerCase().includes(q))) return false;
      if (statusFilter && l.status !== statusFilter) return false;
      if (dateFrom && (!l.dateOpened || l.dateOpened.slice(0,10) < dateFrom)) return false;
      if (dateTo && (!l.dateOpened || l.dateOpened.slice(0,10) > dateTo)) return false;
      return true;
    });
  }, [logs, search, statusFilter, dateFrom, dateTo]);

  const byStatus = useMemo(() => {
    const map = {}; STATUSES.forEach(s => map[s] = []);
    filteredLogs.forEach(l => { if (map[l.status]) map[l.status].push(l); });
    return map;
  }, [filteredLogs]);

  // Cost summary — always computed off the FULL unfiltered log set, since
  // "this month's total spend" shouldn't silently change because someone
  // typed into the search box. Filtering affects the board, not the summary.
  const costSummary = useMemo(() => {
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    let monthTotal = 0, allTimeTotal = 0;
    const perCar = {};
    logs.forEach(l => {
      const cost = Number(l.totalCost) || 0;
      allTimeTotal += cost;
      if (l.dateOpened && l.dateOpened.slice(0,7) === thisMonthKey) monthTotal += cost;
      if (cost > 0) perCar[l.plate] = (perCar[l.plate] || 0) + cost;
    });
    const topCars = Object.entries(perCar)
      .sort((a,b) => b[1]-a[1])
      .slice(0,5)
      .map(([plate,total]) => ({ plate, total }));
    return { monthTotal, allTimeTotal, topCars };
  }, [logs]);

  // Phase 4 scheduling — only cars with a due threshold actually set show up
  // here. "Upcoming" is within 2,000km of the threshold; anything at or past
  // it is Overdue. Cars with no last_known_odometer recorded can't be judged
  // yet (no current reading to compare against).
  const dueSoon = useMemo(() => {
    return fleet
      .filter(c => c.nextServiceDueKm && c.lastKnownOdometer != null)
      .map(c => ({ ...c, kmRemaining: c.nextServiceDueKm - c.lastKnownOdometer }))
      .filter(c => c.kmRemaining <= 2000)
      .sort((a, b) => a.kmRemaining - b.kmRemaining);
  }, [fleet]);

  return (
    <div style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Maintenance</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 0" }}>
            {logs.length} work order{logs.length !== 1 ? "s" : ""} on file
          </p>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowSchedule(true)}>Set Odometer / Service Due</button>
            <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ New Work Order</button>
          </div>
        )}
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {!loading && logs.length > 0 && (
        <div style={{ marginBottom: 16, border: "1.5px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>This Month</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: "2px 0 0", color: "var(--sc-blue)" }}>TZS {fmtMoney(costSummary.monthTotal)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>All Time</p>
              <p style={{ fontSize: 20, fontWeight: 700, margin: "2px 0 0" }}>TZS {fmtMoney(costSummary.allTimeTotal)}</p>
            </div>
            {costSummary.topCars.length > 0 && (
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>Top 5 Most Expensive Cars</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 4 }}>
                  {costSummary.topCars.map(c => (
                    <span key={c.plate} style={{ fontSize: 12.5 }}>
                      <strong>{c.plate}</strong> <span style={{ color: "var(--text-muted)" }}>· TZS {fmtMoney(c.total)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && logs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
          <input type="text" placeholder="Search plate, mechanic, or ref no…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: "1 1 240px", padding: "8px 12px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit" }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "8px 10px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit" }}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From"
            style={{ padding: "8px 10px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit" }} />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To"
            style={{ padding: "8px 10px", fontSize: 13, border: "1.5px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontFamily: "inherit" }} />
          {(search || statusFilter || dateFrom || dateTo) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setStatusFilter(""); setDateFrom(""); setDateTo(""); }}>Clear</button>
          )}
        </div>
      )}

      {!loading && dueSoon.length > 0 && (
        <div style={{ marginBottom: 16, border: "1.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "var(--bg)", borderBottom: "1px solid var(--border-light)" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>⚠ Upcoming / Overdue Service</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {dueSoon.map(c => {
              const overdue = c.kmRemaining <= 0;
              return (
                <div key={c.plate} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 14px", borderBottom: "1px solid var(--border-light)",
                  background: overdue ? "var(--red-bg)" : "var(--surface)",
                }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{c.plate}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{c.type}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: overdue ? "var(--red)" : "#d97706" }}>
                      {overdue ? `Overdue by ${fmtOdometer(Math.abs(c.kmRemaining))}` : `Due in ${fmtOdometer(c.kmRemaining)}`}
                    </span>
                    <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "1px 0 0" }}>
                      Last known {fmtOdometer(c.lastKnownOdometer)} · due at {fmtOdometer(c.nextServiceDueKm)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                  <p style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center", padding: "1rem 0" }}>
                    {(search || statusFilter || dateFrom || dateTo) ? "No matches" : "No work orders"}
                  </p>
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
          staffName={staffName}
          canEdit={canEdit}
          onClose={() => setShowDetail(null)}
          onUpdated={load}
        />
      )}

      {showSchedule && (
        <ScheduleModal
          fleet={fleet}
          staffName={staffName}
          onClose={() => setShowSchedule(false)}
          onSaved={() => { setShowSchedule(false); load(); }}
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
function DetailModal({ log, staffName, canEdit, onClose, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [showMarkAvailable, setShowMarkAvailable] = useState(false);
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
      await api.editMaintenanceLog({ id: log.id, status: newStatus, staffName });
      onUpdated();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await api.editMaintenanceLog({ id: log.id, ...form, staffName });
      onUpdated();
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const rows = [
    ["Ref No.", log.refNo || "—"],
    ["Plate", log.plate],
    ["Assigned Mechanic", log.assignedMechanic || "—"],
    ["Odometer", log.odometer ? fmtOdometer(log.odometer) : "—"],
    ["Issue Description", log.issueDescription || "—"],
    ["Opened By", log.openedBy || "—"],
    ["Date Opened", fmtDateTime(log.dateOpened)],
    ...(log.status === "Completed" ? [["Date Closed", fmtDateTime(log.dateClosed)]] : []),
  ];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: STATUS_COLORS[log.status] }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={S.mTitle}>{log.plate}</p>
              {!editing && canEdit && (
                <button type="button" onClick={() => setEditing(true)}
                  style={{ fontSize: 10.5, fontWeight: 600, color: "#fff", background: "rgba(255,255,255,0.22)",
                    border: "1px solid rgba(255,255,255,0.4)", borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}>
                  Edit Details
                </button>
              )}
            </div>
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

              <JobCardItems workOrderId={log.id} totalCost={log.totalCost} canEdit={canEdit} staffName={staffName} onChanged={onUpdated} />

              <UpdatesTimeline workOrderId={log.id} staffName={staffName} canEdit={canEdit} />

              {err && <p style={S.err}>{err}</p>}

              {canEdit && (
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {log.status === "Completed" ? (
                    <button type="button" disabled={saving} onClick={() => setShowMarkAvailable(true)}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer", opacity: saving ? 0.6 : 1,
                        border: "1.5px solid var(--green)", background: "var(--surface)", color: "var(--green)" }}>
                      Mark Available
                    </button>
                  ) : (
                    TRANSITIONS[log.status].map(s => (
                      <button key={s} type="button" disabled={saving}
                        onClick={() => moveStatus(s)}
                        style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer", opacity: saving ? 0.6 : 1,
                          border: `1.5px solid ${STATUS_COLORS[s]}`, background: "var(--surface)", color: STATUS_COLORS[s] }}>
                        Move to {s}
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={S.field}><label style={S.label}>Assigned Mechanic</label>
                <input style={S.input} value={form.assignedMechanic} onChange={e => set("assignedMechanic", e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Odometer</label>
                <input style={S.input} value={form.odometer} placeholder="e.g. 84,200"
                  onChange={e => set("odometer", e.target.value)}
                  onBlur={e => set("odometer", fmtOdometer(e.target.value))} /></div>
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

      {showMarkAvailable && (
        <MarkAvailableModal
          log={log}
          onClose={() => setShowMarkAvailable(false)}
        />
      )}
    </div>
  );
}

// Stub for now — asks which location the car is being marked Available at,
// but does NOT yet write to Fleet. The real car-status/location update is
// Phase 2c, built once the Fleet-sync edge cases (active reservations,
// concurrent work orders) have been thought through properly.
function MarkAvailableModal({ log, onClose }) {
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState("");
  const [currentKm, setCurrentKm] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.getConfig().then(res => setLocations(res?.locations || [])).finally(() => setLoading(false));
  }, []);

  const handleClose = () => {
    // Nothing is saved yet — Mark Available is intentionally still a stub
    // (see note below) — this just validates the fields exist before
    // closing, so the form behaves like a real save even though it isn't one.
    if (!location) { setErr("Select a location."); return; }
    if (!currentKm.trim()) { setErr("Current KM is required."); return; }
    onClose();
  };

  return (
    <div style={{ ...S.overlay, zIndex: 110 }} onClick={onClose}>
      <div style={{ ...S.modal, width: 360 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--green)" }}>
          <p style={S.mTitle}>Mark {log.plate} Available</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}>
            <label style={S.label}>Current KM *</label>
            <input style={S.input} value={currentKm} placeholder="e.g. 84,200"
              onChange={e => setCurrentKm(e.target.value)}
              onBlur={e => setCurrentKm(fmtOdometer(e.target.value).replace(" Km", ""))} />
          </div>

          <div style={S.field}>
            <label style={S.label}>To which location? *</label>
            {loading ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading locations…</p>
            ) : (
              <select style={S.input} value={location} onChange={e => setLocation(e.target.value)}>
                <option value="">Select a location…</option>
                <option value="At Garage (Ready for Pickup)">At Garage (Ready for Pickup)</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
          </div>

          {err && <p style={S.err}>{err}</p>}
          <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "4px 0 10px" }}>
            This will be wired up to update the car's Fleet status and location shortly.
          </p>
          <button type="button" className="btn btn-ghost" style={{ width: "100%" }} onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job card line items ──────────────────────────────────────
// Item-level cost breakdown for a work order — this IS the cost of the job,
// there's no separate labor lump sum. Each add/edit/delete recomputes the
// parent work order's total_cost server-side.
function JobCardItems({ workOrderId, totalCost, canEdit, staffName, onChanged }) {
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
        quantity: Number(newItem.quantity) || 1, unitCost: Number(newItem.unitCost) || 0, staffName,
      });
      setNewItem({ itemName: "", quantity: "1", unitCost: "" });
      setAdding(false);
      await load();
      onChanged();
    } catch (e) { setErr(e.message); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteMaintenanceItem({ id, staffName });
      await load();
      onChanged();
    } catch (e) { setErr(e.message); }
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
              <span style={{ flex: 1 }}>{item.itemName}</span>
              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{item.quantity} × {fmtMoney(item.unitCost)}</span>
              <span style={{ fontWeight: 700, flexShrink: 0, minWidth: 70, textAlign: "right" }}>{fmtMoney(item.lineTotal)}</span>
              {canEdit && (
                <button type="button" onClick={() => handleDelete(item.id)}
                  style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, padding: "0 2px", flexShrink: 0 }}>✕</button>
              )}
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

// ── Updates timeline ──────────────────────────────────────────
// Running log of updates on a work order — newest first, never overwritten,
// so the full history of what was reported/decided stays visible.
function UpdatesTimeline({ workOrderId, staffName, canEdit }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, [workOrderId]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.getMaintenanceUpdates(workOrderId);
      setUpdates(res?.data || []);
    } finally {
      setLoading(false);
    }
  }

  const handleAdd = async () => {
    if (!message.trim()) { setErr("Update can't be empty."); return; }
    setSaving(true); setErr("");
    try {
      await api.addMaintenanceUpdate({ workOrderId, author: staffName, message });
      setMessage("");
      setAdding(false);
      await load();
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
          <textarea style={S.textarea} rows={2} placeholder="What's new on this job…" value={message}
            onChange={e => setMessage(e.target.value)} autoFocus />
          {err && <p style={S.err}>{err}</p>}
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 12 }} onClick={() => { setAdding(false); setMessage(""); setErr(""); }}>Cancel</button>
            <button type="button" disabled={saving}
              style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.65 : 1 }}
              onClick={handleAdd}>
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
              <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "3px 0 0" }}>
                {u.author ? `${u.author} · ` : ""}{fmtDateTime(u.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Set Odometer / Service Due Modal ─────────────────────────
// Picks a car, then lets Garage Manager record its current odometer and/or
// set the next service threshold. Both are manual — no auto-estimation.
function ScheduleModal({ fleet, staffName, onClose, onSaved }) {
  const [plate, setPlate] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [currentOdometer, setCurrentOdometer] = useState("");
  const [nextServiceDueKm, setNextServiceDueKm] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const filtered = query.trim().length > 0
    ? fleet.filter(c => c.plate.toLowerCase().replace(/\s/g, "").includes(query.toLowerCase().replace(/\s/g, "")))
    : [];

  const selectCar = (car) => {
    setPlate(car.plate); setQuery(car.plate); setOpen(false);
    setCurrentOdometer(car.lastKnownOdometer != null ? String(car.lastKnownOdometer) : "");
    setNextServiceDueKm(car.nextServiceDueKm != null ? String(car.nextServiceDueKm) : "");
  };

  const handleSave = async () => {
    if (!plate) { setErr("Select a car first."); return; }
    const body = { plate, staffName };
    if (currentOdometer !== "") body.currentOdometer = Number(currentOdometer.replace(/[^\d]/g, ""));
    if (nextServiceDueKm !== "") body.nextServiceDueKm = Number(nextServiceDueKm.replace(/[^\d]/g, ""));
    if (!body.currentOdometer && !body.nextServiceDueKm) { setErr("Enter at least one value."); return; }
    setSaving(true); setErr("");
    try {
      await api.setServiceSchedule(body);
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Set Odometer / Service Due</p>
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
                      onMouseDown={() => selectCar(c)}>
                      <span style={{ fontWeight: 600 }}>{c.plate}</span>
                      <span style={{ color: "var(--text-muted)", marginLeft: 6 }}>{c.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {plate && (
            <>
              <div style={S.field}><label style={S.label}>Current Odometer</label>
                <input style={S.input} value={currentOdometer} placeholder="e.g. 84,200"
                  onChange={e => setCurrentOdometer(e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Next Service Due (Km)</label>
                <input style={S.input} value={nextServiceDueKm} placeholder="e.g. 90,000"
                  onChange={e => setNextServiceDueKm(e.target.value)} /></div>
            </>
          )}

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
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
            <input style={S.input} value={form.odometer} placeholder="e.g. 84,200"
              onChange={e => set("odometer", e.target.value)}
              onBlur={e => set("odometer", fmtOdometer(e.target.value))} /></div>
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
