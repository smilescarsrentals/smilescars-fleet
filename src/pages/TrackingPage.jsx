import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import MultiSelect from "../components/MultiSelect";

// Main table = confirmed matches only, joined with yesterday's mileage and
// last-synced location. Matching review (suggested/unmatched/dismissed)
// lives below it — collapsible, since it's occasional cleanup work, not
// a daily-use table. "Sync now" refreshes both mileage and location in
// one run (lib/trackerSync.js's runFullSync).
export default function TrackingPage({ staffName }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null); // { mileageDay, data: [...] }
  const [matches, setMatches] = useState(null); // { suggested, unmatchedDevices, unmatchedFleetPlates, ignored, totalDevices, dataAsOf }
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState([]); // "Over 100km" | "No movement recorded"
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortByDistance, setSortByDistance] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, matchesRes] = await Promise.all([
        api.getTrackerOverviewTable(),
        api.getTrackerMatchSuggestions(),
      ]);
      setOverview(overviewRes);
      setMatches(matchesRes);
      const initChecked = {};
      (matchesRes.suggested || []).forEach((s) => { initChecked[s.imei] = true; });
      setChecked(initChecked);
    } catch (e) {
      setError(e.message || "Couldn't load tracking data.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = (imei) => setChecked((c) => ({ ...c, [imei]: !c[imei] }));

  const handleSaveChecked = async () => {
    if (!matches) return;
    const toConfirm = matches.suggested
      .filter((s) => checked[s.imei])
      .map((s) => ({ imei: s.imei, deviceName: s.deviceName, plate: s.suggestedPlate }));
    if (!toConfirm.length) return;
    setSaving(true);
    try {
      const res = await api.confirmTrackerMatches({ staffName, matches: toConfirm });
      await load();
      if (res.failed && res.failed.length) {
        const lines = res.failed.map((f) => `• ${f.plate || f.deviceName} — ${f.reason}`).join("\n");
        alert(`Saved ${res.saved} of ${toConfirm.length}. ${res.failed.length} couldn't be saved:\n\n${lines}`);
      }
    } catch (e) {
      alert(e.message || "Couldn't save matches.");
    } finally {
      setSaving(false);
    }
  };

  const handleIgnore = async (device) => {
    try {
      await api.ignoreTrackerDevice({ staffName, imei: device.imei, deviceName: device.deviceName });
      load();
    } catch (e) {
      alert(e.message || "Couldn't dismiss this tracker.");
    }
  };

  const handleUnignore = async (imei) => {
    try {
      await api.unignoreTrackerDevice({ staffName, imei });
      load();
    } catch (e) {
      alert(e.message || "Couldn't restore this tracker.");
    }
  };

  const handleRemoveMatch = async (plate) => {
    if (!window.confirm(`Remove the tracker match for ${plate}? You can re-match it later.`)) return;
    try {
      await api.removeTrackerMatch({ staffName, plate });
      load();
    } catch (e) {
      alert(e.message || "Couldn't remove match.");
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await api.runTrackerSyncNow({ staffName });
      await load();
      let msg = `Synced ${res.day}: ${res.saved} cars' mileage updated, ${res.overLimit} over 100km, ${res.locationsUpdated} locations refreshed.`;
      if (res.batchErrors && res.batchErrors.length) {
        msg += `\n\n${res.batchErrors.length} batch(es) failed:\n` + res.batchErrors.map((e) => `• ${e}`).join("\n");
      }
      alert(msg);
    } catch (e) {
      alert(e.message || "Couldn't run the sync.");
    } finally {
      setSyncing(false);
    }
  };

  const rows = overview?.data || [];
  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const s = search.trim().toUpperCase();
      r = r.filter((c) => c.plate.toUpperCase().includes(s));
    }
    if (fStatus.includes("Over 100km")) r = r.filter((c) => c.overLimit);
    if (fStatus.includes("No movement recorded")) r = r.filter((c) => c.distanceKm == null);
    if (fStatus.includes("Currently moving")) r = r.filter((c) => c.accOn === true);
    if (sortByDistance) {
      // nulls (no data) sink to the bottom regardless of direction
      r = [...r].sort((a, b) => {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return b.distanceKm - a.distanceKm;
      });
    }
    return r;
  }, [rows, search, fStatus, sortByDistance]);

  // Reset to page 1 whenever the filtered set changes shape, so a filter
  // change never leaves the user stranded on a now-empty page.
  useEffect(() => { setPage(1); }, [search, fStatus, pageSize, sortByDistance]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  if (loading) {
    return <div style={{ padding: "2rem", textAlign: "center", color: "#888", fontSize: 14 }}>Loading tracking data…</div>;
  }
  if (error) {
    return (
      <div style={{ padding: "1.5rem", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, color: "#991b1b", fontSize: 13.5 }}>
        <strong>Couldn't reach TrackSolid.</strong> {error}
        <div style={{ marginTop: 8 }}><button onClick={load} style={btnSecondary}>Try again</button></div>
      </div>
    );
  }

  const { suggested = [], unmatchedDevices = [], unmatchedFleetPlates = [], ignored = [], totalDevices, dataAsOf } = matches || {};
  const checkedCount = suggested.filter((s) => checked[s.imei]).length;

  return (
    <div className="sc-tracking-page">
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: 0 }}>📍 Tracking</h2>
        <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
          {overview?.mileageDay ? `Mileage for ${overview.mileageDay}` : "No mileage synced yet"}
          {totalDevices != null && ` · ${totalDevices} trackers found on TrackSolid`}
          {dataAsOf && ` · data as of ${new Date(dataAsOf).toLocaleTimeString("en-TZ", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0", fontStyle: "italic" }}>
          "No movement recorded" means TrackSolid didn't log a trip for that car — it's either a genuinely quiet
          day, or the tracker had no signal. TrackSolid's mileage data only counts registered trips, not tiny
          GPS drift (confirmed 2026-08-20: a car showing 0.06km on TrackSolid's own site returned nothing from
          this same data).
        </p>
      </div>

      {/* Filter row — same visual pattern as Fleet */}
      <div className="sc-filter-row">
        <input className="sc-search" placeholder="Search plate…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <MultiSelect label="All cars" options={["Over 100km", "No movement recorded", "Currently moving"]} selected={fStatus} onChange={setFStatus} />
        <button type="button" className={`btn btn-sm ${sortByDistance ? "btn-primary" : "btn-ghost"}`} onClick={() => setSortByDistance((v) => !v)}>
          ⇅ Sort by distance
        </button>
        {(search || fStatus.length > 0) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setFStatus([]); setSortByDistance(false); }}>Clear</button>
        )}
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
          {search || fStatus.length ? `${filtered.length} of ${rows.length} tracked cars` : `${rows.length} tracked cars`}
        </span>
        <button type="button" onClick={handleSyncNow} disabled={syncing} className="btn btn-primary btn-sm">
          {syncing ? "Syncing…" : "↻ Sync now"}
        </button>
      </div>

      {/* Main table */}
      <div className="table-wrap sc-fleet-table">
        <table>
          <thead>
            <tr>{["Plate", "KM Driven (prev day)", "Current Location", ""].map((h) => <th key={h} data-label={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-faint)", fontSize: 14 }}>No cars match your filters.</td></tr>
            )}
            {pageRows.map((c) => (
              <tr key={c.plate} style={c.overLimit ? { background: "var(--red-bg, #fef2f2)" } : {}}>
                <td data-label="Plate" style={{ fontWeight: 600 }}>
                  <span style={{ cursor: "pointer", color: "var(--sc-blue)", textDecoration: "underline" }}
                    onClick={() => navigate(`/car/${encodeURIComponent(c.plate)}`)}>
                    {c.plate}
                  </span>
                </td>
                <td data-label="KM Driven (prev day)">
                  {c.distanceKm != null ? (
                    <span style={{ fontWeight: c.overLimit ? 700 : 400, color: c.overLimit ? "#dc2626" : "inherit" }}>
                      {c.distanceKm.toFixed(1)} km{c.overLimit && " ⚠️"}
                    </span>
                  ) : <span style={{ color: "var(--text-faint)", fontStyle: "italic" }} title="TrackSolid didn't log a trip for this car yesterday — either it genuinely didn't move, or its tracker had no signal that day. We can't tell which from this data.">No movement recorded</span>}
                </td>
                <td data-label="Current Location">
                  {c.lat != null ? (
                    <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer" style={{ color: "var(--sc-blue)" }}>
                      View on map ↗
                    </a>
                  ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td data-label="">
                  <button onClick={() => handleRemoveMatch(c.plate)} title="Remove tracker match" aria-label="Remove tracker match" style={btnX}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, margin: "10px 0 1.25rem" }}>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
          </span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ fontSize: 12.5, padding: "4px 8px", borderRadius: 6, border: "1.5px solid #e5e7eb" }}>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
          <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
        </div>
      )}

      {/* Suggested matches — stays visible, needs action */}
      <Section
        title={`Suggested matches (${suggested.length})`}
        tint="#fffbeb" border="#fde68a"
        action={suggested.length > 0 && (
          <button onClick={handleSaveChecked} disabled={saving || checkedCount === 0} style={btnPrimary}>
            {saving ? "Saving…" : `Confirm ${checkedCount || ""} selected`}
          </button>
        )}
      >
        {suggested.length === 0 ? (
          <Empty>Nothing waiting on confirmation right now.</Empty>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "#92700c", margin: "0 0 10px" }}>
              The tracker name looked like a plate we already have in Fleet. Review each row — untick anything
              that's wrong — then confirm.
            </p>
            <Table>
              <thead><tr><Th /><Th>Tracker name</Th><Th>Suggested plate</Th></tr></thead>
              <tbody>
                {suggested.map((s) => (
                  <tr key={s.imei}>
                    <Td><input type="checkbox" checked={!!checked[s.imei]} onChange={() => toggle(s.imei)} /></Td>
                    <Td muted>{s.deviceName}</Td>
                    <Td strong>{s.suggestedPlate}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Section>

      {/* Collapsible review sections — occasional cleanup, not daily-use */}
      <CollapsibleSection title={`Trackers with no plate match (${unmatchedDevices.length})`}>
        {unmatchedDevices.length === 0 ? (
          <Empty>Every tracker matched something.</Empty>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "#991b1b", margin: "0 0 10px" }}>
              These trackers exist on TrackSolid but their name didn't match any plate in Fleet. If it's not one
              of our fleet cars, dismiss it — reversible anytime from "Dismissed trackers" below.
            </p>
            <Table>
              <thead><tr><Th>Tracker name</Th><Th>IMEI</Th><Th>Why it's unmatched</Th><Th /></tr></thead>
              <tbody>
                {unmatchedDevices.map((d) => (
                  <tr key={d.imei}>
                    <Td muted>{d.deviceName || "—"}</Td>
                    <Td muted style={{ fontFamily: "monospace", fontSize: 12 }}>{d.imei}</Td>
                    <Td muted>{d.reason || d.deviceGroup || "—"}</Td>
                    <Td><button onClick={() => handleIgnore(d)} style={btnLinkMuted}>Not our car — dismiss</button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={`Fleet cars with no tracker found (${unmatchedFleetPlates.length})`}>
        {unmatchedFleetPlates.length === 0 ? (
          <Empty>Every Fleet car has a tracker.</Empty>
        ) : (
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, margin: 0 }}>{unmatchedFleetPlates.join(", ")}</p>
        )}
      </CollapsibleSection>

      {ignored.length > 0 && (
        <CollapsibleSection title={`Dismissed trackers (${ignored.length}) — not our cars`}>
          <Table>
            <thead><tr><Th>Tracker name</Th><Th>Dismissed by</Th><Th /></tr></thead>
            <tbody>
              {ignored.map((d) => (
                <tr key={d.imei}>
                  <Td muted>{d.deviceName || "—"}</Td>
                  <Td muted>{d.ignoredBy || "—"}</Td>
                  <Td><button onClick={() => handleUnignore(d.imei)} style={btnLinkMuted}>Bring back</button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ── Small local building blocks ─────────────────────────────────────────
function Section({ title, tint, border, action, children }) {
  return (
    <div style={{ background: tint, border: `1.5px solid ${border}`, borderRadius: 12, padding: "1.1rem 1.25rem", marginBottom: "1.1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 700, color: "#111", margin: 0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
// <details> gives free expand/collapse with no extra state — exactly the
// "expandable and closeable" behaviour asked for, and it remembers
// nothing between reloads, which is fine for occasional cleanup lists.
function CollapsibleSection({ title, children }) {
  return (
    <details style={{ marginBottom: "1.1rem", background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "0.9rem 1.1rem" }}>
      <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#334155" }}>{title}</summary>
      <div style={{ marginTop: 12 }}>{children}</div>
    </details>
  );
}
function Empty({ children }) {
  return <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>{children}</p>;
}
function Table({ children }) {
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>{children}</table></div>;
}
function Th({ children }) {
  return <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4, color: "#94a3b8", borderBottom: "1.5px solid rgba(0,0,0,0.06)" }}>{children}</th>;
}
function Td({ children, strong, muted, style }) {
  return (
    <td style={{ padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.05)", fontWeight: strong ? 700 : 400, color: muted ? "#64748b" : "#111", ...style }}>
      {children}
    </td>
  );
}

const btnPrimary = { padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "#111827", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" };
const btnSecondary = { padding: "7px 14px", fontSize: 13, fontWeight: 600, background: "#fff", color: "#111", border: "1.5px solid #e5e7eb", borderRadius: 8, cursor: "pointer" };
const btnX = { padding: 0, width: 24, height: 24, lineHeight: "22px", fontSize: 16, fontWeight: 600, background: "none", color: "#94a3b8", border: "1.5px solid #e5e7eb", borderRadius: "50%", cursor: "pointer" };
const btnLinkMuted = { padding: 0, fontSize: 12.5, fontWeight: 600, background: "none", color: "#64748b", border: "none", cursor: "pointer", textDecoration: "underline" };
