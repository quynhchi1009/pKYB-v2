import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { StoreProvider } from "./state/store";
import { AppShell } from "./components/AppShell";
import { Monitoring } from "./pages/Monitoring";
import { MonitorDetail } from "./pages/MonitorDetail";
import { ChooseReport } from "./pages/ChooseReport";
import { SearchPage } from "./pages/SearchPage";
import { Placeholder } from "./pages/Placeholder";
import { ViewReport } from "./pages/ViewReport";
import { ViewReports } from "./pages/ViewReports";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/pkyb/monitoring" replace />} />
            <Route path="/pkyb" element={<Navigate to="/pkyb/monitoring" replace />} />
            <Route path="/pkyb/monitoring" element={<Monitoring />} />
            <Route path="/pkyb/monitoring/:id" element={<MonitorDetail />} />
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
