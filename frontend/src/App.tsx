import type { ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import RegisterVendorPage from "./pages/RegisterVendorPage";
import RegisterCustomerPage from "./pages/RegisterCustomerPage";
import VendorDashboardPage from "./pages/VendorDashboardPage";
import PublicQueuePage from "./pages/PublicQueuePage";
import JoinQueuePage from "./pages/JoinQueuePage";
import {
  buildMonitorPath,
  LEGACY_MONITOR_ROUTE_PATH,
  MONITOR_ROUTE_PATH
} from "./queuePaths";

function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">Prio</span>
          <span className="brand-text">Priority Queue Platform</span>
        </Link>

        <nav className="nav-links">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/register/vendor">For Vendors</NavLink>
          <NavLink to="/register/customer">For Customers</NavLink>
          {user?.tenants?.length ? <NavLink to="/dashboard">Dashboard</NavLink> : null}
          {user ? (
            <button className="ghost-button" onClick={logout} type="button">
              Sign out
            </button>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
      </header>

      <main className="page-wrap">{children}</main>
    </div>
  );
}

function BarePage({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main className="page-wrap">{children}</main>
    </div>
  );
}

function LegacyMonitorRedirect() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const location = useLocation();

  if (!tenantSlug) {
    return <Navigate to="/" replace />;
  }

  return (
    <Navigate
      replace
      to={`${buildMonitorPath(tenantSlug)}${location.search}${location.hash}`}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path={MONITOR_ROUTE_PATH} element={<BarePage><PublicQueuePage /></BarePage>} />
      <Route path={LEGACY_MONITOR_ROUTE_PATH} element={<LegacyMonitorRedirect />} />
      <Route path="/" element={<AppShell><LandingPage /></AppShell>} />
      <Route path="/login" element={<AppShell><LoginPage /></AppShell>} />
      <Route path="/oauth/callback" element={<AppShell><OAuthCallbackPage /></AppShell>} />
      <Route path="/register/vendor" element={<AppShell><RegisterVendorPage /></AppShell>} />
      <Route path="/register/customer" element={<AppShell><RegisterCustomerPage /></AppShell>} />
      <Route path="/dashboard" element={<AppShell><VendorDashboardPage /></AppShell>} />
      <Route path="/join/:tenantSlug" element={<AppShell><JoinQueuePage /></AppShell>} />
      <Route path="*" element={<AppShell><LandingPage /></AppShell>} />
    </Routes>
  );
}
