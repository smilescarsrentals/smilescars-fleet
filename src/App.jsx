// src/App.jsx
import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import StaffGate from "./components/StaffGate";
import Layout from "./components/Layout";
import FleetPage from "./pages/FleetPage";
import HistoryPage from "./pages/HistoryPage";
import SoldPage from "./pages/SoldPage";
import SubHirePage from "./pages/SubHirePage";
import logo from "./assets/logo.js";

export default function App() {
  const [staffName, setStaffName] = useState(
    () => sessionStorage.getItem("staffName") || ""
  );

  const handleStaffSet = (name) => {
    sessionStorage.setItem("staffName", name);
    setStaffName(name);
  };

  const handleSignOut = () => {
    sessionStorage.clear();
    setStaffName("");
  };

  if (!staffName) {
    return <StaffGate onConfirm={handleStaffSet} logo={logo} />;
  }

  return (
    <BrowserRouter>
      <Layout staffName={staffName} onSignOut={handleSignOut} logo={logo}>
        <Routes>
          <Route path="/"         element={<FleetPage staffName={staffName} />} />
          <Route path="/history"  element={<HistoryPage />} />
          <Route path="/sold"     element={<SoldPage />} />
          <Route path="/sub-hire" element={<SubHirePage staffName={staffName} />} />
          <Route path="*"         element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
