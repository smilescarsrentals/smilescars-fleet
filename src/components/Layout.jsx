// src/components/Layout.jsx
import { NavLink } from "react-router-dom";

export default function Layout({ children, staffName, onSignOut, logo }) {
  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand}>
            {logo
              ? <img src={logo} alt="SmilesCars" style={styles.logoImg} />
              : <div style={styles.logoFallback}>S</div>
            }
            <div>
              <div style={styles.brandName}>SmilesCars Fleet Manager</div>
              <div style={styles.brandSub}>Fleet Operations</div>
            </div>
          </div>
          <nav style={styles.nav}>
            <NavLink to="/"        style={navStyle} end>Fleet</NavLink>
            <NavLink to="/history" style={navStyle}>History</NavLink>
            <NavLink to="/sold"    style={navStyle}>Sold</NavLink>
          </nav>
          <div style={styles.user}>
            <div style={styles.userAvatar}>{staffName.charAt(0).toUpperCase()}</div>
            <span style={styles.userName}>{staffName}</span>
            <button style={styles.signOut} onClick={onSignOut}>↩ Sign out</button>
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
  shell:       { minHeight: "100vh", background: "#f9fafb", fontFamily: "Inter, system-ui, sans-serif" },
  header:      { background: "#fff", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0, zIndex: 10 },
  headerInner: { maxWidth: 1200, margin: "0 auto", padding: "0 1.25rem", height: 62, display: "flex", alignItems: "center", gap: 24 },
  brand:       { display: "flex", alignItems: "center", gap: 10, flex: 1 },
  logoImg:     { height: 42, width: "auto", objectFit: "contain", borderRadius: 8 },
  logoFallback:{ width: 42, height: 42, borderRadius: 10, background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" },
  brandName:   { fontWeight: 700, fontSize: 15, color: "#111", lineHeight: 1.2 },
  brandSub:    { fontSize: 11, color: "#888", marginTop: 1 },
  nav:         { display: "flex", gap: 24 },
  user:        { display: "flex", alignItems: "center", gap: 8 },
  userAvatar:  { width: 30, height: 30, borderRadius: "50%", background: "#1d4ed8", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" },
  userName:    { fontSize: 13, color: "#555", fontWeight: 500 },
  signOut:     { fontSize: 12, color: "#888", background: "none", border: "1px solid #e5e7eb", cursor: "pointer", padding: "4px 10px", borderRadius: 6 },
  main:        { maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1.25rem" },
};
