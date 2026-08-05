// src/App.jsx
import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import StaffGate from "./components/StaffGate";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import FleetPage from "./pages/FleetPage";
import HistoryPage from "./pages/HistoryPage";
import SoldPage from "./pages/SoldPage";
import SubHirePage from "./pages/SubHirePage";
import ClientsPage from "./pages/ClientsPage";
import CarProfilePage from "./pages/CarProfilePage";
import FuelPage from "./pages/FuelPage";
import ReservationsPage from "./pages/ReservationsPage";
import LeadsPage from "./pages/LeadsPage";
import MaintenancePage from "./pages/MaintenancePage";
import MaintenanceAnalyticsPage from "./pages/MaintenanceAnalyticsPage";
import BlacklistPage from "./pages/BlacklistPage";
import SignaturePage from "./pages/SignaturePage";
import logo from "./assets/logo.js";

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
        <Routes>
          <Route path="/"           element={role === "Garage Manager" ? <Navigate to="/maintenance" /> : <DashboardPage staffName={staffName} role={role} />} />
          <Route path="/fleet"      element={<FleetPage staffName={staffName} role={role} />} />
          <Route path="/history"    element={<HistoryPage role={role} />} />
          <Route path="/clients"    element={<ClientsPage />} />
          <Route path="/car/:plate" element={<CarProfilePage staffName={staffName} role={role} />} />
          <Route path="/sub-hire"   element={<SubHirePage staffName={staffName} />} />
          <Route path="/fuel"         element={<FuelPage staffName={staffName} role={role} fuelAccess={fuelAccess} />} />
          <Route path="/reservations" element={<ReservationsPage staffName={staffName} role={role} />} />
          <Route path="/leads"        element={<LeadsPage staffName={staffName} role={role} />} />
          <Route path="/maintenance"  element={<MaintenancePage staffName={staffName} role={role} />} />
          <Route path="/maintenance-analytics" element={<MaintenanceAnalyticsPage />} />
          <Route path="/sold"         element={<SoldPage />} />
          <Route path="/blacklist"    element={<BlacklistPage staffName={staffName} role={role} />} />
          <Route path="/sign/:token"  element={<SignaturePage />} />
          <Route path="*"           element={<Navigate to={role === "Garage Manager" ? "/maintenance" : "/"} />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
