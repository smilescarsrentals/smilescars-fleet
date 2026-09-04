// src/App.jsx
import { useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import StaffGate from "./components/StaffGate";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import SignaturePage from "./pages/SignaturePage";
import logo from "./assets/logo.js";

// Lazy-loaded: each becomes its own chunk, fetched only when that route is
// actually visited, instead of everyone downloading the whole app (Garage's
// 7 sub-tabs, Blacklist, Sold, etc.) on first login regardless of which
// pages they'll ever open. Dashboard and SignaturePage stay eager — they're
// the very first thing most people see (Dashboard) or an external,
// unauthenticated signer sees (SignaturePage), so lazy-loading them would
// only add a loading flash with no real benefit.
const FleetPage        = lazy(() => import("./pages/FleetPage"));
const HistoryPage      = lazy(() => import("./pages/HistoryPage"));
const SoldPage         = lazy(() => import("./pages/SoldPage"));
const SubHirePage      = lazy(() => import("./pages/SubHirePage"));
const ClientsPage      = lazy(() => import("./pages/ClientsPage"));
const CarProfilePage   = lazy(() => import("./pages/CarProfilePage"));
const FuelPage         = lazy(() => import("./pages/FuelPage"));
const ReservationsPage = lazy(() => import("./pages/ReservationsPage"));
const LeadsPage        = lazy(() => import("./pages/LeadsPage"));
const GaragePage       = lazy(() => import("./pages/GaragePage"));
const BlacklistPage    = lazy(() => import("./pages/BlacklistPage"));
const DriversPage      = lazy(() => import("./pages/DriversPage"));
const TrackingPage     = lazy(() => import("./pages/TrackingPage"));
const MyHRPage         = lazy(() => import("./pages/MyHRPage"));
const HRPage           = lazy(() => import("./pages/HRPage"));
const WorkflowsPage    = lazy(() => import("./pages/WorkflowsPage"));
const AdminPanel        = lazy(() => import("./components/AdminPanel"));

export default function App() {
  const [staffName, setStaffName] = useState(
    () => sessionStorage.getItem("staffName") || ""
  );
  const [role, setRole] = useState(
    () => sessionStorage.getItem("role") || "Staff"
  );
  const [fuelAccess, setFuelAccess] = useState(
    () => JSON.parse(sessionStorage.getItem("fuelAccess") || "[]")
  );

  const handleStaffSet = (name, userRole, userFuelAccess) => {
    sessionStorage.setItem("staffName", name);
    sessionStorage.setItem("role", userRole || "Staff");
    sessionStorage.setItem("fuelAccess", JSON.stringify(userFuelAccess || []));
    setStaffName(name);
    setRole(userRole || "Staff");
    setFuelAccess(userFuelAccess || []);
  };

  const handleSignOut = () => {
    sessionStorage.clear();
    setStaffName("");
    setRole("Staff");
    setFuelAccess([]);
  };

  // Public signature page — no login required
  if (window.location.pathname.startsWith("/sign/")) {
    const token = window.location.pathname.replace("/sign/", "");
    return <BrowserRouter><Routes><Route path="/sign/:token" element={<SignaturePage />} /></Routes></BrowserRouter>;
  }

  if (!staffName) {
    return <StaffGate onConfirm={handleStaffSet} logo={logo} />;
  }

  return (
    <BrowserRouter>
      <Layout staffName={staffName} role={role} onSignOut={handleSignOut} logo={logo}>
        <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted, #888)", fontSize: 14 }}>Loading…</div>}>
          <Routes>
            <Route path="/"           element={role === "Garage Manager" ? <Navigate to="/garage" /> : <DashboardPage staffName={staffName} role={role} />} />
            <Route path="/fleet"      element={<FleetPage staffName={staffName} role={role} />} />
            <Route path="/history"    element={<HistoryPage role={role} />} />
            <Route path="/clients"    element={<ClientsPage />} />
            <Route path="/car/:plate" element={<CarProfilePage staffName={staffName} role={role} />} />
            <Route path="/sub-hire"   element={<SubHirePage staffName={staffName} />} />
            <Route path="/fuel"         element={<FuelPage staffName={staffName} role={role} fuelAccess={fuelAccess} />} />
            <Route path="/reservations" element={<ReservationsPage staffName={staffName} role={role} />} />
            <Route path="/leads"        element={<LeadsPage staffName={staffName} role={role} />} />
            <Route path="/garage"       element={<GaragePage staffName={staffName} role={role} />} />
            <Route path="/garage/:tab"  element={<GaragePage staffName={staffName} role={role} />} />
            <Route path="/sold"         element={<SoldPage />} />
            <Route path="/blacklist"    element={<BlacklistPage staffName={staffName} role={role} />} />
            <Route path="/drivers"      element={<DriversPage staffName={staffName} role={role} />} />
            <Route path="/my-hr"        element={<MyHRPage staffName={staffName} role={role} />} />
            <Route path="/hr"           element={<HRPage staffName={staffName} role={role} />} />
            <Route path="/workflows"    element={<WorkflowsPage staffName={staffName} role={role} />} />
            <Route path="/admin"        element={<AdminPanel staffName={staffName} role={role} />} />
            <Route path="/tracking"     element={<TrackingPage staffName={staffName} role={role} />} />
            <Route path="/sign/:token"  element={<SignaturePage />} />
            <Route path="*"           element={<Navigate to={role === "Garage Manager" ? "/garage" : "/"} />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}
