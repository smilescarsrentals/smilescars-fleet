// src/components/StaffGate.jsx
import { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function StaffGate({ onConfirm }) {
  const [staff, setStaff]         = useState([]);
  const [selected, setSelected]   = useState("");
  const [newName, setNewName]     = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    api.getConfig()
      .then(res => setStaff(res.staff || []))
      .catch(() => setError("Could not load staff list. Check your connection."))
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async () => {
    setError("");
    const name = addingNew ? newName.trim() : selected;
    if (!name) { setError("Please select or enter your name."); return; }

    if (addingNew) {
      setSaving(true);
      try {
        await api.addStaff(name);
      } catch (e) {
        setError("Could not save new staff name: " + e.message);
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    onConfirm(name);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.logo}>S</div>
        <h1 style={styles.title}>Smiles Fleet</h1>
        <p style={styles.subtitle}>Who's logged in today?</p>

        {loading ? (
          <p style={styles.loading}>Loading staff list…</p>
        ) : (
          <>
            {!addingNew ? (
              <select
                style={styles.select}
                value={selected}
                onChange={e => {
                  if (e.target.value === "__new__") { setAddingNew(true); setSelected(""); }
                  else setSelected(e.target.value);
                }}
              >
                <option value="">— Select your name —</option>
                {staff.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="__new__">+ Add new staff member</option>
              </select>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...styles.select, flex: 1 }}
                  placeholder="Enter full name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConfirm()}
                  autoFocus
                />
                <button style={styles.cancelBtn} onClick={() => setAddingNew(false)}>✕</button>
              </div>
            )}

            {error && <p style={styles.error}>{error}</p>}

            <button
              style={{ ...styles.btn, opacity: saving ? 0.6 : 1 }}
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving ? "Saving…" : "Continue →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    minHeight: "100vh", display: "flex", alignItems: "center",
    justifyContent: "center", background: "#f5f5f4",
  },
  card: {
    background: "#fff", borderRadius: 16, padding: "2.5rem 2rem",
    width: 360, maxWidth: "92vw", textAlign: "center",
    boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
  },
  logo: {
    width: 52, height: 52, borderRadius: 14, background: "#16a34a",
    color: "#fff", fontSize: 26, fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 1rem",
  },
  title:    { fontSize: 22, fontWeight: 700, color: "#111", margin: "0 0 4px" },
  subtitle: { fontSize: 14, color: "#666", margin: "0 0 1.5rem" },
  select: {
    width: "100%", padding: "10px 12px", fontSize: 14,
    border: "1.5px solid #e5e7eb", borderRadius: 8,
    background: "#fff", color: "#111", marginBottom: 12,
  },
  btn: {
    width: "100%", padding: "11px", fontSize: 15, fontWeight: 600,
    background: "#16a34a", color: "#fff", border: "none",
    borderRadius: 8, cursor: "pointer", marginTop: 4,
  },
  cancelBtn: {
    padding: "10px 14px", fontSize: 14, border: "1.5px solid #e5e7eb",
    borderRadius: 8, background: "#fff", cursor: "pointer", color: "#666",
    marginBottom: 12,
  },
  loading: { color: "#888", fontSize: 14, margin: "1rem 0" },
  error:   { color: "#dc2626", fontSize: 13, margin: "6px 0" },
};
