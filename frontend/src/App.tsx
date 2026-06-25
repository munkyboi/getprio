import { useEffect, useState, type ReactNode } from "react";
import { Anchor, Box, Burger, Button, Container, Drawer, Group, Stack } from "@mantine/core";
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
import CustomerBookingDetailPage from "./pages/CustomerBookingDetailPage";
import VendorDashboardPage from "./pages/VendorDashboardPage";
import VendorDiscoveryPage from "./pages/VendorDiscoveryPage";
import VendorProfilePage from "./pages/VendorProfilePage";
import BookingRequestPage from "./pages/BookingRequestPage";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.hash]);

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
  };

  const navLinks = (
    <>
      <Button component={Link} to="/#product" variant="subtle" color="dark">
        Product
      </Button>
      <Button component={NavLink} to="/vendors" variant="subtle" color="dark">
        Vendors
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
        <Button component={NavLink} to="/account/profile" variant="subtle" color="dark">
          Account
        </Button>
      ) : null}
      {user ? (
        <Button leftSection={<IconLogout size={16} />} onClick={handleLogout} variant="subtle" color="dark">
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
    </>
  );

  return (
    <Box className={isDashboardRoute ? "app-shell dashboard-app-shell" : "app-shell finazze-app-shell"}>
      <Box className={isDashboardRoute ? "topbar dashboard-topbar" : "finazze-topbar"} component="header">
        <Container size={isDashboardRoute ? "100%" : "xl"} w="100%">
          <Group className="public-topbar-inner" justify="space-between" gap="lg">
            <Anchor c="inherit" component={Link} to="/" underline="never">
              <BrandMark />
            </Anchor>

            <Group className="desktop-nav-links" component="nav" gap="xs">
              {navLinks}
            </Group>

            <Burger
              aria-label="Open navigation menu"
              className="mobile-nav-trigger"
              color="#241e19"
              hidden={isDashboardRoute}
              onClick={() => setMobileMenuOpen((open) => !open)}
              opened={mobileMenuOpen}
              size="sm"
            />
          </Group>
        </Container>
      </Box>

      {!isDashboardRoute ? (
        <Drawer
          classNames={{
            body: "mobile-nav-drawer-body",
            content: "mobile-nav-drawer-content",
            header: "mobile-nav-drawer-header"
          }}
          onClose={() => setMobileMenuOpen(false)}
          opened={mobileMenuOpen}
          padding="lg"
          position="right"
          size="min(86vw, 360px)"
          title={<BrandMark />}
        >
          <Stack className="mobile-nav-links" gap="xs">
            {navLinks}
          </Stack>
        </Drawer>
      ) : null}

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
      <Route path="/account" element={<Navigate to="/account/profile" replace />} />
      <Route path="/account/profile" element={<AppShell><CustomerAccountPage /></AppShell>} />
      <Route path="/account/tickets" element={<AppShell><CustomerAccountPage /></AppShell>} />
      <Route path="/account/bookings" element={<AppShell><CustomerAccountPage /></AppShell>} />
      <Route path="/account/settings" element={<AppShell><CustomerAccountPage /></AppShell>} />
      <Route path="/account/security" element={<AppShell><CustomerAccountPage /></AppShell>} />
      <Route path="/account/bookings/:bookingId" element={<AppShell><CustomerBookingDetailPage /></AppShell>} />
      <Route path="/vendors" element={<AppShell><VendorDiscoveryPage /></AppShell>} />
      <Route path="/vendors/:tenantSlug/book" element={<AppShell><BookingRequestPage /></AppShell>} />
      <Route path="/vendors/:tenantSlug/book/:serviceSlug" element={<AppShell><BookingRequestPage /></AppShell>} />
      <Route path="/vendors/:tenantSlug" element={<AppShell><VendorProfilePage /></AppShell>} />
      <Route path="/dashboard" element={<DashboardRedirect />} />
      <Route path="/dashboard/:section" element={<AppShell><VendorDashboardPage /></AppShell>} />
      <Route path="/join/:tenantSlug/:locationSlug?" element={<AppShell><JoinQueuePage /></AppShell>} />
      <Route path="*" element={<AppShell><LandingPage /></AppShell>} />
    </Routes>
  );
}
