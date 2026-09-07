import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";
import AddCarModal from "./AddCarModal";
import { toTitleCase } from "../lib/textFormat";
import { splitIntoCoverNoteChunks } from "../lib/coverNoteSplit";

const TABS = [
  { key: "fleet",    label: "Fleet"    },
  { key: "staff",    label: "Staff"    },
  { key: "notifications", label: "Notifications" },
  { key: "coverNotes", label: "Cover Notes" },
  { key: "features", label: "Features" },
  { key: "system",   label: "System"   },
];

export default function AdminPanel({ staffName, role }) {
  const [tab, setTab] = useState("fleet");
  const [config, setConfig] = useState({ locations: [], garages: [], drivers: [] });

  const loadConfig = () => {
    api.getConfig().then(res => setConfig(res)).catch(() => {});
  };
  useEffect(loadConfig, []);

  // Nav-level gating already restricts this route to Admin — this is
  // defense-in-depth for anyone who navigates to the URL directly.
  if (role !== "Admin") {
    return <div style={{ padding: 24 }}><p style={{ fontSize: 13, color: "#888" }}>You don't have access to this page.</p></div>;
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.25rem" }}>
      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={S.head}>
          <p style={S.title}>⚙️ Admin</p>
        </div>

        <div style={S.tabBar}>
          {TABS.map(t => (
            <button type="button" key={t.key} onClick={() => setTab(t.key)}
              style={{ ...S.tabBtn, ...(tab === t.key ? S.tabBtnActive : {}) }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={S.body}>
          {tab === "fleet"    && <FleetTab    config={config} onConfigChanged={loadConfig} />}
          {tab === "staff"    && <StaffTab staffName={staffName} />}
          {tab === "notifications" && <NotificationsTab staffName={staffName} />}
          {tab === "coverNotes" && <CoverNotesTab staffName={staffName} />}
          {tab === "features" && <FeaturesTab />}
          {tab === "system"   && <SystemTab />}
        </div>
      </div>
    </div>
  );
}

// ── Fleet tab: Add Car + Config lists (Locations/Garages/Drivers) ──────────
function FleetTab({ config, onConfigChanged }) {
  const [showAddCar, setShowAddCar] = useState(false);
  return (
    <div>
      <button type="button" style={S.primaryBtn} onClick={() => setShowAddCar(true)}>+ Add Car to Fleet</button>

      <ConfigListEditor title="Locations" type="Location" values={config.locations || []} onChanged={onConfigChanged} />
      <ConfigListEditor title="Garages"   type="Garage"   values={config.garages   || []} onChanged={onConfigChanged} />

      {showAddCar && (
        <AddCarModal locations={config.locations}
          onClose={() => setShowAddCar(false)}
          onSaved={() => { setShowAddCar(false); onConfigChanged(); }} />
      )}
    </div>
  );
}

function ConfigListEditor({ title, type, values, onChanged }) {
  const [adding,   setAdding]   = useState(false);
  const [newValue, setNewValue] = useState("");
  const [editing,  setEditing]  = useState(null); // value currently being renamed
  const [editText, setEditText] = useState("");
  const [busy,     setBusy]     = useState(false);

  const add = async () => {
    if (!newValue.trim()) return;
    setBusy(true);
    try {
      if (type === "Location") await api.addLocation(newValue.trim());
      if (type === "Garage")   await api.addGarage(newValue.trim());
      if (type === "Driver")   await api.addDriver(newValue.trim());
      setNewValue(""); setAdding(false); onChanged();
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };
  const rename = async (oldValue) => {
    if (!editText.trim() || editText.trim() === oldValue) { setEditing(null); return; }
    setBusy(true);
    try { await api.updateConfigItem({ type, oldValue, newValue: editText.trim() }); setEditing(null); onChanged(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };
  const remove = async (value) => {
    if (!window.confirm(`Remove "${value}" from ${title}?`)) return;
    setBusy(true);
    try { await api.deleteConfigItem({ type, value }); onChanged(); }
    catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={S.section}>
      <p style={S.sectionTitle}>{title}</p>
      <div style={S.listBox}>
        {values.map(v => (
          <div key={v} style={S.listRow}>
            {editing === v ? (
              <input style={{ ...S.input, flex: 1 }} value={editText} autoFocus
                onChange={e => setEditText(e.target.value)}
                onBlur={e => setEditText(toTitleCase(e.target.value))}
                onKeyDown={e => e.key === "Enter" && rename(v)} />
            ) : (
              <span style={{ flex: 1, fontSize: 13 }}>{v}</span>
            )}
            {editing === v ? (
              <>
                <button type="button" style={S.miniBtn} disabled={busy} onClick={() => rename(v)}>✓</button>
                <button type="button" style={S.miniBtn} disabled={busy} onClick={() => setEditing(null)}>✕</button>
              </>
            ) : (
              <>
                <button type="button" style={S.miniBtn} disabled={busy} onClick={() => { setEditing(v); setEditText(v); }}>✏️</button>
                <button type="button" style={{ ...S.miniBtn, color: "#dc2626" }} disabled={busy} onClick={() => remove(v)}>🗑</button>
              </>
            )}
          </div>
        ))}
        {values.length === 0 && <p style={{ fontSize: 12, color: "#aaa", padding: "6px 0" }}>None yet.</p>}
      </div>
      {adding ? (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input style={{ ...S.input, flex: 1 }} value={newValue} autoFocus placeholder={`New ${title.slice(0, -1).toLowerCase()}…`}
            onChange={e => setNewValue(e.target.value)} onBlur={e => setNewValue(toTitleCase(e.target.value))} onKeyDown={e => e.key === "Enter" && add()} />
          <button type="button" style={S.miniBtn} disabled={busy} onClick={add}>Add</button>
          <button type="button" style={S.miniBtn} disabled={busy} onClick={() => { setAdding(false); setNewValue(""); }}>✕</button>
        </div>
      ) : (
        <button type="button" style={S.smallLink} onClick={() => setAdding(true)}>+ Add {title.slice(0, -1)}</button>
      )}
    </div>
  );
}

// ── Staff tab: Add Staff + list with Active toggle + Clear Signature ───────
function StaffTab({ staffName }) {
  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [busyFuel, setBusyFuel] = useState(null); // name of row mid-save
  const [busyLocation, setBusyLocation] = useState(null);
  const [busyHr, setBusyHr] = useState(null);
  const [busyCoo, setBusyCoo] = useState(null);

  const load = () => {
    setLoading(true);
    api.getStaffList().then(res => setStaff(res.staff || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleActive = async (name, active) => {
    try { await api.setStaffActive({ name, active: !active }); load(); }
    catch (e) { alert(e.message); }
  };
  const clearSignature = async (name) => {
    if (!window.confirm(`Remove ${name}'s stored signature? They'll need to sign again on their next agreement.`)) return;
    try { await api.deleteStaffSignature({ staffName: name }); alert("Signature removed."); }
    catch (e) { alert(e.message); }
  };
  const toggleFuelVoucher = async (name, canIssueFuelVoucher) => {
    setBusyFuel(name);
    try {
      await api.setCanIssueFuelVoucher({ name, enabled: !canIssueFuelVoucher, staffName });
      setStaff(list => list.map(s => s.name === name ? { ...s, canIssueFuelVoucher: !canIssueFuelVoucher } : s));
    } catch (e) { alert(e.message); }
    finally { setBusyFuel(null); }
  };
  const changeLocation = async (name, location) => {
    setBusyLocation(name);
    try {
      await api.setStaffLocation({ name, location, staffName });
      setStaff(list => list.map(s => s.name === name ? { ...s, location } : s));
    } catch (e) { alert(e.message); }
    finally { setBusyLocation(null); }
  };
  const changeHrAccess = async (name, access) => {
    setBusyHr(name);
    try {
      await api.setHRAccess({ name, access, staffName });
      setStaff(list => list.map(s => s.name === name ? { ...s, hrAccess: access } : s));
    } catch (e) { alert(e.message); }
    finally { setBusyHr(null); }
  };
  const toggleCoo = async (name, isCoo) => {
    setBusyCoo(name);
    try {
      await api.setIsCoo({ name, enabled: !isCoo, staffName });
      setStaff(list => list.map(s => s.name === name ? { ...s, isCoo: !isCoo } : s));
    } catch (e) { alert(e.message); }
    finally { setBusyCoo(null); }
  };

  return (
    <div>
      <button type="button" style={S.primaryBtn} onClick={() => setShowAdd(true)}>+ Add Staff</button>

      {loading ? <p style={{ fontSize: 13, color: "#888" }}>Loading…</p> : (
        <div style={S.listBox}>
          {staff.map(s => (
            <div key={s.name} style={{ ...S.listRow, opacity: s.active ? 1 : 0.55, flexWrap: "wrap", rowGap: 6 }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{s.role}{!s.active && " · Deactivated"}</div>
              </div>
              <select value={s.location || ""} disabled={busyLocation === s.name}
                onChange={e => changeLocation(s.name, e.target.value)}
                style={{ fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #e5e7eb", fontFamily: "inherit" }}
                title="Branch location">
                <option value="">No location</option>
                <option value="Dar es Salaam">Dar es Salaam</option>
                <option value="Zanzibar">Zanzibar</option>
                <option value="Arusha">Arusha</option>
                <option value="Mwanza">Mwanza</option>
              </select>
              <select value={s.hrAccess || "None"} disabled={busyHr === s.name}
                onChange={e => changeHrAccess(s.name, e.target.value)}
                style={{ fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #e5e7eb", fontFamily: "inherit" }}
                title="HR module access">
                <option value="None">HR: None</option>
                <option value="View">HR: View</option>
                <option value="Edit">HR: Edit</option>
              </select>
              <button type="button" disabled={busyCoo === s.name}
                style={{ ...S.miniBtn, opacity: s.isCoo ? 1 : 0.3, filter: s.isCoo ? "none" : "grayscale(100%)" }}
                onClick={() => toggleCoo(s.name, s.isCoo)}
                title={s.isCoo ? `${s.name} is the COO approver — click to revoke` : `${s.name} is not the COO approver — click to grant`}>
                👔
              </button>
              <button type="button" disabled={busyFuel === s.name}
                style={{ ...S.miniBtn, opacity: s.canIssueFuelVoucher ? 1 : 0.3, filter: s.canIssueFuelVoucher ? "none" : "grayscale(100%)" }}
                onClick={() => toggleFuelVoucher(s.name, s.canIssueFuelVoucher)}
                title={s.canIssueFuelVoucher ? `${s.name} can issue fuel vouchers — click to revoke` : `${s.name} cannot issue fuel vouchers — click to grant`}>
                ⛽
              </button>
              <button type="button" style={S.miniBtn} onClick={() => clearSignature(s.name)} title="Clear stored signature">🖊️✕</button>
              <button type="button" style={{ ...S.miniBtn, color: s.active ? "#dc2626" : "#16a34a" }}
                onClick={() => toggleActive(s.name, s.active)}>
                {s.active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddStaffModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddStaffModal({ onClose, onSaved }) {
  const [name,     setName]     = useState("");
  const [password, setPassword] = useState("");
  const [role,     setRole]     = useState("Staff");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  const save = async () => {
    if (!name.trim()) { setErr("Name is required."); return; }
    setSaving(true); setErr("");
    try { await api.addStaff({ name: name.trim(), password, role }); onSaved(); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 380 }} onClick={e => e.stopPropagation()}>
        <div style={S.head}><p style={S.title}>Add Staff</p><button type="button" style={S.closeBtn} onClick={onClose}>✕</button></div>
        <div style={S.body}>
          <div style={S.field}><label style={S.label}>Name *</label>
            <input style={S.input} value={name} onChange={e => setName(e.target.value)} onBlur={e => setName(toTitleCase(e.target.value))} autoFocus /></div>
          <div style={S.field}><label style={S.label}>Password</label>
            <input style={S.input} value={password} onChange={e => setPassword(e.target.value)} /></div>
          <div style={S.field}><label style={S.label}>Role</label>
            <select style={{ ...S.input, fontFamily: "inherit" }} value={role} onChange={e => setRole(e.target.value)}>
              <option>Staff</option><option>Manager</option><option>Admin</option>
            </select>
          </div>
          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.primaryBtn, width: "100%", opacity: saving ? 0.65 : 1 }} disabled={saving} onClick={save}>
            {saving ? "Adding…" : "Add Staff"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Features tab: Rental Agreement + Dropbox sync toggles ──────────────────
// ── Notifications tab: per-trigger on/off + who gets ALL reservation
// reminders (not just their own) ────────────────────────────────────────
function NotificationsTab({ staffName }) {
  const [triggers, setTriggers] = useState(null);
  const [staff, setStaff] = useState(null);
  const [busyKey, setBusyKey] = useState(null); // which row is mid-save, so only that row shows busy

  const load = () => {
    api.getNotificationTriggerSettings().then(res => setTriggers(res.data)).catch(() => {});
    api.getStaffList().then(res => setStaff(res.staff)).catch(() => {});
  };
  useEffect(load, []);

  const toggleTrigger = async (t) => {
    setBusyKey(t.type);
    try {
      await api.setNotificationTriggerEnabled({ type: t.type, enabled: !t.enabled, staffName });
      setTriggers(list => list.map(x => x.type === t.type ? { ...x, enabled: !x.enabled } : x));
    } catch (e) { alert(e.message); }
    finally { setBusyKey(null); }
  };

  const toggleReminders = async (s) => {
    setBusyKey(s.name);
    try {
      await api.setReceivesAllReservationReminders({ name: s.name, enabled: !s.receivesAllReservationReminders, staffName });
      setStaff(list => list.map(x => x.name === s.name ? { ...x, receivesAllReservationReminders: !x.receivesAllReservationReminders } : x));
    } catch (e) { alert(e.message); }
    finally { setBusyKey(null); }
  };

  const toggleDriverDocReminders = async (s) => {
    setBusyKey("dd-" + s.name);
    try {
      await api.setReceivesDriverDocumentReminders({ name: s.name, enabled: !s.receivesDriverDocumentReminders, staffName });
      setStaff(list => list.map(x => x.name === s.name ? { ...x, receivesDriverDocumentReminders: !x.receivesDriverDocumentReminders } : x));
    } catch (e) { alert(e.message); }
    finally { setBusyKey(null); }
  };

  const toggleInsuranceReminders = async (s) => {
    setBusyKey("ins-" + s.name);
    try {
      await api.setReceivesInsuranceReminders({ name: s.name, enabled: !s.receivesInsuranceReminders, staffName });
      setStaff(list => list.map(x => x.name === s.name ? { ...x, receivesInsuranceReminders: !x.receivesInsuranceReminders } : x));
    } catch (e) { alert(e.message); }
    finally { setBusyKey(null); }
  };

  const toggleCanManageDrivers = async (s) => {
    setBusyKey("cmd-" + s.name);
    try {
      await api.setCanManageDrivers({ name: s.name, enabled: !s.canManageDrivers, staffName });
      setStaff(list => list.map(x => x.name === s.name ? { ...x, canManageDrivers: !x.canManageDrivers } : x));
    } catch (e) { alert(e.message); }
    finally { setBusyKey(null); }
  };

  if (!triggers || !staff) return <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>;

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 8px" }}>
        Triggers
      </p>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>
        Turning a trigger off silences it everywhere — the bell AND push — for everyone. Use this if one becomes noisy rather than deactivating individual staff.
      </p>
      {triggers.map(t => (
        <ToggleRow key={t.type} label={t.label}
          sub={t.updatedBy ? `Last changed by ${t.updatedBy} on ${new Date(t.updatedAt).toLocaleDateString()}` : ""}
          on={t.enabled} busy={busyKey === t.type} onToggle={() => toggleTrigger(t)} />
      ))}

      <p style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.3, margin: "20px 0 8px" }}>
        Reservation Reminders
      </p>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>
        Everyone gets a reminder for their own reservations 24h before pickup automatically. Turn this on for someone who should also see EVERY reservation, not just their own.
      </p>
      {staff.filter(s => s.active).map(s => (
        <ToggleRow key={s.name} label={s.name} sub={s.role} on={s.receivesAllReservationReminders} busy={busyKey === s.name} onToggle={() => toggleReminders(s)} />
      ))}

      <p style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.3, margin: "20px 0 8px" }}>
        Driver Document Reminders
      </p>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>
        Turn this on for whoever should be notified when a driver's license, ID, or certificate is expiring (30 and 7 days before).
      </p>
      {staff.filter(s => s.active).map(s => (
        <ToggleRow key={s.name} label={s.name} sub={s.role} on={s.receivesDriverDocumentReminders} busy={busyKey === "dd-" + s.name} onToggle={() => toggleDriverDocReminders(s)} />
      ))}

      <p style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.3, margin: "20px 0 8px" }}>
        Insurance Cover Note Reminders
      </p>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>
        Turn this on for whoever should be notified when a car's insurance cover note is expiring (30 and 7 days before).
      </p>
      {staff.filter(s => s.active).map(s => (
        <ToggleRow key={s.name} label={s.name} sub={s.role} on={s.receivesInsuranceReminders} busy={busyKey === "ins-" + s.name} onToggle={() => toggleInsuranceReminders(s)} />
      ))}

      <p style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 0.3, margin: "20px 0 8px" }}>
        Driver Record Management
      </p>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>
        Admin can always edit driver records and documents. Turn this on for specific staff who should also be able to (add/edit drivers, upload/remove documents).
      </p>
      {staff.filter(s => s.active && s.role !== "Admin").map(s => (
        <ToggleRow key={s.name} label={s.name} sub={s.role} on={s.canManageDrivers} busy={busyKey === "cmd-" + s.name} onToggle={() => toggleCanManageDrivers(s)} />
      ))}
    </div>
  );
}

function FeaturesTab() {
  const [settings, setSettings]   = useState(null);
  const [syncOn,   setSyncOn]     = useState(null);
  const [syncAvailable, setSyncAvailable] = useState(false);
  const [busy,     setBusy]       = useState(false);

  const load = () => {
    api.getSettings().then(res => setSettings(res.settings)).catch(() => {});
    // Dropbox auto-sync only exists on the retired Apps Script backend; the
    // Supabase API answers available:false and the row is hidden.
    api.getDropboxSyncStatus()
      .then(res => { setSyncOn(res.triggerActive); setSyncAvailable(res.available !== false); })
      .catch(() => setSyncOn(false));
  };
  useEffect(load, []);

  const toggleAgreement = async () => {
    setBusy(true);
    try {
      const next = String(settings.RentalAgreementEnabled).trim().toUpperCase() === "TRUE" ? "FALSE" : "TRUE";
      await api.updateSetting({ key: "RentalAgreementEnabled", value: next });
      setSettings(s => ({ ...s, RentalAgreementEnabled: next }));
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };
  const toggleSync = async () => {
    setBusy(true);
    try {
      if (syncOn) await api.disableDropboxSync(); else await api.enableDropboxSync();
      setSyncOn(!syncOn);
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  if (!settings || syncOn === null) return <p style={{ fontSize: 13, color: "#888" }}>Loading…</p>;

  const agreementOn = String(settings.RentalAgreementEnabled).trim().toUpperCase() === "TRUE";

  return (
    <div>
      <ToggleRow label="Rental Agreement Form" sub="When off, checkout completes without offering the agreement step." on={agreementOn} busy={busy} onToggle={toggleAgreement} />
      {syncAvailable && (
        <ToggleRow label="Dropbox Auto-Sync" sub="Automatically fills in Reg Card / Photos links every 5 minutes until fully synced." on={syncOn} busy={busy} onToggle={toggleSync} />
      )}
    </div>
  );
}

function ToggleRow({ label, sub, on, busy, onToggle }) {
  return (
    <div style={S.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{label}</p>
          <p style={{ fontSize: 12, color: "#888", margin: "2px 0 0" }}>{sub}</p>
        </div>
        <button type="button" disabled={busy} onClick={onToggle}
          style={{ width: 46, height: 26, borderRadius: 99, border: "none", cursor: "pointer", background: on ? "#16a34a" : "#d1d5db", position: "relative", flexShrink: 0, marginLeft: 12 }}>
          <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
        </button>
      </div>
    </div>
  );
}

// ── System tab: Dropbox sync status + Backup snapshot ──────────────────────
// ── Cover Notes tab: bulk upload + per-car overview ─────────────────────
const EXPIRY_STYLE = (expiry) => {
  if (!expiry) return { bg: "#f3f4f6", fg: "#6b7280", label: "No cover note" };
  const days = Math.floor((new Date(expiry) - new Date()) / 86400000);
  if (days < 0) return { bg: "#fee2e2", fg: "#991b1b", label: `Expired ${fmtShortDate(expiry)}` };
  if (days <= 30) return { bg: "#fef3c7", fg: "#92400e", label: `Expires ${fmtShortDate(expiry)}` };
  return { bg: "#dcfce7", fg: "#166534", label: `Valid until ${fmtShortDate(expiry)}` };
};
function fmtShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function CoverNotesTab({ staffName }) {
  const [fleetStatus, setFleetStatus] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  const load = () => {
    api.getFleetCoverNoteStatus(staffName).then(res => setFleetStatus(res.data || [])).catch(() => setFleetStatus([]));
  };
  useEffect(load, []);

  const missing = fleetStatus ? fleetStatus.filter(c => !c.hasCoverNote) : [];

  return (
    <div>
      <button type="button" style={S.primaryBtn} onClick={() => setShowUpload(true)}>+ Bulk Upload Cover Note PDFs</button>

      {fleetStatus === null ? <p style={{ fontSize: 13, color: "#888" }}>Loading…</p> : (
        <>
          <p style={S.sectionTitle}>{missing.length} car{missing.length === 1 ? "" : "s"} with no cover note on file</p>
          {missing.length > 0 && (
            <div style={{ ...S.listBox, marginBottom: 16 }}>
              {missing.map(c => (
                <div key={c.plate} style={S.listRow}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.plate}</div>
                  <div style={{ fontSize: 11, color: "#888", marginLeft: 6 }}>{c.type}</div>
                </div>
              ))}
            </div>
          )}

          <p style={S.sectionTitle}>All Cars</p>
          <div style={{ ...S.listBox, maxHeight: 320 }}>
            {fleetStatus.map(c => {
              const st = EXPIRY_STYLE(c.currentExpiry);
              return (
                <div key={c.plate} style={S.listRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.plate}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{c.type}{c.currentInsurer ? ` · ${c.currentInsurer}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.fg, whiteSpace: "nowrap" }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showUpload && <BulkUploadCoverNotesModal staffName={staffName} onClose={() => { setShowUpload(false); load(); }} />}
    </div>
  );
}

function BulkUploadCoverNotesModal({ staffName, onClose }) {
  const [fleet, setFleet] = useState([]);
  const [files, setFiles] = useState([]); // source File objects picked
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [items, setItems] = useState([]); // review items
  const [err, setErr] = useState("");

  useEffect(() => {
    api.getFleet().then(res => setFleet(res.data || [])).catch(() => {});
  }, []);

  const plateOptions = useMemo(() => fleet.map(c => c.plate).filter(Boolean).sort(), [fleet]);
  const normalizedPlateMap = useMemo(() => {
    const map = {};
    plateOptions.forEach(p => { map[p.replace(/\s+/g, "").toUpperCase()] = p; });
    return map;
  }, [plateOptions]);

  const matchPlates = (guesses) => (guesses || [])
    .map(g => normalizedPlateMap[String(g).replace(/\s+/g, "").toUpperCase()])
    .filter(Boolean);

  const startScan = async () => {
    if (files.length === 0) { setErr("Choose at least one PDF file first."); return; }
    setScanning(true); setErr("");
    const collected = [];
    try {
      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        setScanProgress(`Splitting ${file.name} (${fi + 1} of ${files.length})…`);
        const chunks = await splitIntoCoverNoteChunks(file);
        for (let ci = 0; ci < chunks.length; ci++) {
          setScanProgress(`${file.name}: reading cover note ${ci + 1} of ${chunks.length}…`);
          try {
            const res = await api.scanCoverNote({ staffName, fileBase64: chunks[ci].base64, filename: chunks[ci].filename });
            collected.push({
              id: `${fi}-${ci}-${Date.now()}`, previewFileId: res.previewFileId, previewFileUrl: res.previewFileUrl,
              sourceLabel: `${file.name} (${chunks[ci].pageRange})`,
              plates: matchPlates(res.plates), rawPlates: res.plates || [],
              startDate: res.startDate || "", expiryDate: res.expiryDate || "",
              insurerName: res.insurerName || "", coverNoteNumber: res.coverNoteNumber || "",
              status: "pending",
            });
          } catch (e) {
            collected.push({
              id: `${fi}-${ci}-${Date.now()}`, previewFileId: null, previewFileUrl: null,
              sourceLabel: `${file.name} (${chunks[ci].pageRange})`, plates: [], rawPlates: [],
              startDate: "", expiryDate: "", insurerName: "", coverNoteNumber: "", status: "error", error: e.message,
            });
          }
        }
      }
      setItems(collected);
    } catch (e) {
      setErr(e.message);
    } finally {
      setScanning(false); setScanProgress("");
    }
  };

  const updateItem = (id, patch) => setItems(list => list.map(it => it.id === id ? { ...it, ...patch } : it));

  const confirmItem = async (item) => {
    if (!item.plates.length) { updateItem(item.id, { error: "Select at least one car." }); return; }
    updateItem(item.id, { busy: true, error: "" });
    try {
      await api.confirmCoverNote({
        staffName, previewFileId: item.previewFileId, plates: item.plates,
        startDate: item.startDate || null, expiryDate: item.expiryDate || null,
        insurerName: item.insurerName, coverNoteNumber: item.coverNoteNumber,
      });
      updateItem(item.id, { status: "confirmed", busy: false });
    } catch (e) {
      updateItem(item.id, { busy: false, error: e.message });
    }
  };
  const discardItem = async (item) => {
    updateItem(item.id, { busy: true });
    try {
      if (item.previewFileId) await api.discardCoverNotePreview({ staffName, previewFileId: item.previewFileId });
      updateItem(item.id, { status: "discarded", busy: false });
    } catch (e) {
      updateItem(item.id, { busy: false, error: e.message });
    }
  };

  const pendingCount = items.filter(it => it.status === "pending").length;
  const allDone = items.length > 0 && pendingCount === 0;

  return (
    <div style={S.overlay} onClick={scanning ? undefined : onClose}>
      <div style={{ ...S.modal, width: 620 }} onClick={e => e.stopPropagation()}>
        <div style={S.head}>
          <p style={S.title}>Bulk Upload Cover Notes</p>
          {!scanning && <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>}
        </div>
        <div style={{ ...S.body, maxHeight: "75vh" }}>
          {items.length === 0 ? (
            <>
              <p style={{ fontSize: 12.5, color: "#888", margin: "0 0 12px" }}>
                Select all your cover note PDFs at once. Each is automatically split into 2-page cover notes, read, and matched to a car — you'll confirm each match before anything is filed.
              </p>
              <input type="file" accept="application/pdf,.pdf" multiple disabled={scanning}
                onChange={e => setFiles(Array.from(e.target.files || []))} style={{ ...S.input, marginBottom: 10 }} />
              {files.length > 0 && <p style={{ fontSize: 12, color: "#555", margin: "0 0 10px" }}>{files.length} file{files.length === 1 ? "" : "s"} selected</p>}
              {err && <p style={S.err}>{err}</p>}
              {scanning && <p style={{ fontSize: 12.5, color: "#7c3aed", margin: "0 0 10px" }}>{scanProgress}</p>}
              <button type="button" style={{ ...S.primaryBtn, marginBottom: 0, opacity: scanning ? 0.65 : 1 }} disabled={scanning} onClick={startScan}>
                {scanning ? "Reading…" : "Split & Scan"}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: "#888", margin: "0 0 12px" }}>
                {pendingCount} of {items.length} still need review{allDone ? " — all done." : "."}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map(item => (
                  <CoverNoteReviewRow key={item.id} item={item} plateOptions={plateOptions}
                    onChange={patch => updateItem(item.id, patch)}
                    onConfirm={() => confirmItem(item)} onDiscard={() => discardItem(item)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CoverNoteReviewRow({ item, plateOptions, onChange, onConfirm, onDiscard }) {
  const [plateQuery, setPlateQuery] = useState("");
  const [viewing, setViewing] = useState(false);

  if (item.status === "confirmed") {
    return <div style={{ border: "1px solid #dcfce7", background: "#f0fdf4", borderRadius: 9, padding: 10, fontSize: 12.5, color: "#166534" }}>✅ {item.sourceLabel} — filed under {item.plates.join(", ")}</div>;
  }
  if (item.status === "discarded") {
    return <div style={{ border: "1px solid #f3f4f6", background: "#fafafa", borderRadius: 9, padding: 10, fontSize: 12.5, color: "#888" }}>Discarded — {item.sourceLabel}</div>;
  }
  if (item.status === "error") {
    return <div style={{ border: "1px solid #fee2e2", background: "#fef2f2", borderRadius: 9, padding: 10, fontSize: 12.5, color: "#991b1b" }}>Could not read {item.sourceLabel}: {item.error}</div>;
  }

  const suggestions = plateQuery ? plateOptions.filter(p => p.replace(/\s+/g, "").toUpperCase().includes(plateQuery.replace(/\s+/g, "").toUpperCase())).slice(0, 8) : [];

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{item.sourceLabel}</span>
        <button type="button" style={S.smallLink} onClick={() => setViewing(true)}>View PDF</button>
      </div>

      {item.rawPlates.length > 0 && item.plates.length === 0 && (
        <p style={{ fontSize: 11, color: "#b45309", margin: "0 0 6px" }}>Read as "{item.rawPlates.join(", ")}" — no exact match in the fleet, pick manually below.</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
        {item.plates.map(p => (
          <span key={p} style={{ fontSize: 11.5, fontWeight: 600, background: "#ede9fe", color: "#7c3aed", padding: "3px 8px", borderRadius: 999, display: "flex", alignItems: "center", gap: 5 }}>
            {p}
            <button type="button" onClick={() => onChange({ plates: item.plates.filter(x => x !== p) })} style={{ background: "none", border: "none", cursor: "pointer", color: "#7c3aed", fontSize: 12, padding: 0 }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <input value={plateQuery} onChange={e => setPlateQuery(e.target.value)} placeholder="Add a car (search plate)…" style={S.input} />
        {suggestions.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 7, marginTop: 2, maxHeight: 160, overflowY: "auto", zIndex: 10, boxShadow: "0 4px 14px rgba(0,0,0,0.1)" }}>
            {suggestions.map(p => (
              <button type="button" key={p} onClick={() => { if (!item.plates.includes(p)) onChange({ plates: [...item.plates, p] }); setPlateQuery(""); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", fontSize: 12.5, border: "none", background: "none", cursor: "pointer" }}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div><label style={S.label}>Start Date</label><input type="date" value={item.startDate} onChange={e => onChange({ startDate: e.target.value })} style={S.input} /></div>
        <div><label style={S.label}>Expiry Date</label><input type="date" value={item.expiryDate} onChange={e => onChange({ expiryDate: e.target.value })} style={S.input} /></div>
        <div><label style={S.label}>Insurer</label><input value={item.insurerName} onChange={e => onChange({ insurerName: e.target.value })} style={S.input} /></div>
        <div><label style={S.label}>Cover Note #</label><input value={item.coverNoteNumber} onChange={e => onChange({ coverNoteNumber: e.target.value })} style={S.input} /></div>
      </div>

      {item.error && <p style={S.err}>{item.error}</p>}
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" disabled={item.busy} onClick={onConfirm}
          style={{ ...S.primaryBtn, marginBottom: 0, padding: "7px 14px", fontSize: 12.5, opacity: item.busy ? 0.65 : 1 }}>
          {item.busy ? "Filing…" : "File Under Selected Car(s)"}
        </button>
        <button type="button" disabled={item.busy} onClick={onDiscard}
          style={{ padding: "7px 14px", fontSize: 12.5, color: "#666", background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 7, cursor: "pointer" }}>
          Discard
        </button>
      </div>

      {viewing && item.previewFileUrl && (
        <div style={S.overlay} onClick={() => setViewing(false)}>
          <div style={{ ...S.modal, width: "min(90vw, 700px)", height: "80vh" }} onClick={e => e.stopPropagation()}>
            <div style={S.head}><p style={S.title}>{item.sourceLabel}</p><button type="button" style={S.closeBtn} onClick={() => setViewing(false)}>✕</button></div>
            <iframe title="Cover note preview" src={item.previewFileUrl} style={{ flex: 1, border: "none", width: "100%" }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SystemTab() {
  const [status,   setStatus]   = useState(null);
  const [backing,  setBacking]  = useState(false);
  const [backupUrl, setBackupUrl] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.getDropboxSyncStatus().then(res => setStatus(res)).catch(() => {});
    api.getSystemHealth().then(res => setHealth(res)).catch(() => {});
  }, []);

  const runBackup = async () => {
    setBacking(true); setBackupUrl(null);
    try { const res = await api.createBackupSnapshot(); setBackupUrl(res.url); }
    catch (e) { alert(e.message); }
    finally { setBacking(false); }
  };

  // "Stale" if the last successful run is more than ~10 hours old — the
  // cron fires 3x/day (roughly every 5-6h during the day), so anything
  // beyond that gap means at least one run was missed.
  const lastRunAgeHours = health?.lastCronRun
    ? (Date.now() - new Date(health.lastCronRun.createdAt).getTime()) / 3600000
    : null;
  const cronStale = lastRunAgeHours != null && lastRunAgeHours > 10;
  const storagePct = health ? Math.min(100, (health.storageMB / 500) * 100) : 0;

  return (
    <div>
      {health && (
        <div style={S.section}>
          <p style={S.sectionTitle}>Systems Health</p>
          <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.8 }}>
            <div>
              Scheduled notifications:{" "}
              {health.lastCronRun ? (
                <strong style={{ color: health.lastCronRun.status === "success" && !cronStale ? "#16a34a" : "#dc2626" }}>
                  {health.lastCronRun.status === "success" && !cronStale ? "Running normally" : cronStale ? "No recent run — check Vercel Cron" : "Last run failed"}
                </strong>
              ) : (
                <strong style={{ color: "#888" }}>No runs recorded yet</strong>
              )}
            </div>
            {health.lastCronRun && (
              <div style={{ fontSize: 11.5, color: "#888" }}>
                Last run: {new Date(health.lastCronRun.createdAt).toLocaleString("en-TZ")}
                {health.lastCronRun.detail ? ` — ${health.lastCronRun.detail}` : ""}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              Database storage: <strong>{health.storageMB.toFixed(0)} MB</strong> / 500 MB (free tier)
            </div>
            <div style={{ width: "100%", height: 6, background: "#e5e7eb", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
              <div style={{ width: `${storagePct}%`, height: "100%", background: storagePct > 70 ? "#dc2626" : storagePct > 50 ? "#d97706" : "#16a34a" }} />
            </div>
            {health.trackSolid && (
              <div style={{ marginTop: 10 }}>
                Tracker integration (TrackSolid):{" "}
                {health.trackSolid.configured ? (
                  <strong style={{ color: "#16a34a" }}>✓ Configured</strong>
                ) : (
                  <strong style={{ color: "#dc2626" }}>
                    ✗ Missing: {health.trackSolid.missing.join(", ")}
                  </strong>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {status && status.available !== false && (
      <div style={S.section}>
        <p style={S.sectionTitle}>Dropbox Sync Status</p>
        {!status.status ? (
          <p style={{ fontSize: 13, color: "#888" }}>No sync has run yet.</p>
        ) : (
          <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
            <div>Reg Cards: <strong>{status.status.regDone}/{status.status.regTotal}</strong> folders done</div>
            <div>Photos: <strong>{status.status.picsDone ? "Done" : "Pending"}</strong></div>
            <div>Last run: {new Date(status.status.lastRun).toLocaleString("en-TZ")}</div>
            <div>Auto-sync trigger: <strong style={{ color: status.triggerActive ? "#16a34a" : "#888" }}>{status.triggerActive ? "Active" : "Off"}</strong></div>
          </div>
        )}
      </div>
      )}

      <div style={S.section}>
        <p style={S.sectionTitle}>Backup</p>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>Downloads a dated snapshot of every table (fleet, history, bookings, fuel, config…) as a single JSON file.</p>
        <button type="button" style={{ ...S.primaryBtn, opacity: backing ? 0.65 : 1 }} disabled={backing} onClick={runBackup}>
          {backing ? "Creating backup…" : "📦 Create Backup Snapshot Now"}
        </button>
        {backupUrl && (
          <p style={{ fontSize: 12, marginTop: 8 }}>
            ✅ Ready — <a href={backupUrl} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>Download backup</a>
          </p>
        )}
      </div>
    </div>
  );
}

const S = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 },
  modal:   { background: "#fff", borderRadius: 14, width: 480, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" },
  head:    { padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#7c3aed", flexShrink: 0 },
  title:   { fontSize: 16, fontWeight: 700, color: "#fff", margin: 0 },
  closeBtn:{ background: "rgba(255,255,255,0.25)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  tabBar:  { display: "flex", borderBottom: "1px solid #f3f4f6", flexShrink: 0 },
  tabBtn:  { flex: 1, padding: "10px 6px", fontSize: 13, fontWeight: 600, background: "none", border: "none", borderBottom: "2px solid transparent", color: "#888", cursor: "pointer" },
  tabBtnActive: { color: "#7c3aed", borderBottom: "2px solid #7c3aed" },
  body:    { padding: "1.1rem 1.25rem", overflowY: "auto", flex: 1 },
  section: { marginBottom: "1.1rem", paddingBottom: "1.1rem", borderBottom: "1px solid #f3f4f6" },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: ".4px", margin: "0 0 8px" },
  listBox: { border: "1px solid #f3f4f6", borderRadius: 8, maxHeight: 180, overflowY: "auto" },
  listRow: { display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: "1px solid #f9fafb" },
  primaryBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 7, cursor: "pointer", marginBottom: 12 },
  smallLink: { fontSize: 12, color: "#7c3aed", background: "none", border: "none", cursor: "pointer", marginTop: 6, padding: 0, fontWeight: 600 },
  miniBtn: { padding: "4px 8px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", flexShrink: 0 },
  field:   { marginBottom: "0.85rem" },
  label:   { fontSize: 12, fontWeight: 500, color: "#555", display: "block", marginBottom: 4 },
  input:   { width: "100%", padding: "8px 10px", fontSize: 13, border: "1.5px solid #e5e7eb", borderRadius: 7, background: "#fff", color: "#111", boxSizing: "border-box", fontFamily: "inherit" },
  err:     { color: "#dc2626", fontSize: 13, margin: "6px 0" },
};
