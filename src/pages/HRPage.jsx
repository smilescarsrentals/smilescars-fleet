import { useState, useEffect } from "react";
import { api } from "../lib/api";

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modalStyle = { background: "#fff", borderRadius: 12, padding: 20, maxHeight: "85vh", overflowY: "auto" };
const inputStyle = (editable) => ({ width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box", background: editable ? "#fff" : "#f9fafb" });
const labelStyle = { fontSize: 11, color: "#888" };
const primaryBtnStyle = { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 7, cursor: "pointer" };
const secondaryBtnStyle = { padding: "8px 16px", fontSize: 13, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 7, cursor: "pointer" };
const closeBtnStyle = { background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#888" };

const STATUS_STYLE = {
  "Pending HR":       { bg: "#fef3c7", fg: "#92400e" },
  "Pending COO":       { bg: "#dbeafe", fg: "#1e40af" },
  "Approved":          { bg: "#dcfce7", fg: "#166534" },
  "Rejected by HR":    { bg: "#fee2e2", fg: "#991b1b" },
  "Rejected by COO":   { bg: "#fee2e2", fg: "#991b1b" },
  "Cancelled":         { bg: "#f3f4f6", fg: "#6b7280" },
};
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Cancelled"];
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: s.bg, color: s.fg }}>{status}</span>;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function StaffProfileModal({ staffName, target, editable, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.getHRStaffProfile(staffName, target.name).then(res => setData(res.data)).catch(e => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.name]);

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await api.saveHRStaffProfile({
        staffName, targetStaffName: target.name, nationalId: data.nationalId, contractType: data.contractType,
        startDate: data.startDate, nextOfKinName: data.nextOfKinName, nextOfKinRelationship: data.nextOfKinRelationship,
        nextOfKinPhone: data.nextOfKinPhone, notes: data.notes,
      });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  if (!data) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...modalStyle, width: 320 }} onClick={e => e.stopPropagation()}>
          <p style={{ fontSize: 13, color: err ? "#dc2626" : "#888" }}>{err || "Loading…"}</p>
        </div>
      </div>
    );
  }

  const field = (label, key, type = "text") => (
    <div style={{ marginBottom: 10 }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} disabled={!editable} value={data[key] || ""} onChange={e => set(key, e.target.value)} style={inputStyle(editable)} />
    </div>
  );

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{target.name}</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        <p style={{ fontSize: 11.5, color: "#888", margin: "0 0 14px" }}>{target.role} · {target.phone || "no phone on file"}</p>
        {field("National ID", "nationalId")}
        {field("Contract Type", "contractType")}
        {field("Start Date", "startDate", "date")}
        {field("Next of Kin Name", "nextOfKinName")}
        {field("Next of Kin Relationship", "nextOfKinRelationship")}
        {field("Next of Kin Phone", "nextOfKinPhone")}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Notes</label>
          <textarea disabled={!editable} value={data.notes || ""} onChange={e => set("notes", e.target.value)}
            style={{ ...inputStyle(editable), minHeight: 50 }} />
        </div>
        {data.updatedBy && <p style={{ fontSize: 10.5, color: "#aaa", margin: "0 0 10px" }}>Last updated by {data.updatedBy}</p>}
        {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "0 0 8px" }}>{err}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          {editable && <button type="button" onClick={save} disabled={saving} style={{ ...primaryBtnStyle, opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : "Save"}</button>}
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>Close</button>
        </div>
      </div>
    </div>
  );
}

