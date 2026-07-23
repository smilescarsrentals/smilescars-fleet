// src/pages/DashboardPage.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

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
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-TZ", { hour: "2-digit", minute: "2-digit" });
}
function daysDiff(dateStr, now) {
  return Math.ceil((parseLocalDate(dateStr) - now) / (1000 * 60 * 60 * 24));
}

const ACTION_DOT = {
  "Checked Out":         "var(--sc-yellow-dark)",
  "Returned":            "var(--green)",
  "Booking Extended":    "var(--sc-blue)",
  "Sent to Maintenance": "var(--amber)",
  "Marked Available":    "var(--green)",
  "Staff Use":           "var(--sc-blue)",
  "Sold":                "var(--sc-overdue)",
};

const Icon = {
  car: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M3 13l1.5-5A2 2 0 016.4 6.5h11.2A2 2 0 0119.5 8l1.5 5"/><rect x="2.5" y="13" width="19" height="6" rx="1.5"/><circle cx="7" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/></svg>,
  check: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 5-5"/></svg>,
  calendar: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>,
  return: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 015 5v1"/></svg>,
  alert: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}><path d="M12 9v4"/><circle cx="12" cy="16.2" r="0.3" fill="currentColor"/><path d="M10.3 3.9L2.4 18a1.8 1.8 0 001.5 2.7h16.2a1.8 1.8 0 001.5-2.7L13.7 3.9a1.8 1.8 0 00-3.4 0z"/></svg>,
  plus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}><path d="M12 5v14M5 12h14"/></svg>,
};

