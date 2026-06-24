// src/App.jsx
import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import StaffGate from "./components/StaffGate";
import Layout from "./components/Layout";
import FleetPage from "./pages/FleetPage";
import HistoryPage from "./pages/HistoryPage";
import SoldPage from "./pages/SoldPage";
import SubHirePage from "./pages/SubHirePage";
import ClientsPage from "./pages/ClientsPage";
import CarProfilePage from "./pages/CarProfilePage";
import logo from "./assets/logo.js";

export default function App() {
  const [staffName, setStaffName] = useState(
    () => sessionStorage.getItem("staffName") || ""
  );
  const [role, setRole] = useState(
    () => sessionStorage.getItem("role") || "Staff"
  );

  const handleStaffSet = (name, userRole) => {
    sessionStorage.setItem("staffName", name);
    sessionStorage.setItem("role", userRole || "Staff");
    setStaffName(name);
    setRole(userRole || "Staff");
  };

  const handleSignOut = () => {
    sessionStorage.clear();
    setStaffName("");
    setRole("Staff");
  };

  if (!staffName) {
    return <StaffGate onConfirm={handleStaffSet} logo={logo} />;
  }

  return (
    <BrowserRouter>
      <Layout staffName={staffName} role={role} onSignOut={handleSignOut} logo={logo}>
        <Routes>
          <Route path="/"         element={<FleetPage staffName={staffName} role={role} />} />
          <Route path="/history"  element={<HistoryPage role={role} />} />
          <Route path="/clients"    element={<ClientsPage />} />
          <Route path="/car/:plate" element={<CarProfilePage staffName={staffName} role={role} />} />
          <Route path="/sub-hire" element={<SubHirePage staffName={staffName} />} />
          <Route path="/sold"     element={<SoldPage />} />
          <Route path="*"         element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
