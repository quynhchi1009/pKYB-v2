import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import "./index.css";
import { StoreProvider } from "./state/store";
import { AppShell } from "./components/AppShell";
import { Monitoring } from "./pages/Monitoring";
import { ChooseReport } from "./pages/ChooseReport";
import { SearchPage } from "./pages/SearchPage";
import { Placeholder } from "./pages/Placeholder";
import { ViewReport } from "./pages/ViewReport";
import { ViewReports } from "./pages/ViewReports";

function MonitorRedirect() {
  const { id } = useParams();
  const { search, state } = useLocation();
  const q = new URLSearchParams(search);
  q.set("tab", "pkyb");
  return <Navigate to={`/reports/${id}?${q}`} state={state ?? { from: "monitoring" }} replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/pkyb/monitoring" replace />} />
            <Route path="/pkyb" element={<Navigate to="/pkyb/monitoring" replace />} />
            <Route path="/pkyb/monitoring" element={<Monitoring />} />
            {/* A monitor lives on its report now, as the pKYB Monitoring tab. Old company-page links land there. */}
            <Route path="/pkyb/monitoring/:id" element={<MonitorRedirect />} />
            {/* Settings moved onto the overview; old links open them there. */}
            <Route path="/pkyb/settings" element={<Navigate to="/pkyb/monitoring?settings=severity" replace />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/report/:id" element={<ChooseReport />} />
            <Route path="/reports" element={<ViewReports />} />
            <Route path="/reports/:id" element={<ViewReport />} />
            <Route path="*" element={<Placeholder />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </StoreProvider>
  </StrictMode>,
);