export default function DashboardPage({ staffName, role }) {
  const navigate = useNavigate();
  const [fleet, setFleet] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getFleet(), api.getAllReservations(), api.getHistory()])
      .then(([f, r, h]) => {
        setFleet(f.data || []);
        setReservations(r.data || []);
        setHistory(h.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const stats = useMemo(() => {
    const available   = fleet.filter(c => c.status === "Available").length;
    const rented       = fleet.filter(c => c.status === "Rented").length;
    const maintenance  = fleet.filter(c => c.status === "Maintenance").length;
    const staffUse     = fleet.filter(c => c.status === "Staff Use").length;

    const overdue = fleet.filter(c =>
      c.status === "Rented" && c.returnDate && daysDiff(c.returnDate, now) < 0
    ).length;

    const returningThisWeek = fleet.filter(c => {
      if (c.status !== "Rented" || !c.returnDate) return false;
      const diff = daysDiff(c.returnDate, now);
      return diff >= 0 && diff <= 7;
    }).length;

    const upcomingThisWeek = reservations.filter(r => {
      if (!r.pickupDate) return false;
      const diff = daysDiff(r.pickupDate, now);
      return diff >= 0 && diff <= 7;
    });

    return { available, rented, maintenance, staffUse, overdue, returningThisWeek, upcomingCount: upcomingThisWeek.length, upcomingThisWeek };
  }, [fleet, reservations, now]);

  const upcomingSorted = useMemo(() =>
    [...stats.upcomingThisWeek]
      .sort((a, b) => parseLocalDate(a.pickupDate) - parseLocalDate(b.pickupDate))
      .slice(0, 8),
    [stats.upcomingThisWeek]
  );

  const recentActivity = useMemo(() => {
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 1); // yesterday 00:00
    return [...history]
      .filter(h => h.timestamp && new Date(h.timestamp) >= cutoff)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 12);
  }, [history, now]);

  const canViewAll = role === "Admin" || role === "Manager";

  if (loading) {
    return <div className="loading-screen"><div className="spinner" />Loading dashboard…</div>;
  }

  return (
    <div>
      <div className="dash-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: "1.25rem" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Dashboard</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            Welcome back{staffName ? `, ${staffName.split(" ")[0]}` : ""}. Here's your fleet overview.
          </div>
        </div>
        <div className="sc-quick-actions" style={{ marginBottom: 0 }}>
          <button type="button" className="btn btn-primary" onClick={() => navigate("/reservations")}>
            <Icon.plus width="14" height="14" /> New Reservation
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/fleet")}>
            <Icon.car width="14" height="14" /> Add Vehicle
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/fuel")}>
            Fuel Request
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/blacklist")}>
            ⛔ Blacklist Check
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="sc-stat-grid">
        <div className="sc-stat-card tint-blue">
          <div className="sc-stat-top">
            <span className="sc-stat-label">Active Rentals</span>
            <span className="sc-stat-icon blue"><Icon.car width="17" height="17" /></span>
          </div>
          <div className="sc-stat-value">{stats.rented}</div>
          <div className="sc-stat-sub">Currently checked out</div>
        </div>

        <div className="sc-stat-card tint-green">
          <div className="sc-stat-top">
            <span className="sc-stat-label">Available Cars</span>
            <span className="sc-stat-icon green" style={{ background: "var(--green-bg)", color: "var(--green)" }}><Icon.check width="17" height="17" /></span>
          </div>
          <div className="sc-stat-value">{stats.available}</div>
          <div className="sc-stat-sub">Ready to rent</div>
        </div>

        <div className="sc-stat-card tint-yellow">
          <div className="sc-stat-top">
            <span className="sc-stat-label">Upcoming Reservations</span>
            <span className="sc-stat-icon yellow"><Icon.calendar width="17" height="17" /></span>
          </div>
          <div className="sc-stat-value">{stats.upcomingCount}</div>
          <div className="sc-stat-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Next 7 days</span>
            {stats.overdue > 0 && (
              <span style={{ background: "var(--sc-overdue-bg)", color: "var(--sc-overdue)", fontWeight: 700, fontSize: 11, padding: "1px 7px", borderRadius: 99 }}>
                {stats.overdue} overdue
              </span>
            )}
          </div>
        </div>

        <div className="sc-stat-card tint-grey">
          <div className="sc-stat-top">
            <span className="sc-stat-label">Cars Returning</span>
            <span className="sc-stat-icon grey"><Icon.return width="17" height="17" /></span>
          </div>
          <div className="sc-stat-value">{stats.returningThisWeek}</div>
          <div className="sc-stat-sub">Next 7 days</div>
        </div>
      </div>

      {/* Widgets */}
      <div className="sc-widget-grid">
        <div className="sc-widget">
          <div className="sc-widget-header">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div className="sc-widget-title">Upcoming Reservations</div>
              <span style={{ fontSize: 20, fontWeight: 800, color: "var(--sc-blue)", lineHeight: 1 }}>{stats.upcomingCount}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/reservations")}>View all</button>
          </div>
          <div className="sc-widget-sub" style={{ marginTop: -8, marginBottom: 10 }}>Next 7 days, with assigned staff</div>
          {upcomingSorted.length === 0 ? (
            <div className="empty-state" style={{ padding: "1.5rem" }}>
              <p>No reservations in the next 7 days.</p>
            </div>
          ) : (
            <div style={{ maxHeight: upcomingSorted.length > 6 ? 420 : "none", overflowY: upcomingSorted.length > 6 ? "auto" : "visible" }}>
              {upcomingSorted.map(r => {
                const diff = daysDiff(r.pickupDate, now);
                const isUrgent = !r.plate && diff <= 5;
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: isUrgent ? "var(--sc-overdue)" : "var(--sc-blue)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.client}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                        {r.plate || r.carType || "No car assigned"} · {r.staffName || "Unassigned"}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0, textAlign: "right" }}>
                      {diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : fmtDate(r.pickupDate)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="sc-widget">
          <div className="sc-widget-header">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div className="sc-widget-title">Recent Activity</div>
              <span style={{ fontSize: 20, fontWeight: 800, color: "var(--sc-blue)", lineHeight: 1 }}>{recentActivity.length}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/history")}>View all</button>
          </div>
          <div className="sc-widget-sub" style={{ marginTop: -8, marginBottom: 10 }}>Yesterday and today{canViewAll ? " · all staff" : ""}</div>
          {recentActivity.length === 0 ? (
            <div className="empty-state" style={{ padding: "1.5rem" }}>
              <p>No activity yet today or yesterday.</p>
            </div>
          ) : (
            <div style={{ maxHeight: recentActivity.length > 6 ? 420 : "none", overflowY: recentActivity.length > 6 ? "auto" : "visible" }}>
              {recentActivity.map((h, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-light)", fontSize: 13 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: ACTION_DOT[h.action] || "var(--sc-grey)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700 }}>{h.plate}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{h.action}</span>
                    {h.client && <span style={{ color: "var(--text-faint)", fontSize: 12 }}>· {h.client}</span>}
                    {h.staffName && <span style={{ color: "var(--text-faint)", fontSize: 12 }}>· by {h.staffName}</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-faint)", flexShrink: 0 }}>{fmtTime(h.timestamp)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
