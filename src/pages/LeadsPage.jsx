import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toTitleCase } from "../lib/textFormat";

const STAGES = ["New", "Contacted", "Negotiating", "Outcome"];
const STAGE_COLORS = {
  New:         "#3b82f6",
  Contacted:   "#d97706",
  Negotiating: "#8b5cf6",
  Outcome:     "var(--text-muted)",
};
const OUTCOME_TINT = {
  Won:  { border: "var(--green)", bg: "var(--green-bg, #eafaf0)" },
  Lost: { border: "var(--red)",   bg: "var(--red-bg)" },
};
const LOCATIONS = ["Dar es Salaam", "Arusha", "Zanzibar"];
const VEHICLES  = ["IST/Aqua/Vitz", "Harrier/RAV4/Vanguard", "Alphard/Wish", "Prado/Land Cruiser", "Hilux/Navara/Ranger"];
const SOURCES   = ["WhatsApp", "Phone Call", "Walk-in", "Referral", "Other"];
const LOST_REASONS = ["Price", "Went with another company", "No response", "Dates unavailable", "Changed plans", "Other"];
const STALE_DAYS = 3;

function fmtDate(d) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}
function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const now  = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}
function nowISO() { return new Date().toISOString(); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Mock data (page built ahead of the Supabase table + WhatsApp integration) ──
const MOCK_LEADS = [
  { id: "LEAD-00001", clientName: "James Mushi", phone: "+255 754 111 222", bookingType: "Rental", pickUpLocation: "Dar es Salaam", vehicle: "Harrier/RAV4/Vanguard", pickupDate: "2026-08-10", returnDate: "2026-08-15", source: "WhatsApp", stage: "New", outcome: "", assignedStaff: "", notes: "", lostReason: "", lastContactDate: nowISO(), createdAt: nowISO(), updatedAt: nowISO(), convertedReservationId: "" },
  { id: "LEAD-00002", clientName: "Grace Kimaro", phone: "+255 713 445 900", bookingType: "Transfer", pickUpLocation: "Zanzibar", vehicle: "Prado/Land Cruiser", pickupDate: "2026-08-06", returnDate: "2026-08-06", source: "Phone Call", stage: "Contacted", outcome: "", assignedStaff: "Amina", notes: "Called back, wants airport pickup at 4pm.", lostReason: "", lastContactDate: "2026-08-02T10:00:00Z", createdAt: "2026-08-01T09:00:00Z", updatedAt: "2026-08-02T10:00:00Z", convertedReservationId: "" },
  { id: "LEAD-00003", clientName: "Peter Mnyamani", phone: "+255 655 900 111", bookingType: "Rental", pickUpLocation: "Arusha", vehicle: "Alphard/Wish", pickupDate: "2026-08-20", returnDate: "2026-08-28", source: "Referral", stage: "Negotiating", outcome: "", assignedStaff: "John", notes: "Asked for weekly discount, following up Friday.", lostReason: "", lastContactDate: "2026-08-03T14:00:00Z", createdAt: "2026-07-30T08:00:00Z", updatedAt: "2026-08-03T14:00:00Z", convertedReservationId: "" },
  { id: "LEAD-00004", clientName: "Fatma Said", phone: "+255 777 222 333", bookingType: "Rental", pickUpLocation: "Dar es Salaam", vehicle: "IST/Aqua/Vitz", pickupDate: "2026-08-05", returnDate: "2026-08-09", source: "WhatsApp", stage: "Outcome", outcome: "Won", assignedStaff: "Amina", notes: "Confirmed, deposit received.", lostReason: "", lastContactDate: "2026-08-01T11:00:00Z", createdAt: "2026-07-28T12:00:00Z", updatedAt: "2026-08-01T11:00:00Z", convertedReservationId: "" },
  { id: "LEAD-00005", clientName: "David Kessy", phone: "+255 622 888 001", bookingType: "Rental", pickUpLocation: "Arusha", vehicle: "Hilux/Navara/Ranger", pickupDate: "2026-08-14", returnDate: "2026-08-18", source: "Walk-in", stage: "Outcome", outcome: "Lost", assignedStaff: "John", notes: "", lostReason: "Went with another company", lastContactDate: "2026-07-29T09:00:00Z", createdAt: "2026-07-27T09:00:00Z", updatedAt: "2026-07-29T09:00:00Z", convertedReservationId: "" },
];

export default function LeadsPage({ staffName, role }) {
  const navigate = useNavigate();
  const [leads,   setLeads]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd,    setShowAdd]    = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [outcomePrompt, setOutcomePrompt] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // Backend not wired yet — falls back to mock data until the Leads
      // Supabase table + /api endpoints exist. Swap for `api.getLeads()`
      // once that's live.
      const data = await api.getLeads().catch(() => null);
      setLeads(data || MOCK_LEADS);
    } finally {
      setLoading(false);
    }
  }

  const byStage = useMemo(() => {
    const map = {}; STAGES.forEach(s => map[s] = []);
    leads.forEach(l => { if (map[l.stage]) map[l.stage].push(l); });
    return map;
  }, [leads]);

  async function moveStage(lead, newStage, outcome = "") {
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, stage: newStage, outcome, updatedAt: nowISO() } : l));
    try { await api.editLead({ id: lead.id, stage: newStage, outcome }); } catch { /* mock mode — ignore */ }
  }

  function handleDrop(e, stage) {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/lead-id");
    const lead = leads.find(l => l.id === id);
    if (!lead || lead.stage === stage) return;
    if (stage === "Outcome") { setOutcomePrompt(lead); return; }
    moveStage(lead, stage);
  }

  return (
    <div style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Leads</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 0" }}>
            {leads.length} lead{leads.length !== 1 ? "s" : ""} · sourced from WhatsApp &amp; manual entry
          </p>
        </div>
        <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ New Lead</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {STAGES.map(stage => (
            <div
              key={stage}
              onDragOver={e => { e.preventDefault(); setDragOverStage(stage); }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={e => handleDrop(e, stage)}
              style={{
                flex: "0 0 280px", background: "var(--bg)",
                border: `1.5px solid ${dragOverStage === stage ? STAGE_COLORS[stage] : "var(--border)"}`,
                borderRadius: 12, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 190px)",
                transition: "border-color .12s",
              }}
            >
              <div style={{
                padding: "10px 12px", borderBottom: "1px solid var(--border-light)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                position: "sticky", top: 0, background: "var(--bg)", borderRadius: "12px 12px 0 0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_COLORS[stage] }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{stage}</span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
                  background: "var(--surface)", borderRadius: 20, padding: "1px 8px",
                }}>{byStage[stage].length}</span>
              </div>

              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                {byStage[stage].length === 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "center", padding: "1rem 0" }}>No leads</p>
                )}
                {byStage[stage].map(lead => (
                  <LeadCard key={lead.id} lead={lead} onClick={() => setShowDetail(lead)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddLeadModal
          staffName={staffName}
          onClose={() => setShowAdd(false)}
          onSaved={(newLead) => { setLeads(prev => [newLead, ...prev]); setShowAdd(false); }}
        />
      )}

      {showDetail && (
        <DetailModal
          lead={showDetail}
          canEdit={role === "Admin" || role === "Manager" || true /* all staff per spec */}
          onClose={() => setShowDetail(null)}
          onUpdated={(updated) => {
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
            setShowDetail(updated);
          }}
          onDeleted={(id) => { setLeads(prev => prev.filter(l => l.id !== id)); setShowDetail(null); }}
          onConvert={(lead) => {
            navigate("/reservations", { state: { prefillFromLead: lead } });
          }}
        />
      )}

      {outcomePrompt && (
        <OutcomePromptModal
          lead={outcomePrompt}
          onClose={() => setOutcomePrompt(null)}
          onChoose={(outcome, lostReason) => {
            setLeads(prev => prev.map(l => l.id === outcomePrompt.id
              ? { ...l, stage: "Outcome", outcome, lostReason: outcome === "Lost" ? lostReason : "", updatedAt: nowISO() }
              : l));
            api.editLead({ id: outcomePrompt.id, stage: "Outcome", outcome, lostReason: outcome === "Lost" ? lostReason : "" }).catch(() => {});
            setOutcomePrompt(null);
          }}
        />
      )}
    </div>
  );
}

