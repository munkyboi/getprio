import { useRef, type ReactNode } from "react";
import { Text } from "@mantine/core";
import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import { readPreference, preferenceKey, workspacePath, activeMemberships } from "../vendor/workspace";
import { VendorNavigationGuard } from "../vendor/navigationGuard";
import { useAuth } from "../context/AuthContext";
import { VendorAuthLayout } from "../vendor/VendorAuthLayout";
import LoginPage from "../pages/LoginPage";
import RegisterVendorPage from "../pages/RegisterVendorPage";
import OAuthCallbackPage from "../pages/OAuthCallbackPage";
import VendorDashboardPage from "../pages/VendorDashboardPage";
import QueueAutoClosePrototype from "../pages/prototypes/QueueAutoClosePrototype";
import SecureQueueBoardPage from "../pages/SecureQueueBoardPage";
import NotFoundPage from "../pages/NotFoundPage";
import MaintenanceBoundary from "../components/MaintenanceBoundary";
import PublicAuthRedirect, { publicUniversalAuthEnabled } from "./PublicAuthRedirect";
function VendorAuthEntry({ mode }: { mode: "login" | "register" }) {
  const location = useLocation();
  const { user } = useAuth();
  if (mode === "login" && new URLSearchParams(location.search).has("resetToken")) return <LoginPage />;
  // OAuth's explicit authenticated business-completion form is retained.
  if (mode === "register" && user) return <RegisterVendorPage />;
  return <PublicAuthRedirect surface="vendor" mode={mode} />;
}
function WorkspaceShell({ children }: { children: ReactNode }) {
  const guard = useRef<(() => boolean) | null>(null);
  return <VendorNavigationGuard.Provider value={guard}><div className="vendor-app-frame" onClickCapture={event => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && link.getAttribute("target") !== "_blank" && guard.current && !guard.current()) { event.preventDefault(); event.stopPropagation(); }
  }}>{children}</div></VendorNavigationGuard.Provider>;
}
function DashboardRedirect() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const tenant = activeMemberships(user?.tenants || [])[0];
  const role = tenant?.role;
  const saved = user?.id && tenant?.slug ? readPreference(preferenceKey(user.id, tenant.slug)) : null;
  const workspace = (role === "owner" || role === "admin") && saved === "administration" ? "administration" : "operations";
  if (loading) return <Text>Loading vendor workspace...</Text>;

  return (
    <Navigate
      replace
      to={workspacePath(workspace === "administration" ? "settings" : "overview", workspace, location.search, location.hash)}
    />
  );
}

function VendorDashboardRoute() {
  const location = useLocation();
  const prototypeEnabled =
    import.meta.env.DEV &&
    location.pathname === "/dashboard/queue" &&
    new URLSearchParams(location.search).get("queueClosePrototype") === "1";

  return prototypeEnabled ? <QueueAutoClosePrototype /> : <VendorDashboardPage />;
}

function VendorEntryRoute() {
  const { user, loading } = useAuth();
  const hasVendorMembership = activeMemberships(user?.tenants || []).length > 0;

  if (loading) {
    return (
      <VendorAuthLayout>
        <p className="ops-muted" role="status" aria-busy="true">
          Loading workspace...
        </p>
      </VendorAuthLayout>
    );
  }

  if (hasVendorMembership) {
    return <Navigate replace to="/dashboard" />;
  }

  return user ? (
    <Navigate replace to="/register/vendor" />
  ) : (
    <Navigate replace to="/login?next=%2Fdashboard" />
  );
}


export default function VendorApp() {
  return <MaintenanceBoundary><Routes>
    <Route path="/" element={<VendorEntryRoute />} />
    <Route path="/login" element={publicUniversalAuthEnabled ? <VendorAuthEntry mode="login" /> : <LoginPage />} />
    <Route path="/register" element={publicUniversalAuthEnabled ? <VendorAuthEntry mode="register" /> : <RegisterVendorPage />} />
    <Route path="/register/vendor" element={publicUniversalAuthEnabled ? <VendorAuthEntry mode="register" /> : <RegisterVendorPage />} />
    <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
    <Route path="/dashboard" element={<DashboardRedirect />} />
    <Route path="/dashboard/services/:routeServiceSlug/edit" element={<WorkspaceShell><VendorDashboardRoute /></WorkspaceShell>} />
    <Route path="/dashboard/locations/:locationSlug/edit" element={<WorkspaceShell><VendorDashboardRoute /></WorkspaceShell>} />
    <Route path="/dashboard/:section" element={<WorkspaceShell><VendorDashboardRoute /></WorkspaceShell>} />
    <Route path="/queue-board/:boardId" element={<SecureQueueBoardPage />} />
    <Route path="*" element={<VendorAuthLayout><NotFoundPage /></VendorAuthLayout>} />
  </Routes></MaintenanceBoundary>;
}
