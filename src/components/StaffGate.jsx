import { useState, useEffect } from "react";
import { api } from "../lib/api";

export default function StaffGate({ onConfirm, logo }) {
  const [staff,    setStaff]    = useState([]);
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    api.getConfig()
      .then(c => { setStaff(c.staff || []); setLoading(false); })
      .catch(() => { setError("Could not load staff list. Check your connection."); setLoading(false); });
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
        const role = (res.role && res.role.trim().length > 0) ? res.role.trim() : "Staff";
        onConfirm(selected, role, res.fuelAccess || []);
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
    <div style={S.overlay}>
      <div style={S.card}>
        <div style={S.logoWrap}>
          {logo ? <img src={logo} alt="SmilesCars" style={S.logoImg} /> : <div style={S.logoFallback}>S</div>}
        </div>
        <h1 style={S.title}>SmilesCars Fleet Manager</h1>
        <p style={S.subtitle}>Sign in to continue</p>
        {loading ? <p style={S.loading}>Loading…</p> : (<>
          <div style={S.field}>
            <label style={S.label}>Your Name</label>
            <select style={S.input} value={selected} onChange={e => setSelected(e.target.value)}>
              <option value="">— Select your name —</option>
              {staff.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={S.field}>
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" placeholder="Enter your password"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          {error && <p style={S.error}>{error}</p>}
          <button style={{ ...S.btn, opacity: saving ? 0.7 : 1 }} onClick={handleLogin} disabled={saving}>
            {saving ? "Signing in…" : "Sign In →"}
          </button>
        </>)}
      </div>
    </div>
  );
}

const S = {
  overlay:     { minHeight: "100vh", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  card:        { background: "#fff", borderRadius: 16, padding: "2.5rem 2rem", width: 420, maxWidth: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" },
  logoWrap:    { textAlign: "center", marginBottom: 16 },
  logoImg:     { height: 90, width: "auto", borderRadius: 16 },
  logoFallback:{ width: 80, height: 80, borderRadius: 16, background: "#16a34a", color: "#fff", fontSize: 36, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  title:       { fontSize: 22, fontWeight: 700, color: "#111", textAlign: "center", margin: "0 0 4px" },
  subtitle:    { fontSize: 14, color: "#888", textAlign: "center", margin: "0 0 24px" },
  field:       { marginBottom: 16 },
  label:       { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 },
  input:       { width: "100%", padding: "11px 14px", fontSize: 14, border: "1.5px solid #e5e7eb", borderRadius: 10, background: "#fff", color: "#111", boxSizing: "border-box" },
  error:       { color: "#dc2626", fontSize: 13, margin: "0 0 12px", textAlign: "center" },
  btn:         { width: "100%", padding: 13, fontSize: 15, fontWeight: 700, background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" },
  loading:     { textAlign: "center", color: "#888", fontSize: 14 },
};
