import { useNavigate, useParams } from "react-router-dom";
import MaintenancePage from "./MaintenancePage";
import MaintenanceAnalyticsPage from "./MaintenanceAnalyticsPage";
import VendorsPage from "./VendorsPage";
import PartsInventoryPage from "./PartsInventoryPage";
import ServiceTemplatesPage from "./ServiceTemplatesPage";
import ChecklistTemplatesPage from "./ChecklistTemplatesPage";
import CustomerJobsPage from "./CustomerJobsPage";
import PurchaseInvoicesPage from "./PurchaseInvoicesPage";

const TABS = [
  { key: "work-orders", label: "Work Orders" },
  { key: "customer-jobs", label: "Customer Jobs" },
  { key: "analytics",   label: "Analytics" },
  { key: "templates",   label: "Service Templates" },
  { key: "checklists",  label: "Checklists" },
  { key: "vendors",     label: "Supplier" },
  { key: "parts",       label: "Inventory" },
  { key: "invoices",    label: "Purchase Invoices" },
];

export default function GaragePage({ staffName, role }) {
  const navigate = useNavigate();
  const { tab } = useParams();
  const activeTab = TABS.some(t => t.key === tab) ? tab : "work-orders";

  return (
    <div>
      <div style={{ padding: "1.25rem 1.5rem 0" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>Garage</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2, marginBottom: 16 }}>
          Maintenance, cost tracking, vendors, and parts inventory.
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: "1.5px solid var(--border)", marginBottom: 4 }}>
          {TABS.map(t => (
            <button key={t.key} type="button"
              onClick={() => navigate(`/garage/${t.key}`)}
              style={{
                padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                background: "none", border: "none", borderBottom: `2.5px solid ${activeTab === t.key ? "var(--sc-blue)" : "transparent"}`,
                color: activeTab === t.key ? "var(--sc-blue)" : "var(--text-muted)", fontFamily: "inherit",
                marginBottom: "-1.5px",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "work-orders" && <MaintenancePage staffName={staffName} role={role} embedded />}
      {activeTab === "customer-jobs" && <CustomerJobsPage staffName={staffName} role={role} />}
      {activeTab === "analytics"   && <MaintenanceAnalyticsPage embedded />}
      {activeTab === "templates"   && <ServiceTemplatesPage staffName={staffName} role={role} />}
      {activeTab === "checklists"  && <ChecklistTemplatesPage staffName={staffName} role={role} />}
      {activeTab === "vendors"     && <VendorsPage staffName={staffName} role={role} />}
      {activeTab === "parts"       && <PartsInventoryPage staffName={staffName} role={role} />}
      {activeTab === "invoices"    && <PurchaseInvoicesPage staffName={staffName} role={role} />}
    </div>
  );
}
