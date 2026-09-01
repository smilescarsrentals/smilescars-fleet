import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HR_ENABLED_LOCATIONS } from "../components/ActionModal";

const LEAVE_TYPES = ["Annual", "Sick", "Unpaid", "Compassionate"];
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

// Only approved Annual leave counts against the 28-day allowance — Sick/
// Unpaid/Compassionate are recorded but don't draw down the balance, per
// Ramzanali's call. Resets on the calendar year.
function calcLeaveBalance(requests) {
  const year = new Date().getFullYear();
  const used = requests
    .filter(r => r.leaveType === "Annual" && r.status === "Approved" && new Date(r.startDate).getFullYear() === year)
    .reduce((sum, r) => sum + (r.daysRequested || 0), 0);
  return { total: ANNUAL_LEAVE_DAYS, used, remaining: ANNUAL_LEAVE_DAYS - used };
}

const cardStyle = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column" };
const cardTitle = { fontSize: 13.5, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: ".3px", color: "#555" };

function RequestLeaveForm({ staffName, onClose, onSaved }) {
  const [leaveType, setLeaveType] = useState("Annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!startDate || !endDate) { setErr("Start and end dates are required."); return; }
    setSaving(true); setErr("");
    try {
      await api.submitLeaveRequest({ staffName, leaveType, startDate, endDate, reason });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: 10, marginBottom: 10, background: "#fafafa" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={{ fontSize: 11, color: "#888" }}>Leave Type</label>
          <select style={{ width: "100%", padding: "7px 9px", fontSize: 12.5, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit" }}
            value={leaveType} onChange={e => setLeaveType(e.target.value)}>
            {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div />
        <div>
          <label style={{ fontSize: 11, color: "#888" }}>Start Date</label>
          <input type="date" style={{ width: "100%", padding: "7px 9px", fontSize: 12.5, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box" }}
            value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#888" }}>End Date</label>
          <input type="date" style={{ width: "100%", padding: "7px 9px", fontSize: 12.5, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box" }}
            value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
      <label style={{ fontSize: 11, color: "#888" }}>Reason</label>
      <textarea style={{ width: "100%", padding: "7px 9px", fontSize: 12.5, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box", minHeight: 44 }}
        value={reason} onChange={e => setReason(e.target.value)} />
      <p style={{ fontSize: 10.5, color: "#aaa", margin: "4px 0 0" }}>Needs at least 2 days' notice before the start date.</p>
      {err && <p style={{ color: "#dc2626", fontSize: 11.5, margin: "6px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button type="button" disabled={saving} onClick={submit}
          style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.65 : 1 }}>
          {saving ? "Submitting…" : "Submit"}
        </button>
        <button type="button" onClick={onClose}
          style={{ padding: "6px 12px", fontSize: 12, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 6, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MyHRPage({ staffName, role }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(role === "Admin");
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [disciplinary, setDisciplinary] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadAll = () => {
    api.getMyProfile(staffName).then(res => setProfile(res.data)).catch(() => {});
    api.getMyLeaveRequests(staffName).then(res => setRequests(res.data || [])).catch(() => {});
    api.getMyDisciplinaryRecords(staffName).then(res => setDisciplinary(res.data || [])).catch(() => {});
  };

  useEffect(() => {
    if (role === "Admin") { setLoading(false); loadAll(); return; }
    api.getStaffList().then(res => {
      const me = (res.staff || []).find(s => s.name.trim().toLowerCase() === staffName.trim().toLowerCase());
      const ok = !!me && me.active && HR_ENABLED_LOCATIONS.includes(me.location);
      setAllowed(ok);
      if (ok) loadAll();
    }).catch(() => setAllowed(false)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffName, role]);

  const cancelRequest = async (id) => {
    if (!window.confirm("Revoke this leave request?")) return;
    setBusyId(id);
    try { await api.cancelLeaveRequest({ staffName, requestId: id }); loadAll(); }
    catch (e) { alert(e.message); }
    finally { setBusyId(null); }
  };

  if (loading) return <div style={{ padding: 24, fontSize: 13, color: "#888" }}>Loading…</div>;

  if (!allowed) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>My Profile</h2>
        <p style={{ fontSize: 13, color: "#888" }}>This is currently only available to Dar es Salaam staff.</p>
      </div>
    );
  }

  const balance = calcLeaveBalance(requests);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>My Profile</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        <div style={cardStyle}>
          <p style={cardTitle}>Leave Balance — {new Date().getFullYear()}</p>
          <div style={{ display: "flex", gap: 24, marginTop: 10 }}>
            <div><div style={{ fontSize: 26, fontWeight: 700 }}>{balance.remaining}</div><div style={{ fontSize: 11, color: "#888" }}>days remaining</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 700, color: "#888" }}>{balance.used}</div><div style={{ fontSize: 11, color: "#888" }}>days used</div></div>
            <div><div style={{ fontSize: 26, fontWeight: 700, color: "#888" }}>{balance.total}</div><div style={{ fontSize: 11, color: "#888" }}>annual allowance</div></div>
          </div>
          <p style={{ fontSize: 10.5, color: "#aaa", marginTop: "auto", paddingTop: 12 }}>Only approved Annual leave counts against this balance.</p>
        </div>

        <div style={cardStyle}>
          <p style={cardTitle}>Profile</p>
          {!profile ? <p style={{ fontSize: 12.5, color: "#888", marginTop: 8 }}>Loading…</p> : (
            <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <div><span style={{ color: "#888" }}>National ID: </span>{profile.nationalId || "—"}</div>
              <div><span style={{ color: "#888" }}>Contract Status: </span>{profile.contractType || "—"}</div>
              <div><span style={{ color: "#888" }}>Start Date: </span>{fmtDate(profile.startDate)}</div>
              <div><span style={{ color: "#888" }}>Next of Kin: </span>{profile.nextOfKinName || "—"}{profile.nextOfKinRelationship ? ` (${profile.nextOfKinRelationship})` : ""}</div>
              <div><span style={{ color: "#888" }}>Next of Kin Phone: </span>{profile.nextOfKinPhone || "—"}</div>
            </div>
          )}
          <p style={{ fontSize: 10.5, color: "#aaa", marginTop: "auto", paddingTop: 12 }}>View only — contact HR to update.</p>
        </div>

        <div style={{ ...cardStyle, minHeight: 260 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={cardTitle}>Leave Requests</p>
            {!showForm && (
              <button type="button" onClick={() => setShowForm(true)}
                style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue, #04519B)", background: "none", border: "none", cursor: "pointer" }}>
                + Request
              </button>
            )}
          </div>
          {showForm && <div style={{ marginTop: 8 }}><RequestLeaveForm staffName={staffName} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadAll(); }} /></div>}
          <div style={{ marginTop: 8, overflowY: "auto", maxHeight: 260, display: "flex", flexDirection: "column", gap: 8 }}>
            {requests.length === 0 ? <p style={{ fontSize: 12.5, color: "#888" }}>No leave requests yet.</p> : requests.map(r => (
              <div key={r.id} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.leaveType} — {fmtDate(r.startDate)} to {fmtDate(r.endDate)}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{r.daysRequested} day{r.daysRequested === 1 ? "" : "s"}{r.reason ? ` · ${r.reason}` : ""}</div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.hrNotes && <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>HR: {r.hrNotes}</p>}
                {r.cooNotes && <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>COO: {r.cooNotes}</p>}
                {r.status === "Cancelled" && r.cancelledBy && <p style={{ fontSize: 10.5, color: "#aaa", margin: "2px 0 0" }}>Revoked by {r.cancelledBy}</p>}
                {r.addedBy && <p style={{ fontSize: 10.5, color: "#aaa", margin: "2px 0 0" }}>Recorded by {r.addedBy}</p>}
                {!r.addedBy && ["Pending HR", "Pending COO", "Approved"].includes(r.status) && (
                  <button type="button" disabled={busyId === r.id} onClick={() => cancelRequest(r.id)}
                    style={{ marginTop: 6, fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Revoke request
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...cardStyle, minHeight: 260 }}>
          <p style={cardTitle}>Disciplinary Record</p>
          <div style={{ marginTop: 8, overflowY: "auto", maxHeight: 260, display: "flex", flexDirection: "column", gap: 8 }}>
            {disciplinary.length === 0 ? <p style={{ fontSize: 12.5, color: "#888" }}>Nothing on file.</p> : disciplinary.map(d => (
              <div key={d.id} style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{d.type}</span>
                  <span style={{ fontSize: 11, color: "#888" }}>{fmtDate(d.date)}</span>
                </div>
                {d.description && <p style={{ fontSize: 11.5, color: "#555", margin: "4px 0 0" }}>{d.description}</p>}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
