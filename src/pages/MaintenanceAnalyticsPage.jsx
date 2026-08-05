import { useState, useEffect, useMemo } from "react";
import { api } from "../lib/api";

function fmtMoney(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function MaintenanceAnalyticsPage() {
  const [logs, setLogs] = useState([]);
  const [items, setItems] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true); setErr("");
    Promise.all([api.getMaintenanceLog(), api.getAllMaintenanceItems(), api.getFleet()])
      .then(([logRes, itemsRes, fleetRes]) => {
        setLogs(logRes?.data || []);
        setItems(itemsRes?.data || []);
        setFleet(fleetRes?.data || []);
      })
      .catch(e => setErr(e.message || "Could not load analytics data."))
      .finally(() => setLoading(false));
  }, []);

  const plateToType = useMemo(() => {
    const map = {};
    fleet.forEach(c => { map[c.plate] = c.type || "Unknown"; });
    return map;
  }, [fleet]);

  const stats = useMemo(() => {
    const totalSpend = logs.reduce((sum, l) => sum + (Number(l.totalCost) || 0), 0);
    const completedCount = logs.filter(l => l.status === "Completed").length;
    const openCount = logs.length - completedCount;
    const avgCost = logs.length > 0 ? totalSpend / logs.length : 0;
    return { totalSpend, completedCount, openCount, avgCost, totalOrders: logs.length };
  }, [logs]);

  // Spend over time — last 6 months, by the month a work order was opened.
  const spendOverTime = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`, label: MONTHS_SHORT[d.getMonth()], total: 0 });
    }
    const byKey = Object.fromEntries(months.map(m => [m.key, m]));
    logs.forEach(l => {
      if (!l.dateOpened) return;
      const key = l.dateOpened.slice(0, 7);
      if (byKey[key]) byKey[key].total += Number(l.totalCost) || 0;
    });
    return months;
  }, [logs]);

  // Top 5 most expensive cars, all-time.
  const topCars = useMemo(() => {
    const perCar = {};
    logs.forEach(l => { if (l.totalCost > 0) perCar[l.plate] = (perCar[l.plate] || 0) + Number(l.totalCost); });
    return Object.entries(perCar).sort((a,b) => b[1]-a[1]).slice(0,5).map(([plate,total]) => ({ plate, total }));
  }, [logs]);

  // Top repair types — grouped by item name (case-insensitive), by total spend.
  const topRepairTypes = useMemo(() => {
    const byName = {};
    items.forEach(it => {
      const key = (it.itemName || "Unnamed").trim();
      if (!byName[key]) byName[key] = { name: key, total: 0, count: 0 };
      byName[key].total += Number(it.lineTotal) || 0;
      byName[key].count += 1;
    });
    return Object.values(byName).sort((a,b) => b.total-a.total).slice(0,5);
  }, [items]);

  // Cost by vehicle type — work order's plate -> Fleet's type.
  const costByType = useMemo(() => {
    const byType = {};
    logs.forEach(l => {
      if (!l.totalCost) return;
      const type = plateToType[l.plate] || "Unknown";
      byType[type] = (byType[type] || 0) + Number(l.totalCost);
    });
    return Object.entries(byType).sort((a,b) => b[1]-a[1]).map(([type,total]) => ({ type, total }));
  }, [logs, plateToType]);

  return (
    <div style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Maintenance Analytics</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>Spend and repair trends across the fleet.</div>
      </div>

      {err && <p style={{ color: "var(--red)", fontSize: 13 }}>{err}</p>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>Loading…</div>
      ) : logs.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-faint)", fontStyle: "italic" }}>No maintenance data yet — analytics will populate once work orders are logged.</p>
      ) : (
        <>
          <div className="sc-stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 24 }}>
            <div className="sc-stat-card tint-blue">
              <div className="sc-stat-label">Total Spend</div>
              <div className="sc-stat-value">TZS {fmtMoney(stats.totalSpend)}</div>
            </div>
            <div className="sc-stat-card tint-green">
              <div className="sc-stat-label">Work Orders</div>
              <div className="sc-stat-value">{stats.totalOrders}</div>
            </div>
            <div className="sc-stat-card tint-amber">
              <div className="sc-stat-label">Open / Completed</div>
              <div className="sc-stat-value">{stats.openCount} / {stats.completedCount}</div>
            </div>
            <div className="sc-stat-card tint-yellow">
              <div className="sc-stat-label">Avg Cost / Order</div>
              <div className="sc-stat-value">TZS {fmtMoney(stats.avgCost)}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <ChartCard title="Spend Over Time (last 6 months)">
              <BarChart data={spendOverTime.map(m => ({ label: m.label, value: m.total }))} color="var(--sc-blue)" money />
            </ChartCard>

            <ChartCard title="Top 5 Most Expensive Cars">
              {topCars.length === 0 ? <EmptyChart /> : (
                <BarChart data={topCars.map(c => ({ label: c.plate, value: c.total }))} color="var(--green)" horizontal money />
              )}
            </ChartCard>

            <ChartCard title="Top Repair Types (by item)">
              {topRepairTypes.length === 0 ? <EmptyChart /> : (
                <BarChart data={topRepairTypes.map(r => ({ label: r.name, value: r.total, sub: `${r.count}x` }))} color="#d97706" horizontal money />
              )}
            </ChartCard>

            <ChartCard title="Cost by Vehicle Type">
              {costByType.length === 0 ? <EmptyChart /> : (
                <BarChart data={costByType.map(t => ({ label: t.type, value: t.total }))} color="#8b5cf6" horizontal money />
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{ border: "1.5px solid var(--border)", borderRadius: 12, padding: "16px 18px", background: "var(--surface)" }}>
      <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 14px" }}>{title}</p>
      {children}
    </div>
  );
}

function EmptyChart() {
  return <p style={{ fontSize: 12.5, color: "var(--text-faint)", fontStyle: "italic", padding: "1.5rem 0", textAlign: "center" }}>No data yet</p>;
}

// Simple hand-built bar chart — vertical (for time series) or horizontal
// (for ranked lists like top cars / top repair types). No charting library
// needed for this data shape (small category counts, single series).
function BarChart({ data, color, horizontal = false, money = false }) {
  const max = Math.max(1, ...data.map(d => d.value));
  const fmt = (v) => money ? `${fmtMoney(v)}` : v;

  if (horizontal) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {data.map((d, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{d.label}{d.sub ? <span style={{ color: "var(--text-faint)", fontWeight: 400 }}> · {d.sub}</span> : ""}</span>
              <span style={{ color: "var(--text-muted)" }}>{fmt(d.value)}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--bg)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(d.value / max) * 100}%`, background: color, borderRadius: 4, transition: "width .2s" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600 }}>{d.value > 0 ? fmt(d.value) : ""}</span>
          <div style={{
            width: "100%", maxWidth: 34, borderRadius: "4px 4px 0 0", background: color,
            height: `${Math.max(2, (d.value / max) * 100)}%`, minHeight: 2, transition: "height .2s",
          }} />
          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
