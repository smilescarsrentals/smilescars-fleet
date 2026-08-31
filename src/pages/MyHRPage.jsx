import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HR_ENABLED_LOCATIONS } from "../components/ActionModal";

const LEAVE_TYPES = ["Annual", "Sick", "Unpaid", "Compassionate"];

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
    <div style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: "#888" }}>Leave Type</label>
          <select style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit" }}
            value={leaveType} onChange={e => setLeaveType(e.target.value)}>
            {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div />
        <div>
          <label style={{ fontSize: 11, color: "#888" }}>Start Date</label>
          <input type="date" style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box" }}
            value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#888" }}>End Date</label>
          <input type="date" style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box" }}
            value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11, color: "#888" }}>Reason</label>
        <textarea style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, fontFamily: "inherit", boxSizing: "border-box", minHeight: 60 }}
          value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      {err && <p style={{ color: "#dc2626", fontSize: 12, margin: "8px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" disabled={saving} onClick={submit}
          style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 7, cursor: "pointer", opacity: saving ? 0.65 : 1 }}>
          {saving ? "Submitting…" : "Submit Request"}
        </button>
        <button type="button" onClick={onClose}
          style={{ padding: "8px 16px", fontSize: 13, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 7, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MyHRPage({ staffName, role }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(role === "Admin");
  const [requests, setRequests] = useState([]);
  const [disciplinary, setDisciplinary] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadRequests = () => {
    api.getMyLeaveRequests(staffName).then(res => setRequests(res.data || [])).catch(() => {});
    api.getMyDisciplinaryRecords(staffName).then(res => setDisciplinary(res.data || [])).catch(() => {});
  };

  useEffect(() => {
    if (role === "Admin") { setLoading(false); loadRequests(); return; }
    api.getStaffList().then(res => {
      const me = (res.staff || []).find(s => s.name.trim().toLowerCase() === staffName.trim().toLowerCase());
      const ok = !!me && me.active && HR_ENABLED_LOCATIONS.includes(me.location);
      setAllowed(ok);
      if (ok) loadRequests();
    }).catch(() => setAllowed(false)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffName, role]);

  const cancelRequest = async (id) => {
    if (!window.confirm("Cancel this leave request?")) return;
    setBusyId(id);
    try { await api.cancelLeaveRequest({ staffName, requestId: id }); loadRequests(); }
    catch (e) { alert(e.message); }
    finally { setBusyId(null); }
  };

  if (loading) return <div style={{ padding: 24, fontSize: 13, color: "#888" }}>Loading…</div>;

  if (!allowed) {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>My HR</h2>
        <p style={{ fontSize: 13, color: "#888" }}>This is currently only available to Dar es Salaam staff.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>My Leave Requests</h2>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)}
            style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--sc-blue, #04519B)", border: "none", borderRadius: 7, cursor: "pointer" }}>
            + Request Leave
          </button>
        )}
      </div>

      {showForm && (
        <RequestLeaveForm staffName={staffName} onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadRequests(); }} />
      )}

      {requests.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>No leave requests yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {requests.map(r => (
            <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.leaveType} — {fmtDate(r.startDate)} to {fmtDate(r.endDate)}</div>
                  <div style={{ fontSize: 11.5, color: "#888" }}>{r.daysRequested} day{r.daysRequested === 1 ? "" : "s"}{r.reason ? ` · ${r.reason}` : ""}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              {r.hrNotes && <p style={{ fontSize: 11.5, color: "#888", margin: "6px 0 0" }}>HR note: {r.hrNotes}</p>}
              {r.cooNotes && <p style={{ fontSize: 11.5, color: "#888", margin: "4px 0 0" }}>COO note: {r.cooNotes}</p>}
              {r.status === "Pending HR" && (
                <button type="button" disabled={busyId === r.id} onClick={() => cancelRequest(r.id)}
                  style={{ marginTop: 8, fontSize: 11.5, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  Cancel request
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "28px 0 12px" }}>My Disciplinary Record</h2>
      {disciplinary.length === 0 ? (
        <p style={{ fontSize: 13, color: "#888" }}>Nothing on file.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {disciplinary.map(d => (
            <div key={d.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{d.type}</span>
                <span style={{ fontSize: 11.5, color: "#888" }}>{fmtDate(d.date)}</span>
              </div>
              {d.description && <p style={{ fontSize: 12, color: "#555", margin: "4px 0 0" }}>{d.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
