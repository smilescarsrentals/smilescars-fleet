// src/components/Layout.jsx
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../lib/api";
import AdminPanel from "./AdminPanel";

// "2026-07-22" via new Date(str) parses as UTC midnight, not local midnight —
// in a UTC+3 timezone (Tanzania) that silently adds most of a day to every
// "days until pickup" calculation, making "Tomorrow" show as "In 2 days" etc.
// Parsing the parts manually always constructs local midnight instead.
function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(val) {
  if (!val) return "—";
  const d = String(val).split("T")[0];
  if (!d || d.length < 10) return val;
  const [y, m, dd] = d.split("-");
  return `${dd}-${m}-${y}`;
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-TZ", { day:"2-digit", month:"short", year:"numeric" }) +
    " " + d.toLocaleTimeString("en-TZ", { hour:"2-digit", minute:"2-digit" });
}

const ACTION_COLORS = {
  "Checked Out":         { bg:"#fef9c3", color:"#854d0e" },
  "Returned":            { bg:"#dcfce7", color:"#15803d" },
  "Booking Extended":    { bg:"#e0f2fe", color:"#0369a1" },
  "Sent to Maintenance": { bg:"#ffedd5", color:"#c2410c" },
  "Marked Available":    { bg:"#dcfce7", color:"#15803d" },
  "Staff Use":           { bg:"#eff6ff", color:"#1d4ed8" },
  "Location Updated":    { bg:"#f3f4f6", color:"#374151" },
  "Payment Updated":     { bg:"#ede9fe", color:"#6d28d9" },
  "Sold":                { bg:"#fee2e2", color:"#b91c1c" },
  "Note Added":          { bg:"#f0fdf4", color:"#15803d" },
};

// Small inline icon set — avoids adding an icon-library dependency to the project.
const Icon = {
  dashboard: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  fleet: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M3 13l1.5-5A2 2 0 016.4 6.5h11.2A2 2 0 0119.5 8l1.5 5"/><rect x="2.5" y="13" width="19" height="6" rx="1.5"/><circle cx="7" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/></svg>,
  reservations: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>,
  history: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>,
  clients: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.4"/><path d="M16 14.2c2.8.4 4.7 2.4 4.7 5.3"/></svg>,
  subhire: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
  fuel: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M6 21V8.5A2.5 2.5 0 018.5 6H12a2.5 2.5 0 012.5 2.5V21"/><path d="M4.5 21h10"/><path d="M14.5 10h1.7L19 12.7V17a1.5 1.5 0 01-3 0"/><circle cx="9" cy="4" r="1.4"/></svg>,
  sold: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M20.6 12.8l-7.8 7.8a2 2 0 01-2.8 0l-6.8-6.8a2 2 0 010-2.8l7.8-7.8H18a2.6 2.6 0 012.6 2.6v6z"/><circle cx="15.5" cy="8.5" r="1.4"/></svg>,
  blacklist: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>,
  search: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  bell: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M18 8a6 6 0 10-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14 18 8z"/><path d="M10.3 20a1.8 1.8 0 003.4 0"/></svg>,
  menu: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>,
};

const NAV_GROUPS = [
  { label: "Main", items: [
    { to: "/",          key: "dashboard", label: "Dashboard", icon: Icon.dashboard, end: true },
    { to: "/fleet",     key: "fleet",     label: "Fleet",     icon: Icon.fleet },
    { to: "/reservations", key: "reservations", label: "Reservations", icon: Icon.reservations, badgeKey: "urgent" },
    { to: "/clients",   key: "clients",   label: "Clients",   icon: Icon.clients },
  ]},
  { label: "Operations", items: [
    { to: "/history",  key: "history",  label: "History",  icon: Icon.history },
    { to: "/sub-hire", key: "subhire",  label: "Sub-Hire",  icon: Icon.subhire },
    { to: "/fuel",     key: "fuel",     label: "Fuel",      icon: Icon.fuel },
    { to: "/sold",     key: "sold",     label: "Sold",      icon: Icon.sold },
  ]},
  { label: "Safety", items: [
    { to: "/blacklist", key: "blacklist", label: "Blacklist", icon: Icon.blacklist },
  ]},
];