function StaffProfilesTab({ staffName, editable }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null);

  const load = () => {
    setLoading(true);
    api.getHRStaffList(staffName).then(res => setStaff(res.staff || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [staffName]);

  if (loading) return <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>;

  return (
    <div>
      {staff.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>No Dar es Salaam staff found.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {staff.map(s => (
            <button type="button" key={s.name} onClick={() => setTarget(s)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", padding: "10px 12px",
                border: "1px solid #e5e7eb", borderRadius: 9, background: "#fff", cursor: "pointer", opacity: s.active ? 1 : 0.55 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{s.role}{!s.active && " · Deactivated"}</div>
              </div>
              <span style={{ fontSize: 11, color: s.hasProfile ? "#166534" : "#aaa" }}>{s.hasProfile ? "Profile on file" : "Not started"}</span>
            </button>
          ))}
        </div>
      )}
      {target && (
        <StaffProfileModal staffName={staffName} target={target} editable={editable}
          onClose={() => setTarget(null)} onSaved={() => { setTarget(null); load(); }} />
      )}
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

const DISCIPLINARY_TYPES = ["Verbal", "Written", "Suspension", "Other"];

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
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: 12, marginTop: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle(true)} />
        </div>
        <div>
          <label style={labelStyle}>Type</label>
          <select value={type} onChange={e => setType(e.target.value)} style={inputStyle(true)}>
            {DISCIPLINARY_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <label style={labelStyle}>Description</label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle(true), minHeight: 50 }} />
      {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "6px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" disabled={saving} onClick={submit} style={{ ...primaryBtnStyle, opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : "Add Record"}</button>
        <button type="button" onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
      </div>
    </div>
  );
}

function DisciplinaryModal({ staffName, target, editable, onClose }) {
  const [records, setRecords] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    api.getHRDisciplinaryRecords(staffName, target.name).then(res => setRecords(res.data || [])).catch(() => setRecords([]));
  };
  useEffect(load, [target.name]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: 420 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{target.name} — Disciplinary Record</h3>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
        {records === null ? (
          <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>
        ) : records.length === 0 ? (
          <p style={{ fontSize: 13, color: "#888" }}>Nothing on file.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {records.map(d => (
              <div key={d.id} style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{d.type}</span>
                  <span style={{ fontSize: 11.5, color: "#888" }}>{fmtDate(d.date)}</span>
                </div>
                {d.description && <p style={{ fontSize: 12, color: "#555", margin: "4px 0 0" }}>{d.description}</p>}
                <p style={{ fontSize: 10.5, color: "#aaa", margin: "4px 0 0" }}>Issued by {d.issuedBy}</p>
              </div>
            ))}
          </div>
        )}
        {editable && !showAdd && (
          <button type="button" onClick={() => setShowAdd(true)} style={{ ...secondaryBtnStyle, marginTop: 10 }}>+ Add Record</button>
        )}
        {editable && showAdd && (
          <AddDisciplinaryForm staffName={staffName} targetName={target.name} onClose={() => setShowAdd(false)}
            onSaved={() => { setShowAdd(false); load(); }} />
        )}
      </div>
    </div>
  );
}

function DisciplinaryTab({ staffName, editable }) {
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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {staff.map(s => (
            <button type="button" key={s.name} onClick={() => setTarget(s)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", padding: "10px 12px",
                border: "1px solid #e5e7eb", borderRadius: 9, background: "#fff", cursor: "pointer", opacity: s.active ? 1 : 0.55 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{s.role}{!s.active && " · Deactivated"}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {target && <DisciplinaryModal staffName={staffName} target={target} editable={editable} onClose={() => setTarget(null)} />}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {staff.map(s => (
            <button type="button" key={s.name} onClick={() => setTarget(s)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", padding: "10px 12px",
                border: "1px solid #e5e7eb", borderRadius: 9, background: "#fff", cursor: "pointer", opacity: s.active ? 1 : 0.55 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{s.role}{!s.active && " · Deactivated"}</div>
              </div>
            </button>
          ))}
        </div>
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
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>HR</h2>
        <p style={{ fontSize: 13, color: "#888" }}>You don't have access to the HR module.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>HR</h2>
      {access === "View" && <p style={{ fontSize: 11.5, color: "#888", margin: "0 0 14px" }}>View-only access.</p>}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        {canSeeProfiles && (
          <button type="button" onClick={() => setTab("profiles")}
            style={{ padding: "8px 4px", marginRight: 12, fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer",
              color: tab === "profiles" ? "var(--sc-blue, #04519B)" : "#888", borderBottom: tab === "profiles" ? "2px solid var(--sc-blue, #04519B)" : "2px solid transparent" }}>
            Staff Profiles
          </button>
        )}
        {canSeeLeave && (
          <button type="button" onClick={() => setTab("leave")}
            style={{ padding: "8px 4px", marginRight: 12, fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer",
              color: tab === "leave" ? "var(--sc-blue, #04519B)" : "#888", borderBottom: tab === "leave" ? "2px solid var(--sc-blue, #04519B)" : "2px solid transparent" }}>
            Leave Requests
          </button>
        )}
        {canSeeProfiles && (
          <button type="button" onClick={() => setTab("disciplinary")}
            style={{ padding: "8px 4px", marginRight: 12, fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer",
              color: tab === "disciplinary" ? "var(--sc-blue, #04519B)" : "#888", borderBottom: tab === "disciplinary" ? "2px solid var(--sc-blue, #04519B)" : "2px solid transparent" }}>
            Disciplinary
          </button>
        )}
        {canSeeProfiles && (
          <button type="button" onClick={() => setTab("onboarding")}
            style={{ padding: "8px 4px", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer",
              color: tab === "onboarding" ? "var(--sc-blue, #04519B)" : "#888", borderBottom: tab === "onboarding" ? "2px solid var(--sc-blue, #04519B)" : "2px solid transparent" }}>
            Onboarding
          </button>
        )}
      </div>
      {tab === "profiles" && canSeeProfiles && <StaffProfilesTab staffName={staffName} editable={access === "Edit"} />}
      {tab === "leave" && canSeeLeave && <LeaveRequestsTab staffName={staffName} canReviewHR={access === "Edit"} isCoo={isCoo} />}
      {tab === "disciplinary" && canSeeProfiles && <DisciplinaryTab staffName={staffName} editable={access === "Edit"} />}
      {tab === "onboarding" && canSeeProfiles && <OnboardingTab staffName={staffName} editable={access === "Edit"} />}
    </div>
  );
}
