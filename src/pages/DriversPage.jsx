import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { compressImage } from "../lib/imageCompress";
import { parseDriverCsv } from "../lib/driverImport";
import { parseDriverZip } from "../lib/driverZipImport";

const DOC_TYPES = ["Driving License", "National ID (NIDA)", "TIN Certificate", "Defensive Driving Cert", "Others"];
const photoUrl = (fileId) => `/api?action=file&id=${encodeURIComponent(fileId)}`;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

// Red if expired or expiring within 7 days, amber within 30, otherwise
// neutral — mirrors the 30/7-day reminder thresholds so the visual signal
// matches what actually triggers a notification.
function expiryStyle(dateStr) {
  const days = daysUntil(dateStr);
  if (days == null) return { color: "var(--text-faint)", label: "—" };
  if (days < 0) return { color: "var(--red)", label: `Expired ${Math.abs(days)}d ago` };
  if (days <= 7) return { color: "var(--red)", label: `Expires in ${days}d` };
  if (days <= 30) return { color: "#d97706", label: `Expires in ${days}d` };
  return { color: "var(--green)", label: `Expires in ${days}d` };
}

export default function DriversPage({ staffName, role }) {
  const [canEdit, setCanEdit] = useState(role === "Admin");
  const [drivers, setDrivers] = useState([]);
  const [docsByDriver, setDocsByDriver] = useState({});
  const [currentAssignments, setCurrentAssignments] = useState([]); // live Fleet "With Client" state
  const [clientOptions, setClientOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showZipImport, setShowZipImport] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  // Filter state
  const [availabilityFilter, setAvailabilityFilter] = useState(""); // "" | "Free" | "With Client"
  const [activeFilter, setActiveFilter] = useState(""); // "" | "Active" | "Inactive"
  const [expiryFilter, setExpiryFilter] = useState(""); // "" | "Expired" | "Expiring Soon" | "OK"
  const [photoFilter, setPhotoFilter] = useState(""); // "" | "Has Photo" | "No Photo"
  const [clientMode, setClientMode] = useState("current"); // "current" | "historical"
  const [clientQuery, setClientQuery] = useState("");
  const [clientFrom, setClientFrom] = useState("");
  const [clientTo, setClientTo] = useState("");
  const [historicalDrivers, setHistoricalDrivers] = useState(null); // null = not searched yet

  useEffect(() => {
    load();
    if (role !== "Admin") {
      api.getStaffList().then(res => {
        const me = (res?.staff || []).find(s => s.name === staffName);
        if (me?.canManageDrivers) setCanEdit(true);
      }).catch(() => {});
    }
  }, []);

  async function load() {
    setLoading(true); setErr("");
    try {
      const [driversRes, docsRes, assignRes, clientsRes] = await Promise.all([
        api.getDriversV2(), api.getAllDriverDocuments(), api.getDriverCurrentAssignments(), api.getClients(),
      ]);
      setDrivers(driversRes?.data || []);
      const grouped = {};
      (docsRes?.data || []).forEach(doc => {
        (grouped[doc.driverId] ||= []).push(doc);
      });
      setDocsByDriver(grouped);
      setCurrentAssignments(assignRes?.data || []);
      setClientOptions((clientsRes?.data || []).map(c => c.name).sort());
    } catch (e) {
      setErr(e.message || "Could not load drivers.");
    } finally {
      setLoading(false);
    }
  }

  // Live "With Client" lookup — a Map from normalized driver name to their
  // current assignment, since a driver only counts as with-client if
  // Fleet shows an actively rented car against their name right now.
  const currentAssignmentByName = new Map(
    currentAssignments.map(a => [a.driverName.trim().toLowerCase(), a])
  );

  const runHistoricalSearch = async (overrideName) => {
    const name = overrideName ?? clientQuery;
    if (!name.trim()) { setHistoricalDrivers(null); return; }
    try {
      const res = await api.getDriversByClientHistory({ clientName: name, fromDate: clientFrom || undefined, toDate: clientTo || undefined });
      setHistoricalDrivers(res?.data || []);
    } catch (e) {
      setErr(e.message);
    }
  };

  const activeFilterCount = [availabilityFilter, activeFilter, expiryFilter, photoFilter, clientMode === "current" && clientQuery, clientMode === "historical" && historicalDrivers].filter(Boolean).length;

  const clearFilters = () => {
    setAvailabilityFilter(""); setActiveFilter(""); setExpiryFilter(""); setPhotoFilter("");
    setClientQuery(""); setClientFrom(""); setClientTo(""); setHistoricalDrivers(null);
  };

  const filtered = drivers
    .filter(d => !search.trim() || d.name.toLowerCase().includes(search.toLowerCase()) || (d.phone || "").includes(search))
    .filter(d => {
      if (!availabilityFilter) return true;
      const isWithClient = currentAssignmentByName.has(d.name.trim().toLowerCase());
      return availabilityFilter === "With Client" ? isWithClient : !isWithClient;
    })
    .filter(d => !activeFilter || (activeFilter === "Active" ? d.active : !d.active))
    .filter(d => {
      if (!expiryFilter) return true;
      const docs = docsByDriver[d.id] || [];
      const worst = docs.filter(doc => doc.expiryDate).sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate))[0];
      if (!worst) return false;
      const days = daysUntil(worst.expiryDate);
      if (expiryFilter === "Expired") return days < 0;
      if (expiryFilter === "Expiring Soon") return days >= 0 && days <= 30;
      return days > 30; // "OK"
    })
    .filter(d => !photoFilter || (photoFilter === "Has Photo" ? !!d.photoFileId : !d.photoFileId))
    .filter(d => {
      if (clientMode === "current" && clientQuery.trim()) {
        const a = currentAssignmentByName.get(d.name.trim().toLowerCase());
        return a && a.client.trim().toLowerCase().includes(clientQuery.trim().toLowerCase());
      }
      if (clientMode === "historical" && historicalDrivers !== null) {
        return historicalDrivers.some(h => h.driverName.trim().toLowerCase() === d.name.trim().toLowerCase());
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name)); // alphabetical, per instruction

  const selectedDriver = selectedId ? drivers.find(d => d.id === selectedId) : null;

  return (
    <div style={{ padding: "1rem 1.5rem 1.5rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 14px" }}>Driver Profile</h1>

      <div className="sc-filter-row">
        <input type="text" placeholder="Search drivers…" value={search} onChange={e => setSearch(e.target.value)}
          className="sc-search" style={S.filterInput} />

        <select value={availabilityFilter} onChange={e => setAvailabilityFilter(e.target.value)} style={S.filterInput}>
          <option value="">All Availability</option>
          <option value="Free">Free</option>
          <option value="With Client">With Client</option>
        </select>

        <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} style={S.filterInput}>
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>

        <select value={expiryFilter} onChange={e => setExpiryFilter(e.target.value)} style={S.filterInput}>
          <option value="">All Documents</option>
          <option value="Expired">Expired</option>
          <option value="Expiring Soon">Expiring Soon</option>
          <option value="OK">OK</option>
        </select>

        <select value={photoFilter} onChange={e => setPhotoFilter(e.target.value)} style={S.filterInput}>
          <option value="">All Photos</option>
          <option value="Has Photo">Has Photo</option>
          <option value="No Photo">No Photo</option>
        </select>

        <select value={clientMode} onChange={e => setClientMode(e.target.value)} style={S.filterInput}>
          <option value="current">Currently With…</option>
          <option value="historical">Was With…</option>
        </select>
        <DriverClientTypeahead value={clientQuery} onChange={setClientQuery} options={clientOptions}
          onPick={(name) => { setClientQuery(name); if (clientMode === "historical") runHistoricalSearch(name); }} />
        {clientMode === "historical" && (
          <>
            <input type="date" value={clientFrom} onChange={e => setClientFrom(e.target.value)} style={S.filterInput} title="From date" />
            <input type="date" value={clientTo} onChange={e => setClientTo(e.target.value)} style={S.filterInput} title="To date" />
            <button type="button" className="btn btn-ghost" onClick={() => runHistoricalSearch()}>Search</button>
          </>
        )}

        {activeFilterCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>✕ Clear Filters</button>
        )}
        <span className="result-count">{filtered.length} {filtered.length === 1 ? "driver" : "drivers"}</span>

        {canEdit && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setShowImport(true)}>⬆ Import CSV</button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowZipImport(true)}>📎 Import Documents (ZIP)</button>
            <button type="button" className="btn btn-add" onClick={() => setShowAdd(true)}>+ Add Driver</button>
          </>
        )}
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic", textAlign: "center", padding: "2rem 0" }}>
          {search ? "No matching drivers." : "No drivers yet."}
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
          {filtered.map(d => {
            const docs = docsByDriver[d.id] || [];
            const worstExpiry = docs.filter(doc => doc.expiryDate).sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate))[0];
            const flag = worstExpiry ? expiryStyle(worstExpiry.expiryDate) : null;
            const isUrgent = flag && (flag.label.startsWith("Expired") || flag.label.match(/in [1-7]d/));
            return (
              <button key={d.id} type="button" onClick={() => setSelectedId(d.id)} style={{
                background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10,
                padding: "12px 14px", cursor: "pointer", boxShadow: "var(--shadow-sm)",
                textAlign: "left", display: "block", width: "100%", fontFamily: "inherit",
                appearance: "none", WebkitAppearance: "none",
              }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                  {d.name}{!d.active && <span style={{ color: "var(--text-faint)", fontWeight: 500 }}> (inactive)</span>}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "3px 0 0" }}>{d.phone || "No phone on file"}</p>
                {docs.length === 0 ? (
                  <p style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic", margin: "6px 0 0" }}>No documents on file</p>
                ) : isUrgent ? (
                  <p style={{ fontSize: 11, fontWeight: 700, color: flag.color, margin: "6px 0 0" }}>⚠ {flag.label}</p>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "6px 0 0" }}>{docs.length} document{docs.length !== 1 ? "s" : ""} on file</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddDriverModal staffName={staffName} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {showImport && (
        <ImportCsvModal staffName={staffName} onClose={() => setShowImport(false)} onSaved={() => { setShowImport(false); load(); }} />
      )}
      {showZipImport && (
        <ImportZipModal staffName={staffName} drivers={drivers} onClose={() => setShowZipImport(false)} onSaved={() => { setShowZipImport(false); load(); }} />
      )}
      {selectedDriver && (
        <DriverDetailModal driver={selectedDriver} docs={docsByDriver[selectedDriver.id] || []} staffName={staffName} canEdit={canEdit}
          onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </div>
  );
}

// A plain text input with a type-ahead dropdown for picking a client name
// — used inline in the sc-filter-row, styled to match the rest of the
// app's filter controls (S.filterInput) rather than the earlier
// standalone panel design.
function DriverClientTypeahead({ value, onChange, options, onPick }) {
  const [open, setOpen] = useState(false);
  const filtered = value.trim() ? options.filter(c => c.toLowerCase().includes(value.toLowerCase())) : options;

  return (
    <div style={{ position: "relative" }}>
      <input type="text" placeholder="Client name…" value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ ...S.filterInput, minWidth: 160 }} />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, minWidth: 200, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7, boxShadow: "var(--shadow)", zIndex: 20, maxHeight: 160, overflowY: "auto" }}>
          {filtered.slice(0, 25).map(c => (
            <div key={c} style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12.5, borderBottom: "1px solid var(--border-light)" }}
              onMouseDown={() => { onPick(c); setOpen(false); }}>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddDriverModal({ staffName, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", phone: "", licenseNumber: "", nationalId: "", address: "", notes: "" });
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setPhoto({ ...compressed, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
    } catch { setErr("Could not read that file."); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("Driver name is required."); return; }
    if (!form.phone.trim()) { setErr("Phone number is required."); return; }
    setSaving(true); setErr("");
    try {
      const res = await api.addDriverV2({ ...form, staffName });
      if (photo && res.id) {
        await api.addDriverDocument({
          driverId: res.id, docType: "Driving License", staffName,
          imageBase64: photo.base64, mimeType: photo.mimeType, filename: photo.filename,
        }).catch(() => {});
      }
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Add Driver</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          <div style={S.field}>
            <label style={S.label}>License Photo/Scan (optional)</label>
            <div style={{ border: "2px dashed var(--border)", borderRadius: 10, overflow: "hidden", cursor: "pointer", position: "relative", background: "var(--bg)", minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => document.getElementById("add-driver-doc-input").click()}>
              {photo?.previewUrl ? (
                <img src={photo.previewUrl} alt="Preview" style={{ width: "100%", maxHeight: 180, objectFit: "cover" }} />
              ) : photo ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "1.25rem" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{photo.filename}</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "var(--text-faint)", padding: "1.25rem" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>Click to upload license image</div>
                  <div style={{ fontSize: 10.5, marginTop: 3 }}>JPG, PNG, PDF</div>
                </div>
              )}
              <input id="add-driver-doc-input" type="file" accept="image/*,application/pdf"
                style={{ display: "none" }} onChange={handleFile} />
            </div>
          </div>

          <div style={S.field}><label style={S.label}>Full Name *</label>
            <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} placeholder="As on driving license" autoFocus /></div>
          <div style={S.field}><label style={S.label}>Phone Number *</label>
            <input style={S.input} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+255…" /></div>
          <div style={S.field}><label style={S.label}>License Number</label>
            <input style={S.input} value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} placeholder="Driving license number" /></div>
          <div style={S.field}><label style={S.label}>National ID</label>
            <input style={S.input} value={form.nationalId} onChange={e => set("nationalId", e.target.value)} /></div>
          <div style={S.field}><label style={S.label}>Address</label>
            <input style={S.input} value={form.address} onChange={e => set("address", e.target.value)} /></div>
          <div style={S.field}><label style={S.label}>Notes</label>
            <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" style={{ ...S.btn, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Add Driver"}
          </button>
        </div>
      </div>
    </div>
  );
}

