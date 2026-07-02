// src/components/Layout.jsx
import { NavLink } from "react-router-dom";

export default function Layout({ children, staffName, role, onSignOut, logo }) {
  const roleBadge = {
    Admin:   { bg: "#7c3aed", color: "#fff" },
    Manager: { bg: "#0284c7", color: "#fff" },
    Staff:   { bg: "#e5e7eb", color: "#555" },
  }[role] || { bg: "#e5e7eb", color: "#555" };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 10 }}>
        <div className="sc-header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            {logo
              ? <img src={logo} alt="SmilesCars" style={{ height: 38, width: "auto", objectFit: "contain", borderRadius: 8 }} />
              : <div style={{ width: 38, height: 38, borderRadius: 10, background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>S</div>
            }
            <div>
              <div className="sc-brand-name">SmilesCars Fleet Manager</div>
              <div className="sc-brand-sub">Fleet Operations</div>
            </div>
          </div>
          <nav className="sc-nav">
            <NavLink to="/"         style={navStyle} end>Fleet</NavLink>
            <NavLink to="/history"  style={navStyle}>History</NavLink>
            <NavLink to="/clients"  style={navStyle}>Clients</NavLink>
            <NavLink to="/sub-hire" style={navStyle}>Sub-Hire</NavLink>
            <NavLink to="/fuel"     style={navStyle}>Fuel</NavLink>
            <NavLink to="/sold"     style={navStyle}>Sold</NavLink>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#1d4ed8", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {staffName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="sc-user-name">{staffName}</div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px", background: roleBadge.bg, color: roleBadge.color, padding: "1px 6px", borderRadius: 4, display: "inline-block", marginTop: 2 }}>{role}</div>
            </div>
            <button className="sc-sign-out" onClick={onSignOut}>↩</button>
          </div>
        </div>
      </header>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.25rem 1rem" }}>{children}</main>
    </div>
  );
}

function navStyle({ isActive }) {
  return {
    fontSize: 14, fontWeight: 500, textDecoration: "none",
    color: isActive ? "#16a34a" : "#555",
    borderBottom: isActive ? "2px solid #16a34a" : "2px solid transparent",
    paddingBottom: 4,
  };
}
