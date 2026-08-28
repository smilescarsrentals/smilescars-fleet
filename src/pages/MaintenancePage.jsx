import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import { AddGarageInline, cityForCarLocation, GARAGE_CITIES } from "../components/ActionModal";

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

export default function MaintenancePage({ staffName, role, embedded }) {
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
    <div style={{ padding: embedded ? "1rem 1.5rem 1.5rem" : "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          {!embedded && <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Maintenance</h1>}
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: embedded ? 0 : "2px 0 0" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {STATUSES.map(status => (
            <div key={status} style={{
              minWidth: 0, background: "var(--bg)", border: "1.5px solid var(--border)",
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
          role={role}
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
  const isExternal = log.serviceLocationType === "External";
  return (
    <div onClick={onClick} style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderLeft: `3px solid ${STATUS_COLORS[log.status]}`,
      borderRadius: 8, padding: "9px 10px", boxShadow: "var(--shadow-sm)", cursor: "pointer",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{log.plate}</span>
        <span style={{ fontSize: 9.5, color: "var(--text-faint)", wordBreak: "break-all", textAlign: "right" }}>{log.refNo || log.id}</span>
      </div>
      {isExternal && <span style={{ fontSize: 10, fontWeight: 700, color: "#8b5cf6" }}>🏢 External</span>}
      {log.issueDescription && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.4 }}>{log.issueDescription}</p>
      )}
      {!isExternal && <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "5px 0 0" }}>🔧 {log.assignedMechanic || "—"}</p>}
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
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({
    assignedMechanic: log.assignedMechanic, issueDescription: log.issueDescription,
    odometer: log.odometer, notes: log.notes,
    flatCost: log.flatCost != null ? String(log.flatCost) : "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isExternal = log.serviceLocationType === "External";

  useEffect(() => {
    if (isExternal) api.getVendors().then(res => setVendors(res?.data || [])).catch(() => {});
  }, [isExternal]);

  const vendorName = vendors.find(v => v.id === log.externalVendorId)?.name || (isExternal ? "—" : "");

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
    const payload = { ...form, flatCost: form.flatCost === "" ? null : Number(form.flatCost) };
    try {
      await api.editMaintenanceLog({ id: log.id, ...payload, staffName });
      onUpdated();
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const rows = [
    ["Ref No.", log.refNo || "—"],
    ["Plate", log.plate],
    ["Service Location", isExternal ? `External — ${vendorName}` : `Internal — ${log.internalLocation || "—"}`],
    ["Assigned Mechanic", log.assignedMechanic || "—"],
    ["Odometer", log.odometer ? fmtOdometer(log.odometer) : "—"],
    ["Issue Description", log.issueDescription || "—"],
    ...(log.flatCost != null ? [["Flat Job Cost", `TZS ${fmtMoney(log.flatCost)}`]] : []),
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
              {isExternal && (
                <div style={S.field}><label style={S.label}>Flat Job Cost (TZS) <span style={{ color:"var(--text-faint)",fontWeight:400 }}>(leave blank to use itemized parts total instead)</span></label>
                  <input style={S.input} type="number" min="0" value={form.flatCost} onChange={e => set("flatCost", e.target.value)} placeholder="e.g. 150000" /></div>
              )}
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
          staffName={staffName}
          onClose={() => setShowMarkAvailable(false)}
          onDone={() => { setShowMarkAvailable(false); onUpdated(); onClose(); }}
        />
      )}
    </div>
  );
}

// Stub for now — asks which location the car is being marked Available at,
// but does NOT yet write to Fleet. The real car-status/location update is
// Phase 2c, built once the Fleet-sync edge cases (active reservations,
// concurrent work orders) have been thought through properly.
function MarkAvailableModal({ log, staffName, onClose, onDone }) {
  const [locations, setLocations] = useState([]);
  const [outcome, setOutcome] = useState(""); // "client" | "available"
  const [location, setLocation] = useState("");
  const [currentKm, setCurrentKm] = useState("");
  const [carClient, setCarClient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([api.getConfig(), api.getFleet()]).then(([configRes, fleetRes]) => {
      setLocations(configRes?.locations || []);
      const car = (fleetRes?.data || []).find(c => c.plate === log.plate);
      setCarClient(car?.currentClient || "");
    }).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!currentKm.trim()) { setErr("Current KM is required."); return; }
    if (!outcome) { setErr("Select where this car is going."); return; }
    if (outcome === "available" && !location) { setErr("Select a location."); return; }
    setSaving(true); setErr("");
    try {
      await api.markCarAvailable({
        plate: log.plate, staffName, currentKm, outcome,
        location: outcome === "available" ? location : undefined,
        workOrderRef: log.refNo || log.id,
      });
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div style={{ ...S.overlay, zIndex: 110 }} onClick={onClose}>
      <div style={{ ...S.modal, width: 380 }} onClick={e => e.stopPropagation()}>
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
            <label style={S.label}>Where's this car going? *</label>
            {loading ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {carClient && (
                  <button type="button" onClick={() => setOutcome("client")}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      border: `1.5px solid ${outcome === "client" ? "var(--green)" : "var(--border)"}`,
                      background: outcome === "client" ? "var(--green-bg, #eafaf0)" : "var(--surface)" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: outcome === "client" ? "var(--green)" : "var(--text)" }}>Return to Client</span>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>
                      Back to <strong>{carClient}</strong> — was mid-rental, stays checked out
                    </p>
                  </button>
                )}
                <button type="button" onClick={() => setOutcome("available")}
                  style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${outcome === "available" ? "var(--sc-blue)" : "var(--border)"}`,
                    background: outcome === "available" ? "var(--blue-bg)" : "var(--surface)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: outcome === "available" ? "var(--sc-blue)" : "var(--text)" }}>Mark Available</span>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>Goes into the available pool at a location</p>
                </button>
              </div>
            )}
          </div>

          {outcome === "available" && (
            <div style={S.field}>
              <label style={S.label}>Location *</label>
              <select style={S.input} value={location} onChange={e => setLocation(e.target.value)}>
                <option value="">Select a location…</option>
                <option value="At Garage (Ready for Pickup)">At Garage (Ready for Pickup)</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--green)", opacity: saving ? 0.65 : 1 }} onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Confirm"}
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
  const [parts, setParts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [fromStock, setFromStock] = useState(true);
  const [selectedPartId, setSelectedPartId] = useState("");
  const [newItem, setNewItem] = useState({ itemName: "", quantity: "1", unitCost: "", supplierVendorId: "", supplierLocation: "" });
  const [err, setErr] = useState("");

  useEffect(() => { load(); }, [workOrderId]);

  async function load() {
    setLoading(true);
    try {
      const [itemsRes, partsRes, vendorsRes] = await Promise.all([api.getMaintenanceItems(workOrderId), api.getParts(), api.getVendors()]);
      setItems(itemsRes?.data || []);
      setParts((partsRes?.data || []).filter(p => p.active));
      setSuppliers((vendorsRes?.data || []).filter(v => v.active && (v.vendorType === "Parts Supplier" || v.vendorType === "Both")));
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
    if (fromStock && selectedPart && qty > selectedPart.quantityOnHand) {
      setErr(`Only ${selectedPart.quantityOnHand} in stock.`);
      return;
    }
    setErr("");
    try {
      await api.addMaintenanceItem({
        workOrderId, itemName: newItem.itemName,
        quantity: qty, unitCost: Number(newItem.unitCost) || 0, staffName,
        partId: fromStock && selectedPartId ? selectedPartId : undefined,
        supplierVendorId: !fromStock && newItem.supplierVendorId ? newItem.supplierVendorId : undefined,
        supplierLocation: !fromStock && newItem.supplierLocation ? newItem.supplierLocation : undefined,
      });
      setNewItem({ itemName: "", quantity: "1", unitCost: "", supplierVendorId: "", supplierLocation: "" });
      setSelectedPartId("");
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

  const supplierName = (id) => suppliers.find(s => s.id === id)?.name;

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
              <span style={{ flex: 1 }}>
                {item.itemName}
                {item.partId && <span title="From stock" style={{ marginLeft: 5, fontSize: 10, color: "var(--sc-blue)" }}>📦</span>}
                {item.supplierVendorId && supplierName(item.supplierVendorId) && (
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--text-faint)" }}>
                    {supplierName(item.supplierVendorId)}{item.supplierLocation ? ` — ${item.supplierLocation}` : ""}
                  </span>
                )}
              </span>
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
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[["stock","From Stock"],["free","From Supplier"]].map(([val,lab]) => (
              <button key={val} type="button"
                onClick={() => { setFromStock(val==="stock"); setSelectedPartId(""); setNewItem({ itemName:"", quantity:"1", unitCost:"", supplierVendorId:"", supplierLocation:"" }); setErr(""); }}
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
              {parts.map(p => (
                <option key={p.id} value={p.id} disabled={p.quantityOnHand <= 0}>
                  {p.name} — {p.quantityOnHand} in stock{p.quantityOnHand <= 0 ? " (out of stock)" : ""}
                </option>
              ))}
            </select>
          ) : (
            <>
              <SupplierPicker suppliers={suppliers} value={newItem.supplierVendorId} location={newItem.supplierLocation}
                onChange={(id, loc) => setNewItem(n => ({ ...n, supplierVendorId: id, supplierLocation: loc }))}
                onSupplierAdded={s => setSuppliers(list => [...list, s])} />
              <input style={{ ...S.input, marginTop: 6, marginBottom: 6 }} placeholder="Item (e.g. Brake pads)" value={newItem.itemName}
                onChange={e => setNewItem(n => ({ ...n, itemName: e.target.value }))} />
            </>
          )}

          {fromStock && selectedPart && selectedPart.quantityOnHand <= selectedPart.reorderThreshold && selectedPart.reorderThreshold > 0 && (
            <p style={{ fontSize: 11, color: "#d97706", margin: "0 0 6px" }}>⚠ Low stock — only {selectedPart.quantityOnHand} left</p>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...S.input, width: 70 }} type="number" min="0" placeholder="Qty" value={newItem.quantity}
              onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))} />
            <input style={{ ...S.input, flex: 1 }} type="number" min="0" placeholder="Unit cost (TZS)" value={newItem.unitCost}
              disabled={fromStock && !!selectedPart}
              onChange={e => setNewItem(n => ({ ...n, unitCost: e.target.value }))} />
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
          <span>Total</span>
          <span style={{ color: "var(--sc-blue)" }}>TZS {fmtMoney(totalCost)}</span>
        </div>
      )}
    </div>
  );
}

// ── Supplier picker ───────────────────────────────────────────
// Type-ahead search over real Suppliers (Vendors filtered to Parts
// Supplier/Both), with an inline "+ New Supplier" add if one isn't on the
// list yet. When the selected supplier has locations recorded (branches),
// a second dropdown appears showing ONLY that supplier's locations —
// nothing shows if the supplier has none. Shared by Job Card Items (both
// Maintenance and Customer Jobs) and Fleet's External garage picker.
export function SupplierPicker({ suppliers, value, location, onChange, onSupplierAdded }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = suppliers.find(s => s.id === value);
  const filtered = query.trim().length > 0
    ? suppliers.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : suppliers;

  const handleAddNew = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await api.addVendor({ name: newName.trim(), vendorType: "Parts Supplier" });
      const newSupplier = { id: res.id, name: newName.trim(), vendorType: "Parts Supplier", locationList: [] };
      onSupplierAdded(newSupplier);
      onChange(newSupplier.id, "");
      setNewName(""); setAddingNew(false); setQuery("");
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {!addingNew ? (
        <div style={{ position: "relative" }}>
          <input style={{ ...S.input, background: selected ? "var(--blue-bg)" : "var(--surface)" }}
            placeholder="Type to search suppliers…" autoComplete="off"
            value={selected ? selected.name : query}
            onChange={e => { setQuery(e.target.value); onChange("", ""); setOpen(true); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow)", zIndex: 50, maxHeight: 200, overflowY: "auto" }}>
              {filtered.slice(0, 20).map(s => (
                <div key={s.id} style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border-light)" }}
                  onMouseDown={() => { onChange(s.id, ""); setQuery(""); setOpen(false); }}>
                  {s.name}
                </div>
              ))}
              <div style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--sc-blue)" }}
                onMouseDown={() => { setAddingNew(true); setOpen(false); }}>
                + New Supplier
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="Supplier name" value={newName}
            onChange={e => setNewName(e.target.value)} autoFocus />
          <button type="button" disabled={saving} onClick={handleAddNew}
            style={{ padding: "0 12px", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.65 : 1 }}>
            {saving ? "…" : "Add"}
          </button>
          <button type="button" onClick={() => { setAddingNew(false); setNewName(""); }}
            style={{ padding: "0 10px", fontSize: 12, color: "var(--text-muted)", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>
            ✕
          </button>
        </div>
      )}

      {selected && selected.locationList && selected.locationList.length > 0 && (
        <select style={{ ...S.input, marginTop: 6 }} value={location || ""} onChange={e => onChange(value, e.target.value)}>
          <option value="">Select {selected.name}'s location…</option>
          {selected.locationList.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
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
function AddWorkOrderModal({ staffName, role, fleet, onClose, onSaved }) {
  const [form, setForm] = useState({
    plate: "", assignedMechanic: "", issueDescription: "", odometer: "", notes: "",
    serviceLocationType: "Internal", internalLocation: "SmilesCars Office", externalVendorId: "",
  });
  const [vendors, setVendors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isExternal = form.serviceLocationType === "External";

  useEffect(() => {
    api.getVendors().then(res => {
      const all = res?.data || [];
      setVendors(all.filter(v => v.active && (v.vendorType === "Service Provider" || v.vendorType === "Both")));
    }).catch(() => {});
  }, []);

  // Auto-select the selected car's own branch — same rule as
  // GarageLocationPicker: only overrides the OLD flat, city-less defaults,
  // never a value the user (or an earlier auto-select) already set a city on.
  useEffect(() => {
    if (!form.plate) return;
    if (form.internalLocation !== "SmilesCars Office" && form.internalLocation !== "SmilesCars Garage") return;
    const car = (fleet || []).find(c => c.plate === form.plate);
    if (!car) return;
    set("internalLocation", `${form.internalLocation} — ${cityForCarLocation(car.location)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.plate]);

  const handleSave = async () => {
    if (!form.plate.trim()) { setErr("Plate is required."); return; }
    if (!isExternal && !form.assignedMechanic.trim()) { setErr("Assigned mechanic is required."); return; }
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

          <div style={S.field}>
            <label style={S.label}>Service Location</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[["Internal","Internal (Own Mechanic)"],["External","External (Outside Garage)"]].map(([val,lab]) => (
                <button key={val} type="button" onClick={() => set("serviceLocationType", val)}
                  style={{ flex:1, padding:"8px 4px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer", fontFamily:"inherit",
                    border:`1.5px solid ${form.serviceLocationType===val ? "var(--sc-blue)" : "var(--border)"}`,
                    background: form.serviceLocationType===val ? "var(--blue-bg)" : "var(--surface)",
                    color: form.serviceLocationType===val ? "var(--sc-blue)" : "var(--text-muted)" }}>
                  {lab}
                </button>
              ))}
            </div>
          </div>

          {isExternal ? (
            <div style={S.field}><label style={S.label}>External Provider</label>
              <select style={S.input} value={form.externalVendorId} onChange={e => set("externalVendorId", e.target.value)}>
                <option value="">Select a vendor…</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {vendors.length === 0 && role !== "Admin" && (
                <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "4px 0 0" }}>
                  No Service Provider vendors yet — add one under Garage → Vendors.
                </p>
              )}
              <AddGarageInline role={role} staffName={staffName}
                onAdded={(v) => {
                  setVendors(vs => [...vs, { id: v.id, name: v.name }]);
                  set("externalVendorId", v.id);
                }} />
            </div>
          ) : (
            <div style={S.field}><label style={S.label}>Location</label>
              <select style={S.input} value={form.internalLocation} onChange={e => set("internalLocation", e.target.value)}>
                {GARAGE_CITIES.map(city => (
                  <optgroup key={city} label={city}>
                    <option value={`SmilesCars Office — ${city}`}>SmilesCars Office — {city}</option>
                    <option value={`SmilesCars Garage — ${city}`}>SmilesCars Garage — {city}</option>
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          <div style={S.field}><label style={S.label}>Assigned Mechanic{isExternal ? "" : " *"}</label>
            <input style={S.input} value={form.assignedMechanic} onChange={e => set("assignedMechanic", e.target.value)}
              placeholder={isExternal ? "Optional — if known" : "Mechanic's name"} /></div>
          <div style={S.field}><label style={S.label}>Odometer</label>
            <input style={S.input} value={form.odometer} placeholder="e.g. 84,200"
              onChange={e => set("odometer", e.target.value)}
              onBlur={e => set("odometer", fmtOdometer(e.target.value))} /></div>
          <div style={S.field}><label style={S.label}>Issue Description</label>
            <textarea style={S.textarea} rows={3} value={form.issueDescription} onChange={e => set("issueDescription", e.target.value)} placeholder="What's wrong / what's being serviced…" /></div>
          <div style={S.field}><label style={S.label}>Notes</label>
            <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any additional notes…" /></div>

          <p style={{ fontSize: 11.5, color: "var(--text-faint)", margin: "0 0 8px" }}>
            A reference number (e.g. SC/GAR/2026/08/0001) is generated automatically.
            {isExternal ? " You can set a flat job cost or add itemized parts once the work order is created." : " Job card items can be added once the work order is created."}
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
