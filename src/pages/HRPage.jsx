import { useState, useEffect } from "react";
import { api } from "../lib/api";

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modalStyle = { background: "#fff", borderRadius: 12, padding: 20, maxHeight: "85vh", overflowY: "auto" };
const inputStyle = (editable) => ({ width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box", background: editable ? "#fff" : "#f9fafb" });
const labelStyle = { fontSize: 11, color: "#888" };
const primaryBtnStyle = { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 7, cursor: "pointer" };
const secondaryBtnStyle = { padding: "8px 16px", fontSize: 13, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 7, cursor: "pointer" };
const closeBtnStyle = { background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#888" };
const sectionHeaderStyle = { fontSize: 12.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", color: "#555", margin: 0 };
const hrStyle = { border: "none", borderTop: "1px solid #eee", margin: "16px 0 12px" };
const LEAVE_TYPES = ["Annual", "Sick", "Unpaid", "Compassionate"];
const DISCIPLINARY_TYPES = ["Verbal", "Written", "Suspension", "Other"];
const ANNUAL_LEAVE_DAYS = 28;

const STATUS_STYLE = {
  "Pending HR":      { bg: "#fef3c7", fg: "#92400e" },
  "Pending COO":     { bg: "#dbeafe", fg: "#1e40af" },
  "Approved":        { bg: "#dcfce7", fg: "#166534" },
  "Rejected by HR":  { bg: "#fee2e2", fg: "#991b1b" },
  "Rejected by COO": { bg: "#fee2e2", fg: "#991b1b" },
  "Cancelled":       { bg: "#f3f4f6", fg: "#6b7280" },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Cancelled"];
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{status}</span>;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
// Same rule as MyHRPage — only approved Annual leave draws down the 28-day
// calendar-year allowance.
function calcLeaveBalance(requests) {
  const year = new Date().getFullYear();
  const used = requests
    .filter(r => r.leaveType === "Annual" && r.status === "Approved" && new Date(r.startDate).getFullYear() === year)
    .reduce((sum, r) => sum + (r.daysRequested || 0), 0);
  return { total: ANNUAL_LEAVE_DAYS, used, remaining: ANNUAL_LEAVE_DAYS - used };
}

function TabButton({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: "8px 4px", marginRight: 16, fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer",
        color: active ? "var(--sc-blue, #04519B)" : "#888", borderBottom: active ? "2px solid var(--sc-blue, #04519B)" : "2px solid transparent" }}>
      {children}
    </button>
  );
}

// Reusable staff-picker grid, same visual pattern as the Drivers page —
// used by both the Profiles and Onboarding tabs.
function StaffCardGrid({ staff, onSelect, renderBadge }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
      {staff.map(s => (
        <button key={s.name} type="button" onClick={() => onSelect(s)} style={{
          background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", cursor: "pointer",
          textAlign: "left", width: "100%", fontFamily: "inherit", appearance: "none", WebkitAppearance: "none", opacity: s.active ? 1 : 0.55,
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{s.name}{!s.active && <span style={{ color: "#aaa", fontWeight: 500 }}> (inactive)</span>}</p>
          <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>{s.role}</p>
          {renderBadge && renderBadge(s)}
        </button>
      ))}
    </div>
  );
}

function AddDisciplinaryForm({ staffName, targetName, onClose, onSaved }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState("Verbal");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setSaving(true); setErr("");
    try {
      await api.addDisciplinaryRecord({ staffName, targetStaffName: targetName, date, type, description });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: 10, marginTop: 8, background: "#fafafa" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={labelStyle}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle(true)} /></div>
        <div>
          <label style={labelStyle}>Type</label>
          <select value={type} onChange={e => setType(e.target.value)} style={inputStyle(true)}>
            {DISCIPLINARY_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <label style={labelStyle}>Description</label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle(true), minHeight: 44 }} />
      {err && <p style={{ color: "#dc2626", fontSize: 11.5, margin: "6px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" disabled={saving} onClick={submit} style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : "Add Record"}</button>
        <button type="button" onClick={onClose} style={{ ...secondaryBtnStyle, padding: "6px 12px", fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}

// HR/COO recording an absence directly — the staff member didn't submit a
// request. Goes straight to Approved on the backend, no 2-day-notice rule.
function AddLeaveOnBehalfForm({ staffName, targetName, onClose, onSaved }) {
  const [leaveType, setLeaveType] = useState("Unpaid");
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setSaving(true); setErr("");
    try {
      await api.addLeaveOnBehalf({ staffName, targetStaffName: targetName, leaveType, startDate, endDate, reason });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: 10, marginTop: 8, background: "#fafafa" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>Leave Type</label>
          <select value={leaveType} onChange={e => setLeaveType(e.target.value)} style={inputStyle(true)}>
            {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div />
        <div><label style={labelStyle}>Start Date</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle(true)} /></div>
        <div><label style={labelStyle}>End Date</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle(true)} /></div>
      </div>
      <label style={labelStyle}>Reason</label>
      <textarea value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle(true), minHeight: 44 }} />
      <p style={{ fontSize: 10.5, color: "#aaa", margin: "4px 0 0" }}>Marks this as approved immediately, recorded by you — for a staff member who didn't submit a request.</p>
      {err && <p style={{ color: "#dc2626", fontSize: 11.5, margin: "6px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" disabled={saving} onClick={submit} style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : "Log Leave"}</button>
        <button type="button" onClick={onClose} style={{ ...secondaryBtnStyle, padding: "6px 12px", fontSize: 12 }}>Cancel</button>
      </div>
    </div>
  );
}

// Combines what used to be three separate staff-list tabs (Profile,
// Disciplinary, Leave) into one per-person view, reached by clicking a
// card — per Ramzanali's redesign.
function StaffDetailModal({ staffName, target, editable, onClose }) {
  const [profile, setProfile] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState(null);
  const [disciplinary, setDisciplinary] = useState(null);
  const [showAddLeave, setShowAddLeave] = useState(false);
  const [showAddDisc, setShowAddDisc] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const loadProfile = () => api.getHRStaffProfile(staffName, target.name).then(res => setProfile(res.data)).catch(e => setErr(e.message));
  const loadLeave = () => api.getHRLeaveRequests(staffName).then(res => setLeaveRequests((res.data || []).filter(r => r.staffName === target.name))).catch(() => setLeaveRequests([]));
  const loadDisc = () => api.getHRDisciplinaryRecords(staffName, target.name).then(res => setDisciplinary(res.data || [])).catch(() => setDisciplinary([]));

  useEffect(() => { loadProfile(); loadLeave(); loadDisc(); setEditingProfile(false); }, [target.name]);

  const setField = (k, v) => setProfile(p => ({ ...p, [k]: v }));
  const saveProfile = async () => {
    setSaving(true); setErr("");
    try {
      await Promise.all([
        api.saveHRStaffProfile({
          staffName, targetStaffName: target.name, nationalId: profile.nationalId, contractType: profile.contractType,
          startDate: profile.startDate, nextOfKinName: profile.nextOfKinName, nextOfKinRelationship: profile.nextOfKinRelationship,
          nextOfKinPhone: profile.nextOfKinPhone, notes: profile.notes,
        }),
        api.setStaffPhone({ staffName, name: target.name, phone: profile.phone }),
      ]);
      setEditingProfile(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };
  const cancelEdit = () => { loadProfile(); setEditingProfile(false); setErr(""); };

  const field = (label, key, type = "text") => (
    <div style={{ marginBottom: 8 }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} disabled={!editable} value={profile[key] || ""} onChange={e => setField(key, e.target.value)} style={inputStyle(editable)} />
    </div>
  );
  const viewRow = (label, value) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 0", borderBottom: "1px solid #f5f5f5" }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );

  const balance = leaveRequests ? calcLeaveBalance(leaveRequests) : null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{target.name}</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <p style={{ fontSize: 11.5, color: "#888", margin: "0 0 14px" }}>{target.role}</p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={sectionHeaderStyle}>Profile</p>
          {editable && profile && !editingProfile && (
            <button type="button" onClick={() => setEditingProfile(true)}
              style={{ fontSize: 11, fontWeight: 700, color: "var(--sc-blue, #04519B)", background: "var(--blue-bg, #eaf2fb)", border: "none", borderRadius: 999, padding: "3px 12px", cursor: "pointer" }}>
              Edit
            </button>
          )}
        </div>
        {!profile ? <p style={{ fontSize: 12.5, color: "#888", marginTop: 6 }}>Loading…</p> : !editingProfile ? (
          <div style={{ marginTop: 8 }}>
            {viewRow("Phone", profile.phone)}
            {viewRow("National ID", profile.nationalId)}
            {viewRow("Contract Type", profile.contractType)}
            {viewRow("Start Date", fmtDate(profile.startDate))}
            {viewRow("Next of Kin Name", profile.nextOfKinName)}
            {viewRow("Next of Kin Relationship", profile.nextOfKinRelationship)}
            {viewRow("Next of Kin Phone", profile.nextOfKinPhone)}
            {profile.notes && <p style={{ fontSize: 12, color: "#555", margin: "8px 0 0" }}>{profile.notes}</p>}
          </div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {field("Phone", "phone")}
            {field("National ID", "nationalId")}
            {field("Contract Type", "contractType")}
            {field("Start Date", "startDate", "date")}
            {field("Next of Kin Name", "nextOfKinName")}
            {field("Next of Kin Relationship", "nextOfKinRelationship")}
            {field("Next of Kin Phone", "nextOfKinPhone")}
            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>Notes</label>
              <textarea disabled={!editable} value={profile.notes || ""} onChange={e => setField("notes", e.target.value)} style={{ ...inputStyle(editable), minHeight: 44 }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={saveProfile} disabled={saving} style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : "Save"}</button>
              <button type="button" onClick={cancelEdit} disabled={saving} style={{ ...secondaryBtnStyle, padding: "6px 12px", fontSize: 12 }}>Cancel</button>
            </div>
          </div>
        )}

        <hr style={hrStyle} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={sectionHeaderStyle}>Leave{balance ? ` — ${balance.remaining}/${balance.total} days remaining` : ""}</p>
          {editable && !showAddLeave && (
            <button type="button" onClick={() => setShowAddLeave(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue, #04519B)", background: "none", border: "none", cursor: "pointer" }}>
              + Log Leave
            </button>
          )}
        </div>
        {showAddLeave && <AddLeaveOnBehalfForm staffName={staffName} targetName={target.name} onClose={() => setShowAddLeave(false)} onSaved={() => { setShowAddLeave(false); loadLeave(); }} />}
        <div style={{ marginTop: 8 }}>
          {leaveRequests === null ? <p style={{ fontSize: 12.5, color: "#888" }}>Loading…</p> : leaveRequests.length === 0 ? <p style={{ fontSize: 12.5, color: "#888" }}>No leave on file.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {leaveRequests.map(r => (
                <div key={r.id} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{r.leaveType} — {fmtDate(r.startDate)} to {fmtDate(r.endDate)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div style={{ fontSize: 10.5, color: "#888" }}>{r.daysRequested} day{r.daysRequested === 1 ? "" : "s"}{r.addedBy ? ` · recorded by ${r.addedBy}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <hr style={hrStyle} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={sectionHeaderStyle}>Disciplinary</p>
          {editable && !showAddDisc && (
            <button type="button" onClick={() => setShowAddDisc(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue, #04519B)", background: "none", border: "none", cursor: "pointer" }}>
              + Add Record
            </button>
          )}
        </div>
        {showAddDisc && <AddDisciplinaryForm staffName={staffName} targetName={target.name} onClose={() => setShowAddDisc(false)} onSaved={() => { setShowAddDisc(false); loadDisc(); }} />}
        <div style={{ marginTop: 8 }}>
          {disciplinary === null ? <p style={{ fontSize: 12.5, color: "#888" }}>Loading…</p> : disciplinary.length === 0 ? <p style={{ fontSize: 12.5, color: "#888" }}>Nothing on file.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {disciplinary.map(d => (
                <div key={d.id} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{d.type}</span>
                    <span style={{ fontSize: 11, color: "#888" }}>{fmtDate(d.date)}</span>
                  </div>
                  {d.description && <p style={{ fontSize: 11.5, color: "#555", margin: "4px 0 0" }}>{d.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "12px 0 0" }}>{err}</p>}
      </div>
    </div>
  );
}

function ProfilesTab({ staffName, editable }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null);

  useEffect(() => {
    api.getHRStaffList(staffName).then(res => setStaff(res.staff || [])).catch(() => {}).finally(() => setLoading(false));
  }, [staffName]);

  if (loading) return <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>;

  return (
    <div>
      {staff.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>No Dar es Salaam staff found.</p>
      ) : (
        <StaffCardGrid staff={staff} onSelect={setTarget} renderBadge={s => (
          <p style={{ fontSize: 11, color: s.hasProfile ? "#166534" : "#aaa", margin: "6px 0 0" }}>{s.hasProfile ? "Profile on file" : "Not started"}</p>
        )} />
      )}
      {target && <StaffDetailModal staffName={staffName} target={target} editable={editable} onClose={() => setTarget(null)} />}
    </div>
  );
}

function LeaveRequestsTab({ staffName, canReviewHR, isCoo }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});

  const canDelete = canReviewHR || isCoo;

  const load = () => {
    setLoading(true);
    api.getHRLeaveRequests(staffName).then(res => setRequests(res.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [staffName]);

  const decide = async (id, stage, decision) => {
    setBusyId(id);
    try {
      const notes = notesDraft[id] || "";
      if (stage === "HR") await api.reviewLeaveRequestHR({ staffName, requestId: id, decision, notes });
      else await api.reviewLeaveRequestCOO({ staffName, requestId: id, decision, notes });
      load();
    } catch (e) { alert(e.message); }
    finally { setBusyId(null); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this leave request permanently? This cannot be undone.")) return;
    setBusyId(id);
    try { await api.deleteLeaveRequest({ staffName, requestId: id }); load(); }
    catch (e) { alert(e.message); }
    finally { setBusyId(null); }
  };

  if (loading) return <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>;
  if (requests.length === 0) return <p style={{ fontSize: 13, color: "#888" }}>No leave requests yet.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {requests.map(r => {
        const canActHR = canReviewHR && r.status === "Pending HR";
        const canActCoo = isCoo && r.status === "Pending COO";
        return (
          <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.staffName} — {r.leaveType}</div>
                <div style={{ fontSize: 11.5, color: "#888" }}>{fmtDate(r.startDate)} to {fmtDate(r.endDate)} · {r.daysRequested} day{r.daysRequested === 1 ? "" : "s"}</div>
                {r.reason && <div style={{ fontSize: 11.5, color: "#888", marginTop: 2 }}>{r.reason}</div>}
                {r.addedBy && <div style={{ fontSize: 10.5, color: "#aaa", marginTop: 2 }}>Recorded by {r.addedBy}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <StatusBadge status={r.status} />
                {canDelete && (
                  <button type="button" disabled={busyId === r.id} onClick={() => remove(r.id)} title="Delete this request permanently"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 13, padding: 0 }}>
                    🗑
                  </button>
                )}
              </div>
            </div>
            {r.hrReviewedBy && <p style={{ fontSize: 11, color: "#888", margin: "6px 0 0" }}>HR: {r.hrReviewedBy}{r.hrNotes ? ` — ${r.hrNotes}` : ""}</p>}
            {r.cooReviewedBy && <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>COO: {r.cooReviewedBy}{r.cooNotes ? ` — ${r.cooNotes}` : ""}</p>}
            {r.status === "Cancelled" && r.cancelledBy && <p style={{ fontSize: 11, color: "#aaa", margin: "2px 0 0" }}>Revoked by {r.cancelledBy}</p>}
            {(canActHR || canActCoo) && (
              <div style={{ marginTop: 8 }}>
                <input placeholder="Optional note" value={notesDraft[r.id] || ""} onChange={e => setNotesDraft(d => ({ ...d, [r.id]: e.target.value }))}
                  style={{ width: "100%", padding: "6px 9px", fontSize: 12, border: "1.5px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 6 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" disabled={busyId === r.id} onClick={() => decide(r.id, canActHR ? "HR" : "COO", "Approve")}
                    style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, background: "#16a34a" }}>Approve</button>
                  <button type="button" disabled={busyId === r.id} onClick={() => decide(r.id, canActHR ? "HR" : "COO", "Reject")}
                    style={{ ...primaryBtnStyle, padding: "6px 12px", fontSize: 12, background: "#dc2626" }}>Reject</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OnboardingModal({ staffName, target, editable, onClose }) {
  const [items, setItems] = useState(null);
  const [newItem, setNewItem] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    await api.seedOnboardingChecklist({ staffName, targetStaffName: target.name }).catch(() => {});
    const res = await api.getOnboardingChecklist(staffName, target.name).catch(() => ({ data: [] }));
    setItems(res.data || []);
  };
  useEffect(() => { load(); }, [target.name]);

  const toggle = async (item) => {
    setBusyId(item.id);
    try { await api.toggleOnboardingItem({ staffName, itemId: item.id, completed: !item.completed }); await load(); }
    catch (e) { alert(e.message); }
    finally { setBusyId(null); }
  };
  const addItem = async () => {
    if (!newItem.trim()) return;
    setAdding(true);
    try { await api.addOnboardingItem({ staffName, targetStaffName: target.name, item: newItem.trim() }); setNewItem(""); await load(); }
    catch (e) { alert(e.message); }
    finally { setAdding(false); }
  };
  const removeItem = async (id) => {
    if (!window.confirm("Remove this checklist item?")) return;
    try { await api.deleteOnboardingItem({ staffName, itemId: id }); await load(); }
    catch (e) { alert(e.message); }
  };

  const doneCount = items ? items.filter(i => i.completed).length : 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{target.name} — Onboarding</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        {items === null ? (
          <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>
        ) : (
          <>
            <p style={{ fontSize: 11.5, color: "#888", margin: "0 0 12px" }}>{doneCount} of {items.length} complete</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map(item => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <input type="checkbox" checked={item.completed} disabled={!editable || busyId === item.id} onChange={() => toggle(item)} />
                  <span style={{ fontSize: 13, flex: 1, textDecoration: item.completed ? "line-through" : "none", color: item.completed ? "#aaa" : "#222" }}>{item.item}</span>
                  {item.completed && <span style={{ fontSize: 10.5, color: "#aaa" }}>{item.completedBy}</span>}
                  {editable && <button type="button" onClick={() => removeItem(item.id)} style={{ ...closeBtnStyle, fontSize: 12 }}>✕</button>}
                </div>
              ))}
            </div>
            {editable && (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add a checklist item"
                  style={{ ...inputStyle(true), flex: 1 }} onKeyDown={e => e.key === "Enter" && addItem()} />
                <button type="button" disabled={adding} onClick={addItem} style={{ ...primaryBtnStyle, padding: "8px 12px" }}>+</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OnboardingTab({ staffName, editable }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null);

  useEffect(() => {
    api.getHRStaffList(staffName).then(res => setStaff(res.staff || [])).catch(() => {}).finally(() => setLoading(false));
  }, [staffName]);

  if (loading) return <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>;

  return (
    <div>
      {staff.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>No Dar es Salaam staff found.</p>
      ) : (
        <StaffCardGrid staff={staff} onSelect={setTarget} />
      )}
      {target && <OnboardingModal staffName={staffName} target={target} editable={editable} onClose={() => setTarget(null)} />}
    </div>
  );
}

export default function HRPage({ staffName, role }) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(role === "Admin" ? "Edit" : "None");
  const [isCoo, setIsCoo] = useState(role === "Admin");
  const [tab, setTab] = useState("profiles");

  useEffect(() => {
    if (role === "Admin") { setLoading(false); return; }
    api.getStaffList().then(res => {
      const me = (res.staff || []).find(s => s.name.trim().toLowerCase() === staffName.trim().toLowerCase());
      const a = me?.hrAccess || "None";
      setAccess(a);
      setIsCoo(!!me?.isCoo);
      setTab(a !== "None" ? "profiles" : "leave");
    }).catch(() => setAccess("None")).finally(() => setLoading(false));
  }, [staffName, role]);

  if (loading) return <div style={{ padding: 24, fontSize: 13, color: "#888" }}>Loading…</div>;

  const canSeeProfiles = access !== "None";
  const canSeeLeave = access !== "None" || isCoo;

  if (!canSeeProfiles && !canSeeLeave) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>HR Management</h2>
        <p style={{ fontSize: 13, color: "#888" }}>You don't have access to the HR module.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>HR Management</h2>
      {access === "View" && <p style={{ fontSize: 11.5, color: "#888", margin: "0 0 14px" }}>View-only access.</p>}
      <div style={{ display: "flex", marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        {canSeeProfiles && <TabButton active={tab === "profiles"} onClick={() => setTab("profiles")}>Profiles</TabButton>}
        {canSeeLeave && <TabButton active={tab === "leave"} onClick={() => setTab("leave")}>Leave Requests</TabButton>}
        {canSeeProfiles && <TabButton active={tab === "onboarding"} onClick={() => setTab("onboarding")}>Onboarding</TabButton>}
      </div>
      {tab === "profiles" && canSeeProfiles && <ProfilesTab staffName={staffName} editable={access === "Edit"} />}
      {tab === "leave" && canSeeLeave && <LeaveRequestsTab staffName={staffName} canReviewHR={access === "Edit"} isCoo={isCoo} />}
      {tab === "onboarding" && canSeeProfiles && <OnboardingTab staffName={staffName} editable={access === "Edit"} />}
    </div>
  );
}