// ── Lead card ────────────────────────────────────────────────
function LeadCard({ lead, onClick }) {
  const stale = lead.stage !== "Outcome" && daysSince(lead.lastContactDate) >= STALE_DAYS;
  const tint = OUTCOME_TINT[lead.outcome];
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData("text/lead-id", lead.id)}
      onClick={onClick}
      style={{
        background: tint ? tint.bg : "var(--surface)",
        border: `1.5px solid ${tint ? tint.border : "var(--border)"}`,
        borderLeft: `3px solid ${tint ? tint.border : STAGE_COLORS[lead.stage]}`,
        borderRadius: 8, padding: "9px 10px", cursor: "pointer", boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{lead.clientName}</span>
        {tint ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: tint.border, whiteSpace: "nowrap" }}>{lead.outcome}</span>
        ) : stale ? (
          <span title={`No contact in ${daysSince(lead.lastContactDate)} days`} style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", background: "var(--red-bg)", borderRadius: 10, padding: "1px 6px", whiteSpace: "nowrap" }}>Stale</span>
        ) : null}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "3px 0 0" }}>{lead.phone}</p>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "3px 0 0" }}>{lead.vehicle}</p>
      <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "3px 0 0" }}>
        {lead.pickUpLocation} · {fmtDate(lead.pickupDate)}{lead.bookingType === "Rental" ? ` → ${fmtDate(lead.returnDate)}` : ""}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.3 }}>{lead.source}</span>
        {lead.assignedStaff && <span style={{ fontSize: 10.5, color: "var(--sc-blue)", fontWeight: 600 }}>{lead.assignedStaff}</span>}
      </div>
    </div>
  );
}