export default function Layout({ children, staffName, role, onSignOut, logo }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState("");
  const [viewAll,      setViewAll]      = useState(false);
  const [fDate,        setFDate]        = useState("");
  const [statFilter,   setStatFilter]   = useState("");
  const [staffList,    setStaffList]    = useState([]);
  const [viewingStaff, setViewingStaff] = useState(staffName);
  const [urgentCount,  setUrgentCount]  = useState(0);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [myUpcoming,        setMyUpcoming]        = useState([]); // my own reservations picking up within 24h, not yet checked out
  const [othersUpcomingCount, setOthersUpcomingCount] = useState(0); // Admin/Manager only — count of other staff's, no details

  const canViewAll = role === "Admin" || role === "Manager";

  // Load reservation-related notification data. Runs on mount and every 60s
  // so the "pickup within 24h" banner and nav badge count stay current
  // without requiring a manual page refresh.
  useEffect(() => {
    const load = () => {
      Promise.all([api.getAllReservations(), api.getFleet()]).then(([resRes, fleetRes]) => {
        const reservations = resRes.data || [];
        const fleet = fleetRes.data || [];
        const now = new Date(); now.setHours(0,0,0,0);

        // Nav badge (assign-car urgency, unchanged trigger): no plate + pickup within 5 days.
        // Admin/Manager see the org-wide total; Staff only see their own.
        const assignUrgent = reservations.filter(r => {
          if (r.plate) return false;
          if (!r.pickupDate) return false;
          const diff = Math.ceil((parseLocalDate(r.pickupDate) - now) / (1000*60*60*24));
          if (diff < 0 || diff > 5) return false;
          if (!canViewAll && r.staffName !== staffName) return false;
          return true;
        });
        setUrgentCount(assignUrgent.length);

        // "Checked out" = the assigned plate is currently Rented to this reservation's client.
        // Reservations have no direct link to a checkout record, so this is inferred by
        // cross-referencing Fleet — same approach the rest of the app already uses.
        const isCheckedOut = (r) => {
          if (!r.plate) return false;
          const car = fleet.find(c => c.plate === r.plate);
          if (!car) return false;
          return car.status === "Rented" && (car.currentClient||"").trim().toLowerCase() === (r.client||"").trim().toLowerCase();
        };

        // "Within 24h" — reservation data only stores a date (no time), so this is
        // approximated at day granularity: pickup is today or tomorrow.
        const within24h = reservations.filter(r => {
          if (!r.pickupDate) return false;
          const diff = Math.ceil((parseLocalDate(r.pickupDate) - now) / (1000*60*60*24));
          return diff >= 0 && diff <= 1 && !isCheckedOut(r);
        });

        setMyUpcoming(within24h.filter(r => r.staffName === staffName));
        setOthersUpcomingCount(canViewAll ? within24h.filter(r => r.staffName !== staffName).length : 0);
      }).catch(()=>{});
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [staffName, canViewAll]);

  const loadHistory = async (name) => {
    setLoading(true);
    try {
      const res = await api.getHistoryByStaff(name);
      setHistory(res.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (panelOpen) {
      setViewingStaff(staffName);
      loadHistory(staffName);
      setSearch(""); setFDate(""); setStatFilter(""); setViewAll(false);
      if (canViewAll && staffList.length === 0) {
        api.getConfig().then(c => setStaffList(c.staff || [])).catch(() => {});
      }
    }
  }, [panelOpen]);

  const myHistory = history.filter(h => {
    const q = search.toLowerCase();
    const ts = h.timestamp ? h.timestamp.split("T")[0] : "";
    if (search && !h.plate.toLowerCase().includes(q) && !(h.client||"").toLowerCase().includes(q) && !h.action.toLowerCase().includes(q)) return false;
    if (fDate   && ts !== fDate) return false;
    if (statFilter) {
      if (statFilter === "checkouts"   && h.action !== "Checked Out")           return false;
      if (statFilter === "returns"     && h.action !== "Returned")               return false;
      if (statFilter === "maintenance" && h.action !== "Sent to Maintenance")    return false;
      if (statFilter === "month") {
        if (!h.timestamp) return false;
        const d = new Date(h.timestamp); const now = new Date();
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false;
      }
    }
    return true;
  });

  const displayed = viewAll ? myHistory : myHistory.slice(0, 20);

  const roleBadge = {
    Admin:   { bg: "#7c3aed", color: "#fff" },
    Manager: { bg: "#0284c7", color: "#fff" },
    Staff:   { bg: "#e5e7eb", color: "#555" },
  }[role] || { bg: "#e5e7eb", color: "#555" };

  const switchStaff = (name) => {
    setViewingStaff(name);
    setSearch(""); setFDate(""); setStatFilter(""); setViewAll(false);
    loadHistory(name);
  };

  // Stats
  const checkouts   = history.filter(h => h.action === "Checked Out").length;
  const returns      = history.filter(h => h.action === "Returned").length;
  const maintenance  = history.filter(h => h.action === "Sent to Maintenance").length;
  const thisMonth    = history.filter(h => {
    if (!h.timestamp) return false;
    const d = new Date(h.timestamp);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <div className={`sc-shell${sidebarCollapsed ? " collapsed" : ""}`}>
      {/* ---- Sidebar ---- */}
      <aside className="sc-sidebar">
        <div className="sc-sidebar-brand">
          {logo
            ? <img src={logo} alt="SmilesCars" />
            : <div style={{ width:30, height:30, borderRadius:8, background:"var(--sc-yellow)", color:"var(--sc-blue)", fontWeight:800, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>S</div>
          }
          <div className="sc-sidebar-brand-text">
            <div className="sc-sidebar-brand-name">SmilesCars</div>
            <div className="sc-sidebar-brand-sub">Fleet Manager</div>
          </div>
        </div>

        <nav className="sc-sidebar-nav">
          {NAV_GROUPS.map(group => (
            <div className="sc-nav-section" key={group.label}>
              <div className="sc-nav-section-label">{group.label}</div>
              {group.items.map(item => (
                <NavLink key={item.key} to={item.to} end={item.end}
                  className={({ isActive }) => `sc-nav-link${isActive ? " active" : ""}`}
                  title={item.label}>
                  <span className="sc-nav-icon"><item.icon width="17" height="17" /></span>
                  <span className="sc-nav-link-text">{item.label}</span>
                  {item.badgeKey === "urgent" && urgentCount > 0 && (
                    <span className="sc-nav-badge">{urgentCount}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* ---- Main column ---- */}
      <div className="sc-main">
        <header className="sc-topbar">
          <button type="button" className="sc-sidebar-toggle" onClick={() => setSidebarCollapsed(v => !v)} title="Toggle sidebar">
            <Icon.menu width="17" height="17" />
          </button>
          <div className="sc-topbar-search">
            <Icon.search width="15" height="15" />
            <span>Search vehicles, clients, reservations…</span>
          </div>
          <div className="sc-topbar-actions">
            <button type="button" className="sc-icon-btn" title="Notifications">
              <Icon.bell width="18" height="18" />
              {urgentCount > 0 && (
                <span style={{ position:"absolute", top:5, right:5, width:8, height:8, borderRadius:"50%", background:"var(--sc-overdue)", border:"1.5px solid #fff" }} />
              )}
            </button>
            {/* Clickable avatar + name — opens Activity Panel */}
            <button type="button" onClick={() => setPanelOpen(true)}
              style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", padding:"4px 8px", borderRadius:8, transition:"background .15s" }}
              onMouseEnter={e => e.currentTarget.style.background="var(--bg)"}
              onMouseLeave={e => e.currentTarget.style.background="none"}>
              <div style={{ width:30, height:30, borderRadius:"50%", background:"var(--sc-blue)", color:"#fff", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {staffName.charAt(0).toUpperCase()}
              </div>
              <div style={{ textAlign:"left" }}>
                <div className="sc-user-name">{staffName}</div>
                {role !== "Admin" && (
                  <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".4px", background:roleBadge.bg, color:roleBadge.color, padding:"1px 6px", borderRadius:4, display:"inline-block", marginTop:2 }}>{role}</div>
                )}
              </div>
            </button>
            {/* Role badge — for Admins, this is a separate button that opens the Admin Panel */}
            {role === "Admin" && (
              <button type="button" onClick={() => setAdminPanelOpen(true)}
                style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".4px", background:roleBadge.bg, color:roleBadge.color, padding:"3px 9px", borderRadius:4, border:"none", cursor:"pointer" }}
                title="Open Admin Panel">
                {role}
              </button>
            )}
            <button type="button" className="sc-icon-btn" onClick={onSignOut} title="Log out">↩</button>
          </div>
        </header>

        {/* Personal reservation reminder — pickup within 24h, not yet checked out.
            Own reservations show full detail; Admin/Manager additionally see a
            count-only line for other staff's upcoming reservations. */}
        {(myUpcoming.length > 0 || othersUpcomingCount > 0) && (
          <div style={{ background:"var(--sc-overdue-bg)", borderBottom:`1.5px solid var(--sc-overdue-border)`, padding:"8px 16px" }}>
            <div style={{ maxWidth:1280, margin:"0 auto" }}>
              {myUpcoming.map(r => {
                const now    = new Date(); now.setHours(0,0,0,0);
                const diff   = Math.ceil((parseLocalDate(r.pickupDate) - now) / (1000*60*60*24));
                return (
                  <div key={r.id} style={{ fontSize:15, fontWeight:700, color:"var(--sc-overdue)", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"3px 0", textAlign:"center" }}>
                    <span>⏰</span>
                    <span>{diff===0?"Today":"Tomorrow"}:</span>
                    <span>{r.client}</span>
                    <span>·</span>
                    <span>{r.plate || r.carType || "Any"}</span>
                    <span>·</span>
                    <span>pickup not yet checked out</span>
                  </div>
                );
              })}
              {canViewAll && othersUpcomingCount > 0 && (
                <div style={{ fontSize:14, fontWeight:700, color:"var(--sc-overdue)", padding:"3px 0", textAlign:"center" }}>
                  + {othersUpcomingCount} other upcoming reservation{othersUpcomingCount>1?"s":""} from other staff
                </div>
              )}
            </div>
          </div>
        )}

        <main className="sc-content">{children}</main>
      </div>

      {/* Overlay */}
      {panelOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:50 }}
          onClick={() => setPanelOpen(false)} />
      )}

      {/* Side Panel */}
      <div style={{
        position:"fixed", top:0, right:0, bottom:0, width:420, maxWidth:"100vw",
        background:"#fff", boxShadow:"-4px 0 24px rgba(0,0,0,0.12)",
        zIndex:51, display:"flex", flexDirection:"column",
        transform: panelOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform .25s cubic-bezier(.4,0,.2,1)",
      }}>
        {/* Panel header */}
        <div style={{ background:"#1d4ed8", padding:"1.25rem 1rem", flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:44, height:44, borderRadius:"50%", background:"rgba(255,255,255,0.2)", color:"#fff", fontSize:18, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {viewingStaff.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{viewingStaff}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,0.75)", marginTop:2 }}>
                  {viewingStaff === staffName ? `${role} · Your Activity` : "Staff Activity"}
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setPanelOpen(false)}
              style={{ background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", borderRadius:8, padding:"6px 10px", cursor:"pointer", fontSize:16 }}>✕</button>
          </div>

          {/* Staff switcher for Admin/Manager */}
          {canViewAll && staffList.length > 0 && (
            <select value={viewingStaff} onChange={e => switchStaff(e.target.value)}
              style={{ width:"100%", marginTop:10, padding:"8px 10px", fontSize:13, borderRadius:8, border:"none", background:"rgba(255,255,255,0.15)", color:"#fff", fontFamily:"inherit", cursor:"pointer" }}>
              {staffList.map(s => (
                <option key={s} value={s} style={{ background:"#1d4ed8", color:"#fff" }}>{s}{s === staffName ? " (You)" : ""}</option>
              ))}
            </select>
          )}

          {/* Clickable Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginTop:14 }}>
            {[
              { label:"Checkouts", value:checkouts,   key:"checkouts"   },
              { label:"Returns",   value:returns,     key:"returns"     },
              { label:"Maint.",    value:maintenance, key:"maintenance" },
              { label:"This Month",value:thisMonth,   key:"month"       },
            ].map(s => (
              <div key={s.label} onClick={() => { setStatFilter(statFilter===s.key?"":s.key); setViewAll(false); }}
                style={{ background: statFilter===s.key ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)", borderRadius:8, padding:"8px 6px", textAlign:"center", cursor:"pointer", outline: statFilter===s.key ? "2px solid rgba(255,255,255,0.8)" : "none", transition:"all .15s" }}>
                <div style={{ fontSize:20, fontWeight:700, color:"#fff" }}>{s.value}</div>
                <div style={{ fontSize:10, color:"rgba(255,255,255,0.75)", marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ padding:"8px 1rem", borderBottom:"1px solid #f3f4f6", flexShrink:0, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
          <input style={{ flex:1, minWidth:140, padding:"7px 10px", fontSize:13, border:"1.5px solid #e5e7eb", borderRadius:7, boxSizing:"border-box", fontFamily:"inherit" }}
            placeholder="Search plate, client…"
            value={search} onChange={e => { setSearch(e.target.value); setViewAll(false); }} />
          <button type="button" onClick={() => { setStatFilter(statFilter==="checkouts"?"":"checkouts"); setViewAll(false); }}
            style={{ padding:"7px 12px", fontSize:12, fontWeight:600, borderRadius:7, border:"1.5px solid #1d4ed8", background: statFilter==="checkouts"?"#1d4ed8":"#eff6ff", color: statFilter==="checkouts"?"#fff":"#1d4ed8", cursor:"pointer", whiteSpace:"nowrap" }}>
            🚗 Currently Rented
          </button>
          <input type="date" value={fDate} onChange={e => { setFDate(e.target.value); setViewAll(false); }}
            style={{ padding:"7px 8px", fontSize:12, border:"1.5px solid #e5e7eb", borderRadius:7, fontFamily:"inherit", cursor:"pointer" }} />
          {(search || fDate || statFilter) && (
            <button type="button" onClick={() => { setSearch(""); setFDate(""); setStatFilter(""); setViewAll(false); }}
              style={{ padding:"7px 10px", fontSize:12, border:"1.5px solid #e5e7eb", borderRadius:7, background:"#fff", cursor:"pointer", color:"#555" }}>Clear</button>
          )}
        </div>

        {/* History list */}
        <div style={{ flex:1, overflowY:"auto", padding:"0 1rem" }}>
          {loading ? (
            <div style={{ textAlign:"center", padding:"3rem", color:"#888" }}>Loading activity…</div>
          ) : myHistory.length === 0 ? (
            <div style={{ textAlign:"center", padding:"3rem", color:"#aaa", fontSize:14 }}>No activity found.</div>
          ) : (<>
            <p style={{ fontSize:12, color:"#888", margin:"10px 0 6px" }}>{myHistory.length} entries</p>
            {displayed.map((h, i) => {
              const ac = ACTION_COLORS[h.action] || { bg:"#f3f4f6", color:"#374151" };
              return (
                <div key={i} style={{ padding:"10px 0", borderBottom:"1px solid #f9fafb" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontWeight:700, fontSize:13, color:"#111" }}>{h.plate}</span>
                        <span style={{ fontSize:11, color:"#888" }}>{h.type}</span>
                        <span style={{ fontSize:11, fontWeight:600, padding:"2px 7px", borderRadius:99, background:ac.bg, color:ac.color }}>{h.action}</span>
                      </div>
                      {h.client && <div style={{ fontSize:12, color:"#555", marginTop:3 }}>👤 {h.client}</div>}
                      {h.returnDate && <div style={{ fontSize:12, color:"#888", marginTop:1 }}>Return: {fmtDate(h.returnDate)}</div>}
                      {h.amount && <div style={{ fontSize:12, color:"#15803d", marginTop:1 }}>{h.currency} {Number(h.amount).toLocaleString("en-US")}</div>}
                    </div>
                    <div style={{ fontSize:11, color:"#aaa", whiteSpace:"nowrap", flexShrink:0 }}>{fmtDateTime(h.timestamp)}</div>
                  </div>
                </div>
              );
            })}
            {!viewAll && myHistory.length > 20 && (
              <button type="button" onClick={() => setViewAll(true)}
                style={{ width:"100%", padding:"10px", fontSize:13, border:"1.5px solid #e5e7eb", borderRadius:8, background:"#fff", cursor:"pointer", color:"#555", margin:"12px 0" }}>
                Show all {myHistory.length} entries
              </button>
            )}
          </>)}
        </div>
      </div>

      {adminPanelOpen && <AdminPanel onClose={() => setAdminPanelOpen(false)} />}
    </div>
  );
}
