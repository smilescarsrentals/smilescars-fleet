// src/components/Layout.jsx
import { NavLink } from "react-router-dom";

export default function Layout({ children, staffName, onSignOut }) {
  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            <div style={styles.logo}>S</div>
            <span style={styles.brandName}>Smiles Fleet</span>
          </div>
          <nav style={styles.nav}>
            <NavLink to="/"        style={navStyle} end>Fleet</NavLink>
            <NavLink to="/history" style={navStyle}>History</NavLink>
          </nav>
          <div style={styles.user}>
            <span style={styles.userName}>{staffName}</span>
            <button style={styles.signOut} onClick={onSignOut} title="Sign out">
              ↩ Switch
            </button>
          </div>
        </div>
      </header>
      <main style={styles.main}>{children}</main>
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

const styles = {
  shell:  { minHeight: "100vh", background: "#f9fafb", fontFamily: "Inter, system-ui, sans-serif" },
  header: { background: "#fff", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 10 },
  headerInner: {
    maxWidth: 1100, margin: "0 auto", padding: "0 1.25rem",
    height: 56, display: "flex", alignItems: "center", gap: 24,
  },
  brand:     { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  logo:      {
    width: 32, height: 32, borderRadius: 8, background: "#16a34a",
    color: "#fff", fontWeight: 700, fontSize: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  brandName: { fontWeight: 700, fontSize: 16, color: "#111" },
  nav:       { display: "flex", gap: 24 },
  user:      { display: "flex", alignItems: "center", gap: 10 },
  userName:  { fontSize: 13, color: "#555" },
  signOut:   {
    fontSize: 12, color: "#888", background: "none", border: "none",
    cursor: "pointer", padding: "4px 8px",
  },
  main: { maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1.25rem" },
};
