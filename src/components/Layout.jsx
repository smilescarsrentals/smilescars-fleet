// src/components/Layout.jsx
import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { pushSupported, pushPermission, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from "../lib/push";
import AdminPanel from "./AdminPanel";
import { HR_ENABLED_LOCATIONS } from "./ActionModal";

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
  leads: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z"/></svg>,
  history: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>,
  clients: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.4"/><path d="M16 14.2c2.8.4 4.7 2.4 4.7 5.3"/></svg>,
  subhire: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
  fuel: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M6 21V8.5A2.5 2.5 0 018.5 6H12a2.5 2.5 0 012.5 2.5V21"/><path d="M4.5 21h10"/><path d="M14.5 10h1.7L19 12.7V17a1.5 1.5 0 01-3 0"/><circle cx="9" cy="4" r="1.4"/></svg>,
  sold: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M20.6 12.8l-7.8 7.8a2 2 0 01-2.8 0l-6.8-6.8a2 2 0 010-2.8l7.8-7.8H18a2.6 2.6 0 012.6 2.6v6z"/><circle cx="15.5" cy="8.5" r="1.4"/></svg>,
  blacklist: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>,
  drivers: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 17c0-1.8 1.6-3 3.5-3s3.5 1.2 3.5 3"/><path d="M14 10h5M14 13h5"/></svg>,
  tracking: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M12 21s7-6.5 7-11.5A7 7 0 105 9.5C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>,
  maintenance: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.8 2.8-2-2 2.8-2.8z"/></svg>,
  analytics: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M4 20V10M11 20V4M18 20v-7"/></svg>,
  search: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  bell: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M18 8a6 6 0 10-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14 18 8z"/><path d="M10.3 20a1.8 1.8 0 003.4 0"/></svg>,
  menu: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>,
  logout: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>,
  myhr: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M12 13.5v-2"/></svg>,
  hr: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.4 2.5-5.8 5.5-5.8s5.5 2.4 5.5 5.8"/><path d="M17 4.5a3 3 0 010 6"/><path d="M15.5 14.2a5.6 5.6 0 015.5 5.8"/></svg>,
  workflows: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 13l2 2 4-4"/></svg>,
};

const NAV_GROUPS = [
  { label: "Main", items: [
    { to: "/",          key: "dashboard", label: "Dashboard", icon: Icon.dashboard, end: true },
    { to: "/fleet",     key: "fleet",     label: "Fleet",     icon: Icon.fleet },
    { to: "/reservations", key: "reservations", label: "Reservations", icon: Icon.reservations, badgeKey: "urgent" },
    { to: "/leads",     key: "leads",     label: "Leads",      icon: Icon.leads },
    { to: "/garage",    key: "garage",    label: "Garage",     icon: Icon.maintenance },
    { to: "/clients",   key: "clients",   label: "Clients",   icon: Icon.clients },
  ]},
  { label: "Operations", items: [
    { to: "/history",  key: "history",  label: "History",  icon: Icon.history },
    { to: "/sub-hire", key: "subhire",  label: "Sub-Hire",  icon: Icon.subhire },
    { to: "/fuel",     key: "fuel",     label: "Fuel",      icon: Icon.fuel },
    { to: "/sold",     key: "sold",     label: "Sold",      icon: Icon.sold },
    { to: "/tracking", key: "tracking", label: "Tracking",  icon: Icon.tracking },
  ]},
  { label: "Safety", items: [
    { to: "/blacklist", key: "blacklist", label: "Blacklist", icon: Icon.blacklist },
    { to: "/drivers",   key: "drivers",   label: "Drivers",   icon: Icon.drivers },
  ]},
  { label: "HR", items: [
    { to: "/my-hr", key: "myhr", label: "My Profile", icon: Icon.myhr },
    { to: "/hr",    key: "hr",   label: "HR Management", icon: Icon.hr },
  ]},
  { label: "Workflows", items: [
    { to: "/workflows", key: "workflows", label: "Invoice Approvals", icon: Icon.workflows },
  ]},
];

