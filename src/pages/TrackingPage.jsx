import { useState, useEffect } from "react";
import { api } from "../lib/api";

// Phase 1 of the GPS tracker integration: a human-confirmed matching step
// between TrackSolid's device list and our own Fleet plates. Nothing here
// auto-saves — every match, even an obvious one, needs a click to confirm.
// This is intentionally the whole page for now; daily mileage / the 100km
// alert land here once matching is done and proven reliable.
export default function TrackingPage({ staffName }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null); // { confirmed, suggested, unmatchedDevices, unmatchedFleetPlates }
  const [checked, setChecked] = useState({}); // imei -> bool, which suggested rows to confirm on next save

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getTrackerMatchSuggestions();
      setData(res);
      // Default every suggested (auto-matched) row to checked — the person
      // un-checks anything they don't want confirmed, rather than having
      // to check 40+ obvious matches one by one.
      const initChecked = {};
      (res.suggested || []).forEach((s) => { initChecked[s.imei] = true; });
      setChecked(initChecked);
    } catch (e) {
      setError(e.message || "Couldn't load tracker data.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = (imei) => setChecked((c) => ({ ...c, [imei]: !c[imei] }));

  const handleSaveChecked = async () => {
    if (!data) return;
    const matches = data.suggested
      .filter((s) => checked[s.imei])
      .map((s) => ({ imei: s.imei, deviceName: s.deviceName, plate: s.suggestedPlate }));
    if (!matches.length) return;
    setSaving(true);
    try {
      const res = await api.confirmTrackerMatches({ staffName, matches });
      await load();
      if (res.failed && res.failed.length) {
        const lines = res.failed.map((f) => `• ${f.plate || f.deviceName} — ${f.reason}`).join("\n");
        alert(`Saved ${res.saved} of ${matches.length}. ${res.failed.length} couldn't be saved:\n\n${lines}`);
      }
    } catch (e) {
      alert(e.message || "Couldn't save matches.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (plate) => {
    if (!window.confirm(`Remove the tracker match for ${plate}? You can re-match it later.`)) return;
    try {
      await api.removeTrackerMatch({ staffName, plate });
      load();
    } catch (e) {
      alert(e.message || "Couldn't remove match.");
    }
  };

  if (loading) {
    return <div style={{ padding: "2rem", textAlign: "center", color: "#888", fontSize: 14 }}>Loading tracker data…</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "1.5rem", background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 10, color: "#991b1b", fontSize: 13.5 }}>
        <strong>Couldn't reach TrackSolid.</strong> {error}
        <div style={{ marginTop: 8 }}>
          <button onClick={load} style={btnSecondary}>Try again</button>
        </div>
      </div>
    );
  }

  const { confirmed = [], suggested = [], unmatchedDevices = [], unmatchedFleetPlates = [] } = data || {};
  const checkedCount = suggested.filter((s) => checked[s.imei]).length;

  return (
    <div>
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", margin: 0 }}>📍 Tracking</h2>
        <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
          Match each GPS tracker to the correct car before mileage reports and alerts can use it.
        </p>
      </div>

      {/* Confirmed matches */}
      <Section title={`Confirmed matches (${confirmed.length})`} tint="#f0fdf4" border="#bbf7d0">
        {confirmed.length === 0 ? (
          <Empty>No cars matched yet — confirm some below to get started.</Empty>
        ) : (
          <Table>
            <thead><tr><Th>Plate</Th><Th>Tracker</Th><Th>Confirmed by</Th><Th /></tr></thead>
            <tbody>
              {confirmed.map((m) => (
                <tr key={m.imei}>
                  <Td strong>{m.plate}</Td>
                  <Td muted>{m.deviceName || m.imei}</Td>
                  <Td muted>{m.confirmedBy || "—"}</Td>
                  <Td><button onClick={() => handleRemove(m.plate)} style={btnLinkDanger}>Remove</button></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {/* Suggested matches — need confirmation */}
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

      {/* Unmatched devices */}
      <Section title={`Trackers with no plate match (${unmatchedDevices.length})`} tint="#fef2f2" border="#fecaca">
        {unmatchedDevices.length === 0 ? (
          <Empty>Every tracker matched something.</Empty>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: "#991b1b", margin: "0 0 10px" }}>
              These trackers exist on TrackSolid but their name didn't match any plate in Fleet — likely a naming
              mismatch, a sold/retired car, or a tracker not yet labeled. They're listed here rather than hidden.
            </p>
            <Table>
              <thead><tr><Th>Tracker name</Th><Th>IMEI</Th><Th>Why it's unmatched</Th></tr></thead>
              <tbody>
                {unmatchedDevices.map((d) => (
                  <tr key={d.imei}>
                    <Td muted>{d.deviceName || "—"}</Td>
                    <Td muted style={{ fontFamily: "monospace", fontSize: 12 }}>{d.imei}</Td>
                    <Td muted>{d.reason || d.deviceGroup || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Section>

      {/* Fleet cars with no tracker at all */}
      <Section title={`Fleet cars with no tracker found (${unmatchedFleetPlates.length})`} tint="#f8fafc" border="#e2e8f0">
        {unmatchedFleetPlates.length === 0 ? (
          <Empty>Every Fleet car has a tracker.</Empty>
        ) : (
          <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, margin: 0 }}>
            {unmatchedFleetPlates.join(", ")}
          </p>
        )}
      </Section>
    </div>
  );
}

// ── Small local building blocks (kept in-file, this page owns its own layout) ──
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
const btnLinkDanger = { padding: 0, fontSize: 12.5, fontWeight: 600, background: "none", color: "#dc2626", border: "none", cursor: "pointer" };
