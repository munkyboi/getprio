import type { ReactNode } from "react";
import { Anchor, Box, Button, Container, Group } from "@mantine/core";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import { IconLogout } from "@tabler/icons-react";
import BrandMark from "./components/BrandMark";
import { useAuth } from "./context/AuthContext";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import RegisterVendorPage from "./pages/RegisterVendorPage";
import RegisterCustomerPage from "./pages/RegisterCustomerPage";
import CustomerAccountPage from "./pages/CustomerAccountPage";
import VendorDashboardPage from "./pages/VendorDashboardPage";
import PublicQueuePage from "./pages/PublicQueuePage";
import JoinQueuePage from "./pages/JoinQueuePage";
import JoinedQueuePage from "./pages/JoinedQueuePage";
import {
  JOINED_QUEUE_ROUTE_PATH,
  buildMonitorPath,
  LEGACY_MONITOR_ROUTE_PATH,
  MONITOR_ROUTE_PATH
} from "./queuePaths";

function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isDashboardRoute = location.pathname.startsWith("/dashboard");

  return (
    <Box className={isDashboardRoute ? "app-shell dashboard-app-shell" : "app-shell finazze-app-shell"}>
      <Box className={isDashboardRoute ? "topbar dashboard-topbar" : "finazze-topbar"} component="header">
        <Container size={isDashboardRoute ? "100%" : "xl"} w="100%">
          <Group justify="space-between" gap="lg">
            <Anchor c="inherit" component={Link} to="/" underline="never">
              <BrandMark />
            </Anchor>

            <Group component="nav" gap="xs">
              <Button component={Link} to="/#product" variant="subtle" color="dark">
                Product
              </Button>
          {!user ? (
            <>
                  <Button component={Link} to="/#solutions" variant="subtle" color="dark">
                    Solutions
                  </Button>
                  <Button component={Link} to="/#pricing" variant="subtle" color="dark">
                    Pricing
                  </Button>
            </>
          ) : null}
              {user?.tenants?.length ? (
                <Button component={NavLink} to="/dashboard" variant="light" color="dark">
                  Dashboard
                </Button>
              ) : null}
              {user?.roles?.includes("customer") ? (
                <Button component={NavLink} to="/account" variant="subtle" color="dark">
                  Account
                </Button>
              ) : null}
          {user ? (
                <Button leftSection={<IconLogout size={16} />} onClick={logout} variant="subtle" color="dark">
                  Sign out
                </Button>
          ) : (
                <>
                  <Button component={NavLink} to="/login" variant="subtle" color="dark">
                    Log in
                  </Button>
                  <Button component={NavLink} to="/register/vendor" color="orange">
                    Start free
                  </Button>
                </>
          )}
            </Group>
          </Group>
        </Container>
      </Box>

      <Box
        className={isDashboardRoute ? "page-wrap dashboard-page-wrap" : "finazze-page-wrap"}
        component="main"
      >
        {children}
      </Box>
    </Box>
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

function DashboardRedirect() {
  const location = useLocation();

  return (
    <Navigate
      replace
      to={`/dashboard/queue${location.search}${location.hash}`}
    />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path={MONITOR_ROUTE_PATH} element={<BarePage><PublicQueuePage /></BarePage>} />
      <Route path={JOINED_QUEUE_ROUTE_PATH} element={<AppShell><JoinedQueuePage /></AppShell>} />
      <Route path={LEGACY_MONITOR_ROUTE_PATH} element={<LegacyMonitorRedirect />} />
      <Route path="/" element={<AppShell><LandingPage /></AppShell>} />
      <Route path="/login" element={<AppShell><LoginPage /></AppShell>} />
      <Route path="/oauth/callback" element={<AppShell><OAuthCallbackPage /></AppShell>} />
      <Route path="/register/vendor" element={<AppShell><RegisterVendorPage /></AppShell>} />
      <Route path="/register/customer" element={<AppShell><RegisterCustomerPage /></AppShell>} />
      <Route path="/account" element={<AppShell><CustomerAccountPage /></AppShell>} />
      <Route path="/dashboard" element={<DashboardRedirect />} />
      <Route path="/dashboard/:section" element={<AppShell><VendorDashboardPage /></AppShell>} />
      <Route path="/join/:tenantSlug/:locationSlug?" element={<AppShell><JoinQueuePage /></AppShell>} />
      <Route path="*" element={<AppShell><LandingPage /></AppShell>} />
    </Routes>
  );
}
