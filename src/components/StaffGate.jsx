// src/components/StaffGate.jsx
import { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function StaffGate({ onConfirm, logo }) {
  const [staff,    setStaff]    = useState([]);
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    api.getConfig()
      .then(res => setStaff(res.staff || []))
      .catch(() => setError("Could not load staff list. Check your connection."))
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = async () => {
    setError("");
    if (!selected)        { setError("Please select your name."); return; }
    if (!password.trim()) { setError("Please enter your password."); return; }
    setSaving(true);
    try {
      const res = await api.verifyStaff({ name: selected, password });
      console.log("verifyStaff response:", JSON.stringify(res));
      if (res.success) {
        // Explicitly read role — fallback chain to handle any serialisation issue
        const role = (res.role && res.role.trim().length > 0)
          ? res.role.trim()
          : "Staff";
        onConfirm(selected, role);
      } else {
        setError(res.message || "Incorrect password. Please try again.");
      }
    } catch (e) {
      setError("Login failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          {logo
            ? <img src={logo} alt="SmilesCars" style={styles.logoImg} />
            : <div style={styles.logoFallback}>S</div>
          }
        </div>
        <h1 style={styles.title}>SmilesCars Fleet Manager</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        {loading ? (
          <p style={styles.loading}>Loading…</p>
        ) : (
          <>
            <div style={styles.field}>
              <label style={styles.label}>Your Name</label>
              <select style={styles.input} value={selected}
                onChange={e => { setSelected(e.target.value); setError(""); }}>
                <option value="">— Select your name —</option>
                {staff.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                style={styles.input}
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
              />
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button
              style={{ ...styles.btn, opacity: saving ? 0.65 : 1 }}
              onClick={handleLogin}
              disabled={saving}
            >
              {saving ? "Signing in…" : "Sign In →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay:     { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0fdf4" },
  card:        { background: "#fff", borderRadius: 16, padding: "2.5rem 2rem", width: 380, maxWidth: "92vw", textAlign: "center", boxShadow: "0 4px 32px rgba(0,0,0,0.10)" },
  logoWrap:    { marginBottom: "1rem" },
  logoImg:     { height: 80, width: "auto", objectFit: "contain", borderRadius: 12 },
  logoFallback:{ width: 60, height: 60, borderRadius: 14, background: "#16a34a", color: "#fff", fontSize: 28, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" },
  title:       { fontSize: 20, fontWeight: 700, color: "#111", margin: "0 0 4px" },
  subtitle:    { fontSize: 14, color: "#666", margin: "0 0 1.75rem" },
  field:       { marginBottom: "1rem", textAlign: "left" },
  label:       { fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 5 },
  input:       { width: "100%", padding: "10px 12px", fontSize: 14, border: "1.5px solid #e5e7eb", borderRadius: 8, background: "#fff", color: "#111", boxSizing: "border-box" },
  btn:         { width: "100%", padding: "11px", fontSize: 15, fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4 },
  loading:     { color: "#888", fontSize: 14, margin: "1rem 0" },
  error:       { color: "#dc2626", fontSize: 13, margin: "0 0 10px", textAlign: "left" },
};
