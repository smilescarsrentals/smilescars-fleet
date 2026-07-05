// src/components/Layout.jsx
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../lib/api";

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

export default function Layout({ children, staffName, role, onSignOut, logo }) {
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState("");
  const [viewAll,      setViewAll]      = useState(false);
  const [fDate,        setFDate]        = useState("");
  const [statFilter,   setStatFilter]   = useState("");
  const [staffList,    setStaffList]    = useState([]);
  const [viewingStaff, setViewingStaff] = useState(staffName);

  const canViewAll = role === "Admin" || role === "Manager";

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
    <div style={{ minHeight:"100vh", background:"#f9fafb" }}>
      <header style={{ background:"#fff", borderBottom:"1px solid #e5e7eb", position:"sticky", top:0, zIndex:10 }}>
        <div className="sc-header-inner">
          <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
            {logo
              ? <img src={logo} alt="SmilesCars" style={{ height:38, width:"auto", objectFit:"contain", borderRadius:8 }} />
              : <div style={{ width:38, height:38, borderRadius:10, background:"#16a34a", color:"#fff", fontWeight:700, fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>S</div>
            }
            <div>
              <div className="sc-brand-name">SmilesCars Fleet Manager</div>
              <div className="sc-brand-sub">Fleet Operations</div>
            </div>
          </div>
          <nav className="sc-nav">
            <NavLink to="/"             style={navStyle} end>Fleet</NavLink>
            <NavLink to="/reservations" style={navStyle}>Reservations</NavLink>
            <NavLink to="/history"      style={navStyle}>History</NavLink>
            <NavLink to="/clients"      style={navStyle}>Clients</NavLink>
            <NavLink to="/sub-hire"     style={navStyle}>Sub-Hire</NavLink>
            <NavLink to="/fuel"         style={navStyle}>Fuel</NavLink>
            <NavLink to="/sold"         style={navStyle}>Sold</NavLink>
            <NavLink to="/blacklist"    style={navStyle}>⛔ Blacklist</NavLink>
          </nav>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            {/* Clickable avatar + name */}
            <button onClick={() => setPanelOpen(true)}
              style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", padding:"4px 8px", borderRadius:8, transition:"background .15s" }}
              onMouseEnter={e => e.currentTarget.style.background="#f3f4f6"}
              onMouseLeave={e => e.currentTarget.style.background="none"}>
              <div style={{ width:30, height:30, borderRadius:"50%", background:"#1d4ed8", color:"#fff", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {staffName.charAt(0).toUpperCase()}
              </div>
              <div style={{ textAlign:"left" }}>
                <div className="sc-user-name">{staffName}</div>
                <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".4px", background:roleBadge.bg, color:roleBadge.color, padding:"1px 6px", borderRadius:4, display:"inline-block", marginTop:2 }}>{role}</div>
              </div>
            </button>
            <button className="sc-sign-out" onClick={onSignOut}>↩</button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth:1200, margin:"0 auto", padding:"1.25rem 1rem" }}>{children}</main>

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
            <button onClick={() => setPanelOpen(false)}
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
          <button onClick={() => { setStatFilter(statFilter==="checkouts"?"":"checkouts"); setViewAll(false); }}
            style={{ padding:"7px 12px", fontSize:12, fontWeight:600, borderRadius:7, border:"1.5px solid #1d4ed8", background: statFilter==="checkouts"?"#1d4ed8":"#eff6ff", color: statFilter==="checkouts"?"#fff":"#1d4ed8", cursor:"pointer", whiteSpace:"nowrap" }}>
            🚗 Currently Rented
          </button>
          <input type="date" value={fDate} onChange={e => { setFDate(e.target.value); setViewAll(false); }}
            style={{ padding:"7px 8px", fontSize:12, border:"1.5px solid #e5e7eb", borderRadius:7, fontFamily:"inherit", cursor:"pointer" }} />
          {(search || fDate || statFilter) && (
            <button onClick={() => { setSearch(""); setFDate(""); setStatFilter(""); setViewAll(false); }}
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
              <button onClick={() => setViewAll(true)}
                style={{ width:"100%", padding:"10px", fontSize:13, border:"1.5px solid #e5e7eb", borderRadius:8, background:"#fff", cursor:"pointer", color:"#555", margin:"12px 0" }}>
                Show all {myHistory.length} entries
              </button>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}

function navStyle({ isActive }) {
  return {
    fontSize:14, fontWeight:500, textDecoration:"none",
    color: isActive ? "#16a34a" : "#555",
    borderBottom: isActive ? "2px solid #16a34a" : "2px solid transparent",
    paddingBottom:4,
  };
}