// Short synthesized chime via the Web Audio API — no static audio file
// needed, keeps this self-contained. Two quick tones so it reads as a
// distinct "notification" sound rather than a generic beep.
function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.start(startTime); osc.stop(startTime + duration);
    };
    const now = ctx.currentTime;
    playTone(880, now, 0.15);
    playTone(1320, now + 0.12, 0.18);
  } catch { /* audio not available (e.g. no user gesture yet) — silently skip */ }
}

const NOTIF_ICONS = {
  fleet_to_garage: "🔧", low_stock: "⚠️", car_out_for_service: "🚗", car_back_from_service: "✅",
  reservation_reminder: "📅", unpaid_customer_job: "💰",
};

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Bell icon + dropdown in the topbar. Polls every 60s (same cadence as the
// existing reservation-urgency polling) — plays a chime only when the
// unread count genuinely increases since the last check, not on every
// poll, so opening the dropdown or a normal refresh doesn't re-trigger it.
function NotificationBell({ staffName }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const prevUnreadRef = useState({ current: null })[0]; // null = no baseline yet (first poll)

  // Reflects THIS device's actual subscription state, not assumed — checks
  // both the browser's own PushManager (source of truth for "is this
  // device subscribed right now") and whether permission was ever denied.
  useEffect(() => {
    if (!pushSupported()) return;
    getExistingSubscription().then(sub => setPushEnabled(!!sub)).catch(() => {});
    // One-time prompt: only offer it if permission hasn't been decided yet
    // AND the person hasn't dismissed it before on this device.
    if (pushPermission() === "default" && !localStorage.getItem("sc_push_prompt_dismissed")) {
      setShowPushPrompt(true);
    }
  }, []);

  const handleTogglePush = async () => {
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        await subscribeToPush(staffName);
        setPushEnabled(true);
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setPushBusy(false);
      setShowPushPrompt(false);
    }
  };

  const dismissPushPrompt = () => {
    localStorage.setItem("sc_push_prompt_dismissed", "1");
    setShowPushPrompt(false);
  };

  useEffect(() => {
    if (!staffName) return;
    const poll = () => {
      api.getUnreadNotificationCount(staffName).then(res => {
        const count = res?.count || 0;
        // Only chime once a baseline exists and the count has genuinely
        // gone UP since the last poll — not on the very first load (that
        // would chime for every pre-existing unread notification on
        // login) and not when it goes down (someone read something).
        if (prevUnreadRef.current !== null && count > prevUnreadRef.current) {
          playChime();
        }
        prevUnreadRef.current = count;
        setUnread(count);
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [staffName]);

  // Standing "check the app" chime at 9am / 2pm / 4:30pm EAT, regardless
  // of whether anything new actually arrived — a periodic nudge, not a
  // new-item alert. Only reaches staff who have the tab open at that
  // moment; the always-reaches-everyone version is push (later, once the
  // PWA/Add-to-Home-Screen layer exists). Checked once a minute against
  // the browser's local time — assumes the device is set to Tanzania time,
  // same assumption the rest of the app already makes.
  useEffect(() => {
    if (!staffName) return;
    const CHECK_TIMES = [[9, 0], [14, 0], [16, 30]];
    let lastFiredMinute = null;
    const check = () => {
      const now = new Date();
      const hm = `${now.getHours()}:${now.getMinutes()}`;
      if (hm === lastFiredMinute) return; // already fired this exact minute
      const matches = CHECK_TIMES.some(([h, m]) => now.getHours() === h && now.getMinutes() === m);
      if (matches) { playChime(); lastFiredMinute = hm; }
    };
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [staffName]);

  const loadList = () => {
    api.getNotifications(staffName).then(res => setItems(res?.data || [])).catch(() => {});
  };

  const handleOpen = () => {
    setOpen(v => !v);
    if (!open) loadList();
  };

  const handleClick = async (n) => {
    if (!n.read) {
      await api.markNotificationRead({ id: n.id }).catch(() => {});
      setUnread(u => Math.max(0, u - 1));
      setItems(list => list.map(i => i.id === n.id ? { ...i, read: true } : i));
    }
    setOpen(false);
    if (n.linkPath) navigate(n.linkPath);
  };

  const handleMarkAllRead = async (e) => {
    e.stopPropagation();
    await api.markAllNotificationsRead({ staffName }).catch(() => {});
    setUnread(0);
    setItems(list => list.map(i => ({ ...i, read: true })));
  };

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={handleOpen}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "6px 8px", borderRadius: 8, display: "flex", alignItems: "center" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--bg)"}
        onMouseLeave={e => e.currentTarget.style.background = "none"}
        title="Notifications">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20" style={{ color: "var(--text-muted)" }}>
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{ position: "absolute", top: 2, right: 2, background: "var(--red)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 20, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, maxHeight: 420, overflowY: "auto", background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 91 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border-light)" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Notifications</span>
              {unread > 0 && (
                <button type="button" onClick={handleMarkAllRead} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sc-blue)", background: "none", border: "none", cursor: "pointer" }}>
                  Mark all read
                </button>
              )}
            </div>
            {pushSupported() && pushPermission() !== "denied" && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderBottom: "1px solid var(--border-light)", background: "var(--bg)" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Push on this device</span>
                <button type="button" disabled={pushBusy} onClick={handleTogglePush}
                  style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, cursor: "pointer", opacity: pushBusy ? 0.6 : 1,
                    border: `1.5px solid ${pushEnabled ? "var(--green)" : "var(--border)"}`,
                    background: pushEnabled ? "var(--green-bg, #eafaf0)" : "var(--surface)",
                    color: pushEnabled ? "var(--green)" : "var(--text-muted)" }}>
                  {pushBusy ? "…" : pushEnabled ? "On" : "Off"}
                </button>
              </div>
            )}
            {items.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic", padding: "24px 14px", textAlign: "center", margin: 0 }}>No notifications</p>
            ) : (
              items.map(n => (
                <div key={n.id} onClick={() => handleClick(n)}
                  style={{ padding: "11px 14px", borderBottom: "1px solid var(--border-light)", cursor: "pointer", display: "flex", gap: 10,
                    background: n.read ? "var(--surface)" : "var(--blue-bg)" }}
                  onMouseEnter={e => e.currentTarget.style.background = n.read ? "var(--bg)" : "var(--blue-bg)"}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? "var(--surface)" : "var(--blue-bg)"}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{NOTIF_ICONS[n.type] || "🔔"}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, margin: 0 }}>{n.title}</p>
                    {n.message && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>{n.message}</p>}
                    <p style={{ fontSize: 10.5, color: "var(--text-faint)", margin: "4px 0 0" }}>{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--sc-blue)", flexShrink: 0, marginTop: 4 }} />}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {showPushPrompt && !open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 260, background: "var(--surface)", border: "1.5px solid var(--sc-blue)", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 91, padding: "14px" }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Turn on notifications?</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px" }}>Get alerted here on this device — you can change this anytime from the bell.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={dismissPushPrompt} style={{ flex: 1, padding: "7px 0", fontSize: 12, color: "var(--text-muted)", background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 7, cursor: "pointer" }}>
              Not now
            </button>
            <button type="button" disabled={pushBusy} onClick={handleTogglePush} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--sc-blue)", border: "none", borderRadius: 7, cursor: "pointer", opacity: pushBusy ? 0.65 : 1 }}>
              {pushBusy ? "…" : "Enable"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children, staffName, role, onSignOut, logo }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Global topbar search — searches the fleet/reservations data already
  // fetched below (for the urgency badge), so no extra network calls.
  const [fleetData, setFleetData] = useState([]);
  const [reservationsData, setReservationsData] = useState([]);
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalOpen, setGlobalOpen] = useState(false);

  // The bottom nav's middle slot defaults to Reservations, but swaps in
  // whichever "More" page is currently active (Sub-Hire/History/Sold/
  // Clients/Blacklist), then reverts once you leave it.
  const SWAP_ROUTES = [
    { path: "/sub-hire",  icon: Icon.subhire,   label: "Sub-Hire" },
    { path: "/history",   icon: Icon.history,   label: "History" },
    { path: "/sold",      icon: Icon.sold,      label: "Sold" },
    { path: "/clients",   icon: Icon.clients,   label: "Clients" },
    { path: "/blacklist", icon: Icon.blacklist, label: "Blacklist" },
  ];
  const activeSwap    = SWAP_ROUTES.find(r => location.pathname.startsWith(r.path));
  const middleIcon    = activeSwap ? activeSwap.icon  : Icon.reservations;
  const middleLabel   = activeSwap ? activeSwap.label : "Reservations";
  const middleTo      = activeSwap ? activeSwap.path  : "/reservations";
  const MiddleIcon    = middleIcon;
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
  const [myLocation, setMyLocation] = useState("");
  const [myHrAccess, setMyHrAccess] = useState("None");
  const [myIsCoo, setMyIsCoo] = useState(false);
  const [myWorkflowAccess, setMyWorkflowAccess] = useState("None");
  useEffect(() => {
    api.getStaffList().then(res => {
      const me = (res.staff || []).find(s => s.name.trim().toLowerCase() === staffName.trim().toLowerCase());
      setMyLocation(me?.location || "");
      setMyHrAccess(me?.hrAccess || "None");
      setMyIsCoo(!!me?.isCoo);
      setMyWorkflowAccess(me?.workflowAccess || "None");
    }).catch(() => {});
  }, [staffName]);
  const hasMyHrAccess = role === "Admin" || HR_ENABLED_LOCATIONS.includes(myLocation);
  // COO can always reach the HR page to do leave sign-off, even with no
  // general HR view/edit grant — matches requireHRViewOrCOOAccess on the
  // backend for the leave-request queue specifically.
  const hasHrAccess = role === "Admin" || myHrAccess !== "None" || myIsCoo;
  const hasWorkflowAccess = role === "Admin" || myWorkflowAccess !== "None";

  const visibleNavGroups = role === "Garage Manager"
    ? NAV_GROUPS
        .map(group => ({ ...group, items: group.items.filter(i => i.key === "garage" || i.key === "fleet") }))
        .filter(group => group.items.length > 0)
    : canViewAll
    ? NAV_GROUPS
        .map(group => ({ ...group, items: group.items.filter(i => (i.key !== "myhr" || hasMyHrAccess) && (i.key !== "hr" || hasHrAccess) && (i.key !== "workflows" || hasWorkflowAccess)) }))
        .filter(group => group.items.length > 0)
    : NAV_GROUPS
        .map(group => ({ ...group, items: group.items.filter(i => i.key !== "garage" && i.key !== "tracking" && (i.key !== "myhr" || hasMyHrAccess) && (i.key !== "hr" || hasHrAccess) && (i.key !== "workflows" || hasWorkflowAccess)) }))
        .filter(group => group.items.length > 0);

  // The reservation reminder banner is only relevant to the operationally-
  // immediate, rental-facing pages (Main group: Dashboard/Fleet/Reservations/
  // Leads/Garage/Clients) — a pickup reminder is a distraction while working
  // in Safety, Operations, or HR pages, which are about unrelated tasks.
  // Routes not in any group (e.g. a car profile detail page) default to
  // showing it, same as Main.
  const HIDE_RESERVATION_BANNER_GROUPS = ["Safety", "Operations", "HR"];
  const currentNavGroup = NAV_GROUPS.find(g => g.items.some(i => location.pathname === i.to || location.pathname.startsWith(i.to + "/")))?.label;
  const showReservationBanner = !HIDE_RESERVATION_BANNER_GROUPS.includes(currentNavGroup);

  // Load reservation-related notification data. Runs on mount and every 60s
  // so the "pickup within 24h" banner and nav badge count stay current
  // without requiring a manual page refresh.
  useEffect(() => {
    const load = () => {
      Promise.all([api.getAllReservations(), api.getFleet()]).then(([resRes, fleetRes]) => {
        const reservations = resRes.data || [];
        const fleet = fleetRes.data || [];
        setFleetData(fleet);
        setReservationsData(reservations);
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
    "Garage Manager": { bg: "#d97706", color: "#fff" },
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

  // Global topbar search results — vehicles by plate/type/client, reservations by client/plate.
  const globalResults = (() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return { vehicles: [], reservations: [] };
    const vehicles = fleetData.filter(c =>
      (c.plate||"").toLowerCase().includes(q) ||
      (c.type||"").toLowerCase().includes(q) ||
      (c.currentClient||"").toLowerCase().includes(q)
    ).slice(0, 6);
    const seenClients = new Set();
    const reservations = reservationsData.filter(r => {
      const match = (r.client||"").toLowerCase().includes(q) || (r.plate||"").toLowerCase().includes(q);
      if (!match) return false;
      const key = (r.client||"") + (r.pickupDate||"");
      if (seenClients.has(key)) return false;
      seenClients.add(key);
      return true;
    }).slice(0, 5);
    return { vehicles, reservations };
  })();
  const hasGlobalResults = globalResults.vehicles.length > 0 || globalResults.reservations.length > 0;

  return (
    <div className={`sc-shell${sidebarCollapsed ? " collapsed" : ""}`}>
      {/* Mobile drawer backdrop */}
      {mobileDrawerOpen && (
        <div className="sc-mobile-backdrop" onClick={() => setMobileDrawerOpen(false)} />
      )}

      {/* ---- Sidebar ---- */}
      <aside className={`sc-sidebar${mobileDrawerOpen ? " mobile-open" : ""}`}>
        <div className="sc-sidebar-brand">
          {logo
            ? <img src={logo} alt="SmilesCars" />
            : <div style={{ width:30, height:30, borderRadius:8, background:"var(--sc-yellow)", color:"var(--sc-blue)", fontWeight:800, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>S</div>
          }
          <div className="sc-sidebar-brand-text">
            <div className="sc-sidebar-brand-name">SmilesCars</div>
            <div className="sc-sidebar-brand-sub">Fleet Manager</div>
            <div className="sc-sidebar-user-row">
              <span className="sc-sidebar-user-name">{staffName}</span>
              <span className="sc-sidebar-role-pill" style={{ background:roleBadge.bg, color:roleBadge.color }}>{role}</span>
            </div>
          </div>
        </div>

        <nav className="sc-sidebar-nav">
          {visibleNavGroups.map(group => (
            <div className="sc-nav-section" key={group.label}>
              <div className="sc-nav-section-label">{group.label}</div>
              {group.items.map(item => (
                <NavLink key={item.key} to={item.to} end={item.end}
                  className={({ isActive }) => `sc-nav-link${isActive ? " active" : ""}`}
                  title={item.label} onClick={() => setMobileDrawerOpen(false)}>
                  <span className="sc-nav-icon"><item.icon width="17" height="17" /></span>
                  <span className="sc-nav-link-text">{item.label}</span>
                  {item.badgeKey === "urgent" && urgentCount > 0 && (
                    <span className="sc-nav-badge">{urgentCount}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="sc-nav-section">
            <button type="button" className="sc-nav-link sc-nav-logout" onClick={onSignOut} title="Log out">
              <span className="sc-nav-icon"><Icon.logout width="17" height="17" /></span>
              <span className="sc-nav-link-text">Log out</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* ---- Main column ---- */}
      <div className="sc-main">
        <header className="sc-topbar">
          <button type="button" className="sc-sidebar-toggle" onClick={() => { setSidebarCollapsed(v => !v); setMobileDrawerOpen(v => !v); }} title="Toggle menu">
            <Icon.menu width="17" height="17" />
          </button>
          <div className="sc-topbar-search-wrap">
            <div className="sc-topbar-search">
              <Icon.search width="15" height="15" />
              <input
                type="text"
                value={globalQuery}
                placeholder="Search vehicles, clients, reservations…"
                onChange={e => { setGlobalQuery(e.target.value); setGlobalOpen(true); }}
                onFocus={() => setGlobalOpen(true)}
                onBlur={() => setTimeout(() => setGlobalOpen(false), 150)}
                onKeyDown={e => { if (e.key === "Escape") { setGlobalQuery(""); setGlobalOpen(false); e.currentTarget.blur(); } }}
              />
              {globalQuery && (
                <button type="button" className="sc-topbar-search-clear" onMouseDown={e => e.preventDefault()} onClick={() => { setGlobalQuery(""); setGlobalOpen(false); }}>✕</button>
              )}
            </div>
            {globalOpen && globalQuery.trim() && (
              <div className="sc-global-results">
                {!hasGlobalResults ? (
                  <div className="sc-global-results-empty">No matches for "{globalQuery}"</div>
                ) : (
                  <>
                    {globalResults.vehicles.length > 0 && (
                      <div className="sc-global-results-section">
                        <div className="sc-global-results-label">Vehicles</div>
                        {globalResults.vehicles.map(c => (
                          <button type="button" key={c.plate} className="sc-global-result-row"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { navigate(`/car/${encodeURIComponent(c.plate)}`); setGlobalQuery(""); setGlobalOpen(false); }}>
                            <span className="sc-global-result-main">{c.plate} <span className="sc-global-result-sub">· {c.type}</span></span>
                            <span className="sc-global-result-extra">{c.currentClient || c.status}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {globalResults.reservations.length > 0 && (
                      <div className="sc-global-results-section">
                        <div className="sc-global-results-label">Reservations</div>
                        {globalResults.reservations.map((r, i) => (
                          <button type="button" key={i} className="sc-global-result-row"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { navigate("/reservations"); setGlobalQuery(""); setGlobalOpen(false); }}>
                            <span className="sc-global-result-main">{r.client}</span>
                            <span className="sc-global-result-extra">{r.plate || r.carType || "Any"} · {r.pickupDate}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="sc-topbar-actions">
            <NotificationBell staffName={staffName} />
            {/* Clickable avatar + name — opens Activity Panel */}
            <button type="button" onClick={() => setPanelOpen(true)} className="sc-topbar-userbtn"
              style={{ display:"flex", alignItems:"center", gap:8, background:"none", border:"none", cursor:"pointer", padding:"4px 8px", borderRadius:8, transition:"background .15s" }}
              onMouseEnter={e => e.currentTarget.style.background="var(--bg)"}
              onMouseLeave={e => e.currentTarget.style.background="none"}>
              <div style={{ width:30, height:30, borderRadius:"50%", background:"var(--sc-blue)", color:"#fff", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {staffName.charAt(0).toUpperCase()}
              </div>
              <div className="sc-topbar-userbtn-text" style={{ textAlign:"left" }}>
                <div className="sc-user-name">{staffName}</div>
                {role !== "Admin" && (
                  <div style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".4px", background:roleBadge.bg, color:roleBadge.color, padding:"1px 6px", borderRadius:4, display:"inline-block", marginTop:2 }}>{role}</div>
                )}
              </div>
            </button>
            {/* Role badge — for Admins, this is a separate button that opens the Admin Panel */}
            {role === "Admin" && (
              <button type="button" onClick={() => setAdminPanelOpen(true)} className="sc-topbar-role-btn"
                style={{ fontSize:10, fontWeight:600, textTransform:"uppercase", letterSpacing:".4px", background:roleBadge.bg, color:roleBadge.color, padding:"3px 9px", borderRadius:4, border:"none", cursor:"pointer" }}
                title="Open Admin Panel">
                {role}
              </button>
            )}
          </div>
        </header>

        {/* Personal reservation reminder — pickup within 24h, not yet checked out.
            Own reservations show full detail; Admin/Manager additionally see a
            count-only line for other staff's upcoming reservations. */}
        {showReservationBanner && (myUpcoming.length > 0 || othersUpcomingCount > 0) && (
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

      {/* ---- Mobile bottom tab bar ---- */}
      <nav className="sc-bottom-tabs">
        <NavLink to="/" end className={({ isActive }) => `sc-tab${isActive ? " active" : ""}`}>
          <Icon.dashboard width="19" height="19" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/fleet" className={({ isActive }) => `sc-tab${isActive ? " active" : ""}`}>
          <Icon.fleet width="19" height="19" />
          <span>Fleet</span>
        </NavLink>

        <NavLink to={middleTo} className={({ isActive }) => `sc-tab${isActive ? " active" : ""}`} title={middleLabel}>
          <MiddleIcon width="19" height="19" />
          <span>{middleLabel}</span>
        </NavLink>

        <NavLink to="/fuel" className={({ isActive }) => `sc-tab${isActive ? " active" : ""}`}>
          <Icon.fuel width="19" height="19" />
          <span>Fuel</span>
        </NavLink>
        <button type="button" className={`sc-tab${mobileDrawerOpen ? " active" : ""}`} onClick={() => setMobileDrawerOpen(v => !v)}>
          <Icon.menu width="19" height="19" />
          <span>More</span>
        </button>
      </nav>

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

      {adminPanelOpen && <AdminPanel staffName={staffName} onClose={() => setAdminPanelOpen(false)} />}
    </div>
  );
}
