import { useState, useEffect } from "react";
import { api } from "../lib/api";
import AddCarModal from "./AddCarModal";
import { toTitleCase } from "../lib/textFormat";

const TABS = [
  { key: "fleet",    label: "Fleet"    },
  { key: "staff",    label: "Staff"    },
  { key: "features", label: "Features" },
  { key: "system",   label: "System"   },
];

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState("fleet");
  const [config, setConfig] = useState({ locations: [], garages: [], drivers: [] });

  const loadConfig = () => {
    api.getConfig().then(res => setConfig(res)).catch(() => {});
  };
  useEffect(loadConfig, []);

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.head}>
          <p style={S.title}>⚙️ Admin Panel</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
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
          {tab === "staff"    && <StaffTab />}
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
      <ConfigListEditor title="Drivers"   type="Driver"   values={config.drivers   || []} onChanged={onConfigChanged} />

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
function StaffTab() {
  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

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

  return (
    <div>
      <button type="button" style={S.primaryBtn} onClick={() => setShowAdd(true)}>+ Add Staff</button>

      {loading ? <p style={{ fontSize: 13, color: "#888" }}>Loading…</p> : (
        <div style={S.listBox}>
          {staff.map(s => (
            <div key={s.name} style={{ ...S.listRow, opacity: s.active ? 1 : 0.55 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{s.role}{!s.active && " · Deactivated"}</div>
              </div>
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
function FeaturesTab() {
  const [settings, setSettings]   = useState(null);
  const [syncOn,   setSyncOn]     = useState(null);
  const [busy,     setBusy]       = useState(false);

  const load = () => {
    api.getSettings().then(res => setSettings(res.settings)).catch(() => {});
    api.getDropboxSyncStatus().then(res => setSyncOn(res.triggerActive)).catch(() => {});
  };
  useEffect(load, []);

  const toggleAgreement = async () => {
    setBusy(true);
    try {
      const next = settings.RentalAgreementEnabled === "TRUE" ? "FALSE" : "TRUE";
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

  const agreementOn = settings.RentalAgreementEnabled === "TRUE";

  return (
    <div>
      <ToggleRow label="Rental Agreement Form" sub="When off, checkout completes without offering the agreement step." on={agreementOn} busy={busy} onToggle={toggleAgreement} />
      <ToggleRow label="Dropbox Auto-Sync" sub="Automatically fills in Reg Card / Photos links every 5 minutes until fully synced." on={syncOn} busy={busy} onToggle={toggleSync} />
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
function SystemTab() {
  const [status,   setStatus]   = useState(null);
  const [backing,  setBacking]  = useState(false);
  const [backupUrl, setBackupUrl] = useState(null);

  useEffect(() => {
    api.getDropboxSyncStatus().then(res => setStatus(res)).catch(() => {});
  }, []);

  const runBackup = async () => {
    setBacking(true); setBackupUrl(null);
    try { const res = await api.createBackupSnapshot(); setBackupUrl(res.url); }
    catch (e) { alert(e.message); }
    finally { setBacking(false); }
  };

  return (
    <div>
      <div style={S.section}>
        <p style={S.sectionTitle}>Dropbox Sync Status</p>
        {!status ? <p style={{ fontSize: 13, color: "#888" }}>Loading…</p> : !status.status ? (
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

      <div style={S.section}>
        <p style={S.sectionTitle}>Backup</p>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>Creates a full, dated copy of every sheet in Drive (SmilesCars/Backups).</p>
        <button type="button" style={{ ...S.primaryBtn, opacity: backing ? 0.65 : 1 }} disabled={backing} onClick={runBackup}>
          {backing ? "Creating backup…" : "📦 Create Backup Snapshot Now"}
        </button>
        {backupUrl && (
          <p style={{ fontSize: 12, marginTop: 8 }}>
            ✅ Saved — <a href={backupUrl} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>Open backup</a>
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