// CSV import: parse -> review (valid rows shown editable, errors shown
// separately and skipped, per instruction) -> confirm -> bulk create.
// Nothing is saved until Confirm; parsing happens entirely client-side
// (src/lib/driverImport.js), so the backend only ever receives clean,
// already-reviewed row objects.
function ImportCsvModal({ staffName, onClose, onSaved }) {
  const [rows, setRows] = useState(null); // null = no file parsed yet
  const [errors, setErrors] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { created, failed } after confirm

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setErr(""); setResult(null);
    try {
      const parsed = await parseDriverCsv(file);
      setRows(parsed.rows);
      setErrors(parsed.errors);
    } catch (ex) {
      setErr("Could not read that file — make sure it's a valid CSV.");
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (i, patch) => {
    setRows(list => list.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };

  const removeRow = (i) => {
    setRows(list => list.filter((_, idx) => idx !== i));
  };

  const handleConfirm = async () => {
    setSaving(true); setErr("");
    try {
      const res = await api.bulkAddDrivers({ rows, staffName });
      setResult(res);
      if (res.failed.length === 0) {
        onSaved();
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Plain client-side CSV generation — matches the exact headers
  // parseDriverCsv's HEADER_ALIASES recognizes, with two example rows so
  // the expected format (including how to leave optional fields blank)
  // is obvious without needing separate written instructions.
  const handleDownloadTemplate = () => {
    const headers = ["Name", "Phone", "License Number", "National ID", "Address"];
    const example = [
      ["John Mwangi", "+255700111222", "DL12345", "NIDA9988", "Dar es Salaam"],
      ["Jane Doe", "0700333444", "", "", ""],
    ];
    const escapeCell = (v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = [headers, ...example].map(row => row.map(escapeCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "driver_import_template.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Import Drivers from CSV</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          {rows === null ? (
            <>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
                CSV columns: <strong>Name, Phone</strong> (required), License Number, National ID, Address (optional).
                Column names are matched flexibly — "Phone", "Phone Number", "Mobile" all work.
              </p>
              <button type="button" onClick={handleDownloadTemplate} style={{ fontSize: 12, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 12, display: "block" }}>
                ⬇ Download CSV Template
              </button>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={parsing}
                style={{ fontSize: 13, fontFamily: "inherit" }} />
              {parsing && <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>Reading file…</p>}
              {err && <p style={S.err}>{err}</p>}
            </>
          ) : result ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--green)", margin: "0 0 8px" }}>
                ✓ Created {result.created.length} driver{result.created.length !== 1 ? "s" : ""}
              </p>
              {result.failed.length > 0 && (
                <>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", margin: "12px 0 6px" }}>
                    {result.failed.length} row{result.failed.length !== 1 ? "s" : ""} failed
                  </p>
                  <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden" }}>
                    {result.failed.map((f, i) => (
                      <div key={i} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                        Row {f.rowNum} ({f.name || "no name"}): {f.reason}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button type="button" style={{ ...S.btn, background: "var(--sc-blue)" }} onClick={onSaved}>Done</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>
                {rows.length} row{rows.length !== 1 ? "s" : ""} ready to import
              </p>
              {errors.length > 0 && (
                <p style={{ fontSize: 12, color: "var(--red)", margin: "0 0 10px" }}>
                  {errors.length} row{errors.length !== 1 ? "s" : ""} skipped (missing name or phone) — these won't be imported.
                </p>
              )}

              {rows.length > 0 && (
                <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, maxHeight: 280, overflowY: "auto", marginBottom: 10 }}>
                  {rows.map((r, i) => (
                    <div key={i} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-light)", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10.5, color: "var(--text-faint)", width: 24, flexShrink: 0 }}>#{r.rowNum}</span>
                      <input style={{ ...S.input, flex: 1.3 }} value={r.name} onChange={e => updateRow(i, { name: e.target.value })} placeholder="Name" />
                      <input style={{ ...S.input, flex: 1 }} value={r.phone} onChange={e => updateRow(i, { phone: e.target.value })} placeholder="Phone" />
                      <button type="button" onClick={() => removeRow(i)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {errors.length > 0 && (
                <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                  {errors.map((e, i) => (
                    <p key={i} style={{ fontSize: 11.5, color: "var(--red)", margin: "2px 0" }}>Row {e.rowNum}: {e.reason}</p>
                  ))}
                </div>
              )}

              {err && <p style={S.err}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setRows(null); setErrors([]); }}>Choose Different File</button>
                <button type="button" style={{ ...S.btn, flex: 1, marginTop: 0, background: "var(--sc-blue)", opacity: saving || rows.length === 0 ? 0.65 : 1 }}
                  disabled={saving || rows.length === 0} onClick={handleConfirm}>
                  {saving ? "Importing…" : `Import ${rows.length} Driver${rows.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ZIP document import: parse -> review (matched entries grouped by driver,
// unmatched shown separately with the reason, per instruction) -> confirm
// -> bulk upload. Matching happens entirely client-side against the
// already-loaded driver list, so the backend only ever receives
// confirmed, already-matched entries.
function ImportZipModal({ staffName, drivers, onClose, onSaved }) {
  const [matched, setMatched] = useState(null); // null = no file parsed yet
  const [unmatched, setUnmatched] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setErr(""); setResult(null);
    try {
      const parsed = await parseDriverZip(file, drivers);
      setMatched(parsed.matched);
      setUnmatched(parsed.unmatched);
    } catch (ex) {
      setErr("Could not read that file — make sure it's a valid ZIP.");
    } finally {
      setParsing(false);
    }
  };

  const removeEntry = (i) => {
    setMatched(list => list.filter((_, idx) => idx !== i));
  };

  const handleConfirm = async () => {
    setSaving(true); setErr("");
    try {
      const entries = matched.map(m => ({
        driverId: m.driverId, driverName: m.driverName, docType: m.docType, label: m.label || "",
        filename: m.filename, imageBase64: m.base64, mimeType: m.mimeType,
      }));
      const res = await api.bulkAddDriverDocuments({ entries, staffName });
      setResult(res);
      if (res.failed.length === 0) onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Import Documents from ZIP</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          {matched === null ? (
            <>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
                Each file inside the ZIP should be named <strong>"Name - Document Type.ext"</strong> — e.g.
                "John Mwangi - Driving License.pdf". The name must match an existing driver exactly.
                Accepted files: PDF, JPG, PNG.
              </p>
              <input type="file" accept=".zip" onChange={handleFile} disabled={parsing}
                style={{ fontSize: 13, fontFamily: "inherit" }} />
              {parsing && <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>Reading ZIP…</p>}
              {err && <p style={S.err}>{err}</p>}
            </>
          ) : result ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--green)", margin: "0 0 8px" }}>
                ✓ Uploaded {result.uploaded.length} document{result.uploaded.length !== 1 ? "s" : ""}
              </p>
              {result.failed.length > 0 && (
                <>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", margin: "12px 0 6px" }}>
                    {result.failed.length} failed
                  </p>
                  <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden" }}>
                    {result.failed.map((f, i) => (
                      <div key={i} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                        {f.filename} ({f.driverName}): {f.reason}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <button type="button" style={{ ...S.btn, background: "var(--sc-blue)" }} onClick={onSaved}>Done</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>
                {matched.length} document{matched.length !== 1 ? "s" : ""} matched and ready to upload
              </p>
              {unmatched.length > 0 && (
                <p style={{ fontSize: 12, color: "var(--red)", margin: "0 0 10px" }}>
                  {unmatched.length} file{unmatched.length !== 1 ? "s" : ""} couldn't be matched — see below, these won't be uploaded.
                </p>
              )}

              {matched.length > 0 && (
                <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, maxHeight: 240, overflowY: "auto", marginBottom: 10 }}>
                  {matched.map((m, i) => (
                    <div key={i} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, margin: 0 }}>{m.driverName}</p>
                        <p style={{ fontSize: 11, color: "var(--text-faint)", margin: "2px 0 0" }}>{m.docType} — {m.filename}</p>
                      </div>
                      <button type="button" onClick={() => removeEntry(i)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {unmatched.length > 0 && (
                <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                  {unmatched.map((u, i) => (
                    <p key={i} style={{ fontSize: 11.5, color: "var(--red)", margin: "2px 0" }}>{u.filename}: {u.reason}</p>
                  ))}
                </div>
              )}

              {err && <p style={S.err}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setMatched(null); setUnmatched([]); }}>Choose Different File</button>
                <button type="button" style={{ ...S.btn, flex: 1, marginTop: 0, background: "var(--sc-blue)", opacity: saving || matched.length === 0 ? 0.65 : 1 }}
                  disabled={saving || matched.length === 0} onClick={handleConfirm}>
                  {saving ? "Uploading…" : `Upload ${matched.length} Document${matched.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Splits a multi-page PDF into separate documents, one per page — per
// instruction, since a single scanned PDF can contain a License on page
// 1, a National ID on page 2, etc., and there's no way to know that
// automatically. Staff picks the type for each rendered page before
// anything saves. Reuses bulkAddDriverDocuments (built for ZIP import) --
// its {driverId, docType, filename, imageBase64, mimeType} entry shape
// is already generic enough for this, no backend change needed.
function SplitPdfModal({ driverId, driverName, staffName, onClose, onSaved }) {
  const [pages, setPages] = useState(null); // [{ pageNum, dataUrl, blob, docType, include }]
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setErr(""); setResult(null);
    try {
      // Dynamic import — pdf.js is a genuinely large library (1MB+ worker
      // included), so it should only load for the rare staff member who
      // actually uses Split PDF, not bundled into everyone who opens
      // Drivers. A static top-level import here previously pushed
      // DriversPage to 614KB and re-triggered the chunk-size warning the
      // earlier code-splitting work was specifically meant to avoid.
      const { splitPdfIntoPages } = await import("../lib/pdfSplit");
      const rendered = await splitPdfIntoPages(file);
      setPages(rendered.map(p => ({ ...p, docType: "Driving License", include: true })));
    } catch (ex) {
      setErr(ex.message || "Could not read that PDF.");
    } finally {
      setParsing(false);
    }
  };

  const updatePage = (i, patch) => {
    setPages(list => list.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  };

  const handleConfirm = async () => {
    const included = pages.filter(p => p.include);
    if (included.length === 0) { setErr("Select at least one page to save."); return; }
    setSaving(true); setErr("");
    try {
      const { pageToUploadPayload } = await import("../lib/pdfSplit");
      const entries = await Promise.all(included.map(async (p, i) => {
        const upload = await pageToUploadPayload(p, driverName, i);
        return { driverId, driverName, docType: p.docType, label: p.label || "", filename: upload.filename, imageBase64: upload.base64, mimeType: upload.mimeType };
      }));
      const res = await api.bulkAddDriverDocuments({ entries, staffName });
      setResult(res);
      if (res.failed.length === 0) onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 560 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>Split PDF into Documents</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>
          {pages === null ? (
            <>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 12px" }}>
                If one PDF has several documents scanned together (e.g. License on page 1, National ID on page 2),
                this splits each page into its own document — you'll pick the type for each page before saving.
              </p>
              <input type="file" accept=".pdf,application/pdf" onChange={handleFile} disabled={parsing}
                style={{ fontSize: 13, fontFamily: "inherit" }} />
              {parsing && <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 8 }}>Reading PDF…</p>}
              {err && <p style={S.err}>{err}</p>}
            </>
          ) : result ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--green)", margin: "0 0 8px" }}>
                ✓ Saved {result.uploaded.length} document{result.uploaded.length !== 1 ? "s" : ""}
              </p>
              {result.failed.length > 0 && (
                <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden", marginTop: 8 }}>
                  {result.failed.map((f, i) => (
                    <div key={i} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                      {f.filename}: {f.reason}
                    </div>
                  ))}
                </div>
              )}
              <button type="button" style={{ ...S.btn, background: "var(--sc-blue)" }} onClick={onSaved}>Done</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>
                {pages.length} page{pages.length !== 1 ? "s" : ""} found — pick a type for each, uncheck any you don't need
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto", marginBottom: 10 }}>
                {pages.map((p, i) => (
                  <div key={p.pageNum} style={{ border: "1px solid var(--border-light)", borderRadius: 8, padding: 8, display: "flex", gap: 10, opacity: p.include ? 1 : 0.5 }}>
                    <img src={p.dataUrl} alt={`Page ${p.pageNum}`} style={{ width: 60, height: 78, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border-light)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 6, cursor: "pointer" }}>
                        <input type="checkbox" checked={p.include} onChange={e => updatePage(i, { include: e.target.checked })} style={{ width: 14, height: 14, cursor: "pointer" }} />
                        Page {p.pageNum}
                      </label>
                      <select style={{ ...S.input, fontSize: 12 }} value={p.docType} disabled={!p.include} onChange={e => updatePage(i, { docType: e.target.value })}>
                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {p.docType === "Others" && (
                        <input style={{ ...S.input, fontSize: 12, marginTop: 6 }} placeholder="What is this document?"
                          value={p.label || ""} disabled={!p.include} onChange={e => updatePage(i, { label: e.target.value })} />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {err && <p style={S.err}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setPages(null); setErr(""); }}>Choose Different File</button>
                <button type="button" style={{ ...S.btn, flex: 1, marginTop: 0, background: "var(--sc-blue)", opacity: saving ? 0.65 : 1 }}
                  disabled={saving} onClick={handleConfirm}>
                  {saving ? "Saving…" : `Save ${pages.filter(p => p.include).length} Document${pages.filter(p => p.include).length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DriverDetailModal({ driver, docs, staffName, canEdit, onClose, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(driver);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setErr("");
    try {
      await api.editDriver({ id: driver.id, ...form, staffName });
      onChanged();
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handlePhotoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true); setErr("");
    try {
      const compressed = await compressImage(file);
      await api.setDriverPhoto({ driverId: driver.id, imageBase64: compressed.base64, mimeType: compressed.mimeType, filename: compressed.filename, staffName });
      onChanged();
    } catch (ex) {
      setErr("Could not upload photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <div>
            <p style={S.mTitle}>{driver.name}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", margin: "2px 0 0" }}>{driver.phone || "No phone on file"}</p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            {canEdit && !editing && (
              <button type="button" onClick={() => setEditing(true)} style={{
                background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 20,
                padding: "5px 12px", cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
              }}>
                Edit Details
              </button>
            )}
            <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={S.mBody}>
          {!editing ? (
            <>
              <div style={{ display: "flex", gap: 14, marginBottom: 4 }}>
                <div style={{ flexShrink: 0 }}>
                  <div onClick={() => driver.photoFileId ? setViewingPhoto(true) : (canEdit && document.getElementById("driver-photo-input").click())} style={{
                    width: 84, height: 84, borderRadius: 10, overflow: "hidden", background: "var(--bg)",
                    border: "1.5px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: (canEdit || driver.photoFileId) ? "pointer" : "default", position: "relative",
                  }}>
                    {driver.photoFileId ? (
                      <img src={photoUrl(driver.photoFileId)} alt={driver.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : uploadingPhoto ? (
                      <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Uploading…</span>
                    ) : (
                      <span style={{ fontSize: 24, color: "var(--text-faint)" }}>📷</span>
                    )}
                  </div>
                  {canEdit && driver.photoFileId && (
                    <button type="button" onClick={() => document.getElementById("driver-photo-input").click()}
                      style={{ fontSize: 10.5, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer", padding: "3px 0 0", display: "block" }}>
                      Change photo
                    </button>
                  )}
                  {canEdit && (
                    <input id="driver-photo-input" type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoFile} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {[
                    ["Phone", driver.phone || "—"],
                    ["License Number", driver.licenseNumber || "—"],
                    ["National ID", driver.nationalId || "—"],
                    ["Address", driver.address || "—"],
                    ["Notes", driver.notes || "—"],
                    ["Status", driver.active ? "Active" : "Inactive"],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
                      <span style={{ color: "var(--text-muted)" }}>{label}</span>
                      <span style={{ fontWeight: 600, textAlign: "right" }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              <DriverDocuments driverId={driver.id} driverName={driver.name} docs={docs} canEdit={canEdit} staffName={staffName}
                addingDoc={addingDoc} setAddingDoc={setAddingDoc} onChanged={onChanged} />

              <DriverAssignmentLog driverName={driver.name} />

              {viewingPhoto && driver.photoFileId && (
                <DocumentViewerModal
                  doc={{ fileId: driver.photoFileId, fileMimeType: "image/jpeg", docType: `${driver.name} — Profile Photo` }}
                  onClose={() => setViewingPhoto(false)}
                />
              )}
            </>
          ) : (
            <>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>Name</label>
                  <input style={S.input} value={form.name} onChange={e => set("name", e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>Phone</label>
                  <input style={S.input} value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
              </div>
              <div style={S.two}>
                <div style={S.field}><label style={S.label}>License Number</label>
                  <input style={S.input} value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} /></div>
                <div style={S.field}><label style={S.label}>National ID</label>
                  <input style={S.input} value={form.nationalId} onChange={e => set("nationalId", e.target.value)} /></div>
              </div>
              <div style={S.field}><label style={S.label}>Address</label>
                <input style={S.input} value={form.address} onChange={e => set("address", e.target.value)} /></div>
              <div style={S.field}><label style={S.label}>Notes</label>
                <textarea style={S.textarea} rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 500, color: "var(--text-muted)", cursor: "pointer", marginBottom: 10 }}>
                <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                Active
              </label>

              {err && <p style={S.err}>{err}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setEditing(false); setForm(driver); }}>Cancel</button>
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

function DriverDocuments({ driverId, driverName, docs, canEdit, staffName, addingDoc, setAddingDoc, onChanged }) {
  const [newDoc, setNewDoc] = useState({ docType: "Driving License", label: "", expiryDate: "", notes: "" });
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [showSplitPdf, setShowSplitPdf] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setPhoto({ ...compressed, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
    } catch { setErr("Could not read that file."); }
  };

  const handleAdd = async () => {
    if (!newDoc.docType) { setErr("Document type is required."); return; }
    setSaving(true); setErr("");
    try {
      await api.addDriverDocument({
        driverId, docType: newDoc.docType, label: newDoc.label, expiryDate: newDoc.expiryDate, notes: newDoc.notes,
        staffName, imageBase64: photo?.base64, mimeType: photo?.mimeType, filename: photo?.filename,
      });
      setNewDoc({ docType: "Driving License", label: "", expiryDate: "", notes: "" });
      setPhoto(null);
      setAddingDoc(false);
      onChanged();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await api.deleteDriverDocument({ id, staffName }); onChanged(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3 }}>Documents</span>
        {!addingDoc && canEdit && (
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setShowSplitPdf(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>Split PDF</button>
            <button type="button" onClick={() => setAddingDoc(true)} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>+ Add Document</button>
          </div>
        )}
        {addingDoc && (
          <button type="button" onClick={() => { setAddingDoc(false); setErr(""); setPhoto(null); setNewDoc({ docType: "Driving License", label: "", expiryDate: "", notes: "" }); }}
            style={{ fontSize: 13, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>✕</button>
        )}
      </div>

      {docs.length === 0 && !addingDoc ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No documents on file</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {docs.map(doc => (
            <DocumentThumbnail key={doc.id} doc={doc} canEdit={canEdit} onOpen={() => setViewingDoc(doc)} onDelete={() => handleDelete(doc.id)} />
          ))}
        </div>
      )}

      {viewingDoc && <DocumentViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />}

      {addingDoc && (
        <div style={{ border: "1.5px solid var(--sc-blue)", borderRadius: 8, padding: 10, marginTop: 8 }}>
          <div style={S.field}>
            <label style={S.label}>Type</label>
            <select style={S.input} value={newDoc.docType} onChange={e => setNewDoc(n => ({ ...n, docType: e.target.value }))}>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {newDoc.docType === "Others" && (
            <div style={S.field}><label style={S.label}>Label</label>
              <input style={S.input} value={newDoc.label} onChange={e => setNewDoc(n => ({ ...n, label: e.target.value }))} placeholder="e.g. First Aid Certificate" /></div>
          )}
          <div style={S.field}><label style={S.label}>Expiry Date (optional)</label>
            <div style={{ overflow: "hidden", borderRadius: 7, width: "100%" }}>
              <input style={{ ...S.input, display: "block", width: "100%", maxWidth: "100%", boxSizing: "border-box", fontSize: 16 }}
                type="date" value={newDoc.expiryDate} onChange={e => setNewDoc(n => ({ ...n, expiryDate: e.target.value }))} />
            </div>
          </div>

          <div style={S.field}>
            <label style={S.label}>Photo/Scan (optional)</label>
            <div style={{ border: "2px dashed var(--border)", borderRadius: 10, overflow: "hidden", cursor: "pointer", position: "relative", background: "var(--bg)", minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick={() => document.getElementById("driver-doc-input").click()}>
              {photo?.previewUrl ? (
                <img src={photo.previewUrl} alt="Preview" style={{ width: "100%", maxHeight: 180, objectFit: "cover" }} />
              ) : photo ? (
                <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "1.25rem" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📄</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{photo.filename}</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", color: "var(--text-faint)", padding: "1.25rem" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>📷</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>Click to upload document</div>
                  <div style={{ fontSize: 10.5, marginTop: 3 }}>JPG, PNG, PDF</div>
                </div>
              )}
              <input id="driver-doc-input" type="file" accept="image/*,application/pdf"
                style={{ display: "none" }} onChange={handleFile} />
            </div>
          </div>

          {err && <p style={S.err}>{err}</p>}
          <button type="button" disabled={saving} style={{ width: "100%", padding: "9px 0", fontSize: 12.5, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.65 : 1, marginTop: 8, fontFamily: "inherit" }} onClick={handleAdd}>
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      )}

      {showSplitPdf && (
        <SplitPdfModal driverId={driverId} driverName={driverName} staffName={staffName}
          onClose={() => setShowSplitPdf(false)} onSaved={() => { setShowSplitPdf(false); onChanged(); }} />
      )}
    </div>
  );
}

// Built entirely from existing checkout/transfer history — not a
// separately maintained field, so it can never drift from what actually
// happened and needs zero manual entry from staff.
function DriverAssignmentLog({ driverName }) {
  const [log, setLog] = useState(null);

  useEffect(() => {
    api.getDriverAssignmentLog(driverName).then(res => setLog(res?.data || [])).catch(() => setLog([]));
  }, [driverName]);

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  };

  const current = log && log.length > 0 ? log[0] : null;

  return (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.3, margin: "0 0 8px" }}>
        Client Assignments
      </p>

      {log === null ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Loading…</p>
      ) : log.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic" }}>No assignment history yet — this fills in automatically after this driver is used on a checkout.</p>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: "var(--blue-bg, #eff6ff)", borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>Current / Most Recent</span>
            <span style={{ fontWeight: 700 }}>{current.client || "—"}</span>
          </div>

          <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
            {log.map((entry, i) => (
              <div key={i} style={{ padding: "7px 10px", borderBottom: "1px solid var(--border-light)", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{entry.client || "—"}</span>
                  <span style={{ color: "var(--text-faint)" }}>{entry.plate}</span>
                </div>
                <p style={{ color: "var(--text-faint)", margin: "2px 0 0" }}>
                  {fmtDate(entry.bookedFrom)} → {fmtDate(entry.returnDate)} · {entry.action}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Popup viewer for a document — shown instead of just opening the raw
// file in a new tab, per instruction. Download uses serveFile's existing
// ?download=1 query param (already supported server-side via
// Content-Disposition: attachment, just never used from the frontend
// before this). Share uses the native Web Share API where the browser
// supports it (mobile browsers, mainly) — falls back to copying the
// link, since not every desktop browser implements navigator.share.
// Real thumbnail for every document, including PDFs — per instruction.
// Images just use a plain <img>. PDFs need their bytes actually fetched
// and the first page rendered via pdf.js, which is dynamically imported
// (same reasoning as SplitPdfModal: pdf.js is 1MB+ including its worker,
// so it should only load for drivers who actually have a PDF document,
// not bundled into everyone who opens Drivers).
function DocumentThumbnail({ doc, canEdit, onOpen, onDelete }) {
  const [pdfThumb, setPdfThumb] = useState(null); // data URL once rendered
  const [pdfFailed, setPdfFailed] = useState(false);
  const flag = expiryStyle(doc.expiryDate);
  const isImage = doc.fileMimeType && doc.fileMimeType.startsWith("image/");
  const isPdf = doc.fileMimeType === "application/pdf";

  useEffect(() => {
    if (!isPdf || !doc.fileId) return;
    let cancelled = false;
    (async () => {
      try {
        const { renderPdfFirstPageThumbnail } = await import("../lib/pdfSplit");
        const res = await fetch(photoUrl(doc.fileId));
        if (!res.ok) throw new Error("Could not fetch file");
        const blob = await res.blob();
        const dataUrl = await renderPdfFirstPageThumbnail(blob);
        if (!cancelled) setPdfThumb(dataUrl);
      } catch {
        if (!cancelled) setPdfFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isPdf, doc.fileId]);

  return (
    <div style={{ border: "1px solid var(--border-light)", borderRadius: 8, overflow: "hidden", position: "relative" }}>
      <button type="button" onClick={onOpen} disabled={!doc.fileId} style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: doc.fileId ? "pointer" : "default", fontFamily: "inherit" }}>
        <div style={{ width: "100%", aspectRatio: "4/3", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {doc.fileId && isImage ? (
            <img src={photoUrl(doc.fileId)} alt={doc.docType} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : doc.fileId && isPdf && pdfThumb ? (
            <img src={pdfThumb} alt={doc.docType} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : doc.fileId && isPdf && !pdfFailed ? (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Loading…</span>
          ) : doc.fileId ? (
            <span style={{ fontSize: 30 }}>📄</span>
          ) : (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>No file</span>
          )}
        </div>
      </button>
      <div style={{ padding: "7px 8px" }}>
        <p style={{ fontSize: 11.5, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {doc.docType === "Others" && doc.label ? doc.label : doc.docType}
        </p>
        {doc.expiryDate && <p style={{ fontSize: 10, color: flag.color, margin: "2px 0 0" }}>{flag.label}</p>}
      </div>
      {canEdit && (
        <button type="button" onClick={onDelete} style={{
          position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.55)", border: "none", color: "#fff",
          borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 12, lineHeight: 1,
        }}>✕</button>
      )}
    </div>
  );
}

function DocumentViewerModal({ doc, onClose }) {
  const [copied, setCopied] = useState(false);
  const isImage = doc.fileMimeType && doc.fileMimeType.startsWith("image/");
  const isPdf = doc.fileMimeType === "application/pdf";
  const viewUrl = photoUrl(doc.fileId);
  const downloadUrl = `${viewUrl}&download=1`;
  const title = doc.docType === "Others" && doc.label ? doc.label : doc.docType;

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${viewUrl}`;
    if (navigator.share) {
      try { await navigator.share({ title, url: shareUrl }); }
      catch { /* user cancelled the native share sheet — not an error */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* clipboard blocked — nothing more we can do here */ }
    }
  };

  return (
    <div style={{ ...S.overlay, zIndex: 200 }} onClick={onClose}>
      <div style={{ ...S.modal, width: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ ...S.mHead, background: "var(--sc-blue)" }}>
          <p style={S.mTitle}>{title}</p>
          <button type="button" style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: "1rem 1.25rem" }}>
          <div style={{ width: "100%", maxHeight: 420, background: "var(--bg)", borderRadius: 8, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            {isImage ? (
              <img src={viewUrl} alt={title} style={{ width: "100%", maxHeight: 420, objectFit: "contain" }} />
            ) : isPdf ? (
              <embed src={viewUrl} type="application/pdf" style={{ width: "100%", height: 420 }} />
            ) : (
              <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--text-faint)" }}>
                <div style={{ fontSize: 40 }}>📄</div>
                <p style={{ fontSize: 12, marginTop: 8 }}>Preview not available for this file type</p>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={downloadUrl} style={{ ...S.btn, flex: 1, marginTop: 0, textAlign: "center", textDecoration: "none", background: "var(--sc-blue)", display: "block" }}>
              ⬇ Download
            </a>
            <button type="button" onClick={handleShare} style={{ ...S.btn, flex: 1, marginTop: 0, background: "var(--green)" }}>
              {copied ? "Link copied!" : "↗ Share"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  filterInput: { padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 7, fontSize: 13, minWidth: 110 },
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
