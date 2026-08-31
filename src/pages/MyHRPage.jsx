import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HR_ENABLED_LOCATIONS } from "../components/ActionModal";

// Stage 1 of the HR module: just the access gate, wired correctly, so
// Stage 3 (leave requests) and beyond can drop straight into this shell
// without redoing permission checks. This is a personal area — any active
// Dar-tagged staff member can be here regardless of hr_access, since
// requesting your OWN leave isn't an HR-management action.
export default function MyHRPage({ staffName, role }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(role === "Admin");

  useEffect(() => {
    if (role === "Admin") { setLoading(false); return; }
    api.getStaffList().then(res => {
      const me = (res.staff || []).find(s => s.name.trim().toLowerCase() === staffName.trim().toLowerCase());
      setAllowed(!!me && me.active && HR_ENABLED_LOCATIONS.includes(me.location));
    }).catch(() => setAllowed(false)).finally(() => setLoading(false));
  }, [staffName, role]);

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
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>My HR</h2>
      <p style={{ fontSize: 13, color: "#888" }}>
        This is where you'll be able to submit and track your own leave requests, and view your own record. Coming soon.
      </p>
    </div>
  );
}