// ── Outcome prompt (shown when a card is dropped into the Outcome column) ──
function OutcomePromptModal({ lead, onClose, onChoose }) {
  const [picked, setPicked] = useState(null); // "Won" | "Lost"
  const [lostReason, setLostReason] = useState("");

  const confirm = () => {
    if (picked === "Lost" && !lostReason) return;
    onChoose(picked, lostReason);
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 380 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>{lead.clientName} — Outcome</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>Did this lead convert?</p>
          <div style={{ display: "flex", gap: 10, marginBottom: picked === "Lost" ? 14 : 4 }}>
            <button type="button" onClick={() => setPicked("Won")}
              style={{ flex: 1, padding: "14px 0", fontSize: 14, fontWeight: 700, borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                border: `1.5px solid ${picked === "Won" ? "var(--green)" : "var(--border)"}`,
                background: picked === "Won" ? "var(--green-bg, #eafaf0)" : "var(--surface)",
                color: "var(--green)" }}>
              ✓ Won
            </button>
            <button type="button" onClick={() => setPicked("Lost")}
              style={{ flex: 1, padding: "14px 0", fontSize: 14, fontWeight: 700, borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                border: `1.5px solid ${picked === "Lost" ? "var(--red)" : "var(--border)"}`,
                background: picked === "Lost" ? "var(--red-bg)" : "var(--surface)",
                color: "var(--red)" }}>
              ✕ Lost
            </button>
          </div>

          {picked === "Lost" && (
            <div style={S.field}>
              <label style={S.label}>Lost Reason *</label>
              <select style={S.input} value={lostReason} onChange={e => setLostReason(e.target.value)}>
                <option value="">Select a reason…</option>
                {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          <button type="button"
            style={{ ...S.btn, background: picked === "Won" ? "var(--green)" : picked === "Lost" ? "var(--red)" : "var(--border)", opacity: !picked || (picked === "Lost" && !lostReason) ? 0.5 : 1 }}
            disabled={!picked || (picked === "Lost" && !lostReason)}
            onClick={confirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Lead Modal ───────────────────────────────────────────
function AddLeadModal({ staffName, onClose, onSaved }) {
  const [form, setForm] = useState({
    clientName: "", phone: "", bookingType: "Rental", pickUpLocation: LOCATIONS[0],
    vehicle: VEHICLES[0], pickupDate: todayStr(), returnDate: "", source: "Phone Call",
    assignedStaff: staffName || "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.clientName.trim()) { setErr("Client name is required."); return; }
    if (!form.phone.trim())      { setErr("Contact number is required."); return; }
    setSaving(true); setErr("");
    const now = nowISO();
    const newLead = {
      id: `LEAD-${Date.now()}`, ...form, stage: "New", outcome: "", lostReason: "",
      lastContactDate: now, createdAt: now, updatedAt: now, convertedReservationId: "",
    };
    try {
      await api.addLead(newLead).catch(() => null); // falls back silently until backend exists
      onSaved(newLead);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>New Lead</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}><label style={S.label}>Client Name *</label>
            <input style={S.input} value={form.clientName} onChange={e => set("clientName", e.target.value)} onBlur={e => set("clientName", toTitleCase(e.target.value))} autoFocus /></div>
          <div style={S.field}><label style={S.label}>Contact No. *</label>
            <input style={S.input} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+255..." /></div>

          <div style={S.field}>
            <label style={S.label}>Booking Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["Rental", "Transfer"].map(t => (
                <button key={t} type="button" onClick={() => set("bookingType", t)}
                  style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                    border: `1.5px solid ${form.bookingType === t ? "var(--sc-blue)" : "var(--border)"}`,
                    background: form.bookingType === t ? "var(--blue-bg)" : "var(--surface)",
                    color: form.bookingType === t ? "var(--sc-blue)" : "var(--text-muted)" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Location</label>
              <select style={S.input} value={form.pickUpLocation} onChange={e => set("pickUpLocation", e.target.value)}>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select></div>
            <div style={S.field}><label style={S.label}>Vehicle</label>
              <select style={S.input} value={form.vehicle} onChange={e => set("vehicle", e.target.value)}>
                {VEHICLES.map(v => <option key={v} value={v}>{v}</option>)}
              </select></div>
          </div>

          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Start Date</label>
              <input style={S.input} type="date" value={form.pickupDate} onChange={e => set("pickupDate", e.target.value)} /></div>
            <div style={S.field}><label style={S.label}>End Date</label>
              <input style={S.input} type="date" value={form.returnDate} min={form.pickupDate} onChange={e => set("returnDate", e.target.value)} /></div>
          </div>

          <div style={S.two}>
            <div style={S.field}><label style={S.label}>Source</label>
              <select style={S.input} value={form.source} onChange={e => set("source", e.target.value)}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div style={S.field}><label style={S.label}>Assigned Staff</label>
              <input style={S.input} value={form.assignedStaff} onChange={e => set("assignedStaff", e.target.value)} /></div>
          </div>

          <div style={S.field}><label style={S.label}>Notes</label>
            <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any details from the conversation…" /></div>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Add Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail / Edit Modal ──────────────────────────────────────
function DetailModal({ lead, canEdit, onClose, onUpdated, onDeleted, onConvert }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    clientName: lead.clientName, phone: lead.phone, bookingType: lead.bookingType,
    pickUpLocation: lead.pickUpLocation, vehicle: lead.vehicle, pickupDate: lead.pickupDate,
    returnDate: lead.returnDate, source: lead.source, stage: lead.stage, outcome: lead.outcome,
    assignedStaff: lead.assignedStaff, notes: lead.notes, lostReason: lead.lostReason,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const stale = lead.stage !== "Outcome" && daysSince(lead.lastContactDate) >= STALE_DAYS;
  const tint = OUTCOME_TINT[lead.outcome];

  const handleSave = async () => {
    if (!form.clientName.trim()) { setErr("Client name is required."); return; }
    if (form.stage === "Outcome" && form.outcome === "Lost" && !form.lostReason) { setErr("Please select a lost reason."); return; }
    setSaving(true); setErr("");
    const updated = { ...lead, ...form, updatedAt: nowISO(), lastContactDate: nowISO() };
    try {
      await api.editLead(updated).catch(() => null);
      onUpdated(updated);
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this lead?")) return;
    setDeleting(true);
    try { await api.deleteLead({ id: lead.id }).catch(() => null); onDeleted(lead.id); }
    catch (e) { alert(e.message); setDeleting(false); }
  };

  const rows = [
    ["Contact No.", lead.phone],
    ["Booking Type", lead.bookingType],
    ["Location", lead.pickUpLocation],
    ["Vehicle", lead.vehicle],
    ["Start Date", fmtDate(lead.pickupDate)],
    ...(lead.bookingType === "Rental" ? [["End Date", fmtDate(lead.returnDate)]] : []),
    ["Source", lead.source],
    ["Assigned Staff", lead.assignedStaff || "—"],
    ["Notes", lead.notes || "—"],
    ...(lead.outcome === "Lost" ? [["Lost Reason", lead.lostReason || "—"]] : []),
    ["Last Contact", lead.lastContactDate ? fmtDate(lead.lastContactDate.slice(0, 10)) : "—"],
  ];

  const otherStages = STAGES.filter(s => s !== lead.stage && s !== "Outcome");

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: tint ? tint.border : STAGE_COLORS[lead.stage] }}>
          <div>
            <p style={S.mTitle}>{lead.clientName}</p>
            <p style={S.mSub}>{lead.stage === "Outcome" ? lead.outcome : lead.stage}{stale ? " · Stale" : ""}</p>
          </div>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.mBody}>
          {!editing ? (
            <>
              {rows.map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
                  <span style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "60%" }}>{val}</span>
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {otherStages.map(s => (
                  <button key={s} type="button"
                    onClick={() => { set("stage", s); set("outcome", ""); setEditing(true); }}
                    style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                      border: `1.5px solid ${STAGE_COLORS[s]}`, background: "var(--surface)", color: STAGE_COLORS[s] }}>
                    Move to {s}
                  </button>
                ))}
                {lead.stage !== "Outcome" && (
                  <button type="button"
                    onClick={() => { set("stage", "Outcome"); setEditing(true); }}
                    style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer",
                      border: "1.5px solid var(--text-muted)", background: "var(--surface)", color: "var(--text-muted)" }}>
                    Set Outcome
                  </button>
                )}
              </div>

              {lead.outcome === "Won" && (
                <div style={{ marginTop: 14 }}>
                  <button type="button" style={{ ...S.btn, background: "var(--green)", marginTop: 0 }} onClick={() => onConvert(lead)}>
                    Convert to Reservation
                  </button>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(true)}>Edit</button>
                <button type="button" className="btn btn-ghost" style={{ flex: 1, color: "var(--red)" }} onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={S.field}><label style={S.label}>Client Name *</label>
                <input style={S.input} value={form.clientName} onChange={e => set("clientName", e.target.value)} onBlur={e => set("clientName", toTitleCase(e.target.value))} /></div>
              <div style={S.field}><label style={S.label}>Contact No.</label>
                <input style={S.input} value={form.phone} onChange={e => set("phone", e.target.value)} /></div>

              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Location</label>
                  <select style={S.input} value={form.pickUpLocation} onChange={e => set("pickUpLocation", e.target.value)}>
                    {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select></div>
                <div style={S.field}><label style={S.label}>Vehicle</label>
                  <select style={S.input} value={form.vehicle} onChange={e => set("vehicle", e.target.value)}>
                    {VEHICLES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select></div>
              </div>

              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Start Date</label>
                  <input style={S.input} type="date" value={form.pickupDate} onChange={e => set("pickupDate", e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>End Date</label>
                  <input style={S.input} type="date" value={form.returnDate} onChange={e => set("returnDate", e.target.value)} /></div>
              </div>

              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Stage</label>
                  <select style={S.input} value={form.stage} onChange={e => { set("stage", e.target.value); if (e.target.value !== "Outcome") set("outcome", ""); }}>
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select></div>
                <div style={S.field}><label style={S.label}>Assigned Staff</label>
                  <input style={S.input} value={form.assignedStaff} onChange={e => set("assignedStaff", e.target.value)} /></div>
              </div>

              {form.stage === "Outcome" && (
                <div style={S.field}>
                  <label style={S.label}>Outcome *</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["Won", "Lost"].map(o => (
                      <button key={o} type="button" onClick={() => set("outcome", o)}
                        style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                          border: `1.5px solid ${form.outcome === o ? OUTCOME_TINT[o].border : "var(--border)"}`,
                          background: form.outcome === o ? OUTCOME_TINT[o].bg : "var(--surface)",
                          color: OUTCOME_TINT[o].border }}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.stage === "Outcome" && form.outcome === "Lost" && (
                <div style={S.field}><label style={S.label}>Lost Reason *</label>
                  <select style={S.input} value={form.lostReason} onChange={e => set("lostReason", e.target.value)}>
                    <option value="">Select a reason…</option>
                    {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select></div>
              )}

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

const S = {
  overlay:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal:    { background: "var(--surface)", borderRadius: 14, width: 460, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", boxShadow: "var(--shadow-lg)" },
  mHead:    { padding: "1rem 1.25rem", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  mTitle:   { fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 },
  mSub:     { fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "2px 0 0" },
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
