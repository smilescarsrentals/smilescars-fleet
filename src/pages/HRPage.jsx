import { useState, useEffect } from "react";
import { api } from "../lib/api";

// Stage 1: access gate only. hr_access "View" vs "Edit" will matter once
// there's actually something to edit (Stage 2+) — for now this just checks
// the person is allowed in at all.
export default function HRPage({ staffName, role }) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(role === "Admin" ? "Edit" : "None");

  useEffect(() => {
    if (role === "Admin") { setLoading(false); return; }
    api.getStaffList().then(res => {
      const me = (res.staff || []).find(s => s.name.trim().toLowerCase() === staffName.trim().toLowerCase());
      setAccess(me?.hrAccess || "None");
    }).catch(() => setAccess("None")).finally(() => setLoading(false));
  }, [staffName, role]);

  if (loading) return <div style={{ padding: 24, fontSize: 13, color: "#888" }}>Loading…</div>;

  if (access === "None") {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>HR</h2>
        <p style={{ fontSize: 13, color: "#888" }}>You don't have access to the HR module.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>HR</h2>
      <p style={{ fontSize: 13, color: "#888" }}>
        Staff profiles, leave approvals, disciplinary records, and onboarding checklists will live here. Coming soon
        {access === "View" ? " — you'll have view-only access." : "."}
      </p>
    </div>
  );
}
