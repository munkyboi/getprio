import { useEffect, useRef, useState, type ReactNode } from "react";
import { Anchor, Avatar, Box, Burger, Button, Container, Drawer, Group, Menu, Stack, Text } from "@mantine/core";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import { IconChevronDown, IconLogout } from "@tabler/icons-react";
import BrandMark from "./components/BrandMark";
import { useAuth } from "./context/AuthContext";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import ContactPage from "./pages/ContactPage";
import RegisterVendorPage from "./pages/RegisterVendorPage";
import RegisterCustomerPage from "./pages/RegisterCustomerPage";
import CustomerAccountPage from "./pages/CustomerAccountPage";
import CustomerBookingDetailPage from "./pages/CustomerBookingDetailPage";
import VendorDashboardPage from "./pages/VendorDashboardPage";
import VendorDiscoveryPage from "./pages/VendorDiscoveryPage";
import VendorProfilePage from "./pages/VendorProfilePage";
import BookingRequestPage from "./pages/BookingRequestPage";
import GroupFundedCampaignPage from "./pages/GroupFundedCampaignPage";
import PublicQueuePage from "./pages/PublicQueuePage";
import JoinQueuePage from "./pages/JoinQueuePage";
import JoinedQueuePage from "./pages/JoinedQueuePage";
import TermsPage from "./pages/TermsPage";
import NotFoundPage from "./pages/NotFoundPage";
import SiteFooter from "./components/SiteFooter";
import {
  JOINED_QUEUE_ROUTE_PATH,
  buildMonitorPath,
  LEGACY_MONITOR_ROUTE_PATH,
  MONITOR_ROUTE_PATH
} from "./queuePaths";

function getUserInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isDashboardRoute = location.pathname.startsWith("/dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const primaryTenant = user?.tenants?.find((tenant) => tenant.isActive !== false) || user?.tenants?.[0] || null;
  const isVendor = Boolean(primaryTenant);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.hash]);

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
  };

  const publicLinks = (
    <>
      <Button component={Link} to="/#product" variant="subtle" color="dark">Product</Button>
      {!user ? <Button component={Link} to="/#solutions" variant="subtle" color="dark">Solutions</Button> : null}
      {!user ? <Button component={Link} to="/#pricing" variant="subtle" color="dark">Pricing</Button> : null}
      <Button component={NavLink} to="/vendors" variant="subtle" color="dark">Vendors</Button>
      {!user ? <Button component={NavLink} to="/login" variant="subtle" color="dark">Login</Button> : null}
      {!user ? <Button component={NavLink} to="/register/vendor" color="orange">Start Free</Button> : null}
    </>
  );

  const customerMenu = (
    <Menu shadow="md" width={220} position="bottom-end" withinPortal>
      <Menu.Target>
        <Button className="header-avatar-button" variant="subtle" color="dark" rightSection={<IconChevronDown size={14} />}>
          <Avatar color="orange" radius="xl" size={28}>
            {getUserInitials(user?.name || "User")}
          </Avatar>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{user?.name || "Account"}</Menu.Label>
        <Menu.Item component={Link} to="/account/profile">Profile details</Menu.Item>
        <Menu.Item component={Link} to="/account/tickets">Queue Tickets</Menu.Item>
        <Menu.Item component={Link} to="/account/bookings">Bookings</Menu.Item>
        <Menu.Item component={Link} to="/account/group-funded">Group-funded</Menu.Item>
        <Menu.Item component={Link} to="/account/settings">Settings</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={handleLogout}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const vendorMenu = primaryTenant ? (
    <Menu shadow="md" width={240} position="bottom-end" withinPortal>
      <Menu.Target>
        <Button className="header-avatar-button" variant="subtle" color="dark" rightSection={<IconChevronDown size={14} />}>
          <Avatar color="orange" radius="xl" size={28}>
            {getUserInitials(user?.name || primaryTenant.name)}
          </Avatar>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{primaryTenant.name}</Menu.Label>
        <Menu.Item component={Link} to="/dashboard">Dashboard</Menu.Item>
        <Menu.Item component={Link} to={`/vendors/${primaryTenant.slug}`}>View vendor page</Menu.Item>
        <Menu.Item component={Link} to={buildMonitorPath(primaryTenant.slug)}>View queue board</Menu.Item>
        <Menu.Item component={Link} to="/dashboard/settings">Settings</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconLogout size={14} />} onClick={handleLogout}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  ) : null;

  return (
    <Box className={isDashboardRoute ? "app-shell dashboard-app-shell" : "app-shell finazze-app-shell"}>
      <Box className={isDashboardRoute ? "topbar dashboard-topbar" : "finazze-topbar"} component="header">
        <Container size={isDashboardRoute ? "100%" : "xl"} w="100%">
          <Group className="public-topbar-inner" justify="space-between" gap="lg">
            <Anchor c="inherit" component={Link} to="/" underline="never">
              <BrandMark />
            </Anchor>

            <Group className="desktop-nav-links" component="nav" gap="xs">
              {publicLinks}
              {user ? isVendor ? vendorMenu : customerMenu : null}
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
            {publicLinks}
            {user ? (
              <>
                <Text c="dimmed" fw={700} size="sm" mt="sm">Account</Text>
                {isVendor ? (
                  <>
                    <Button component={Link} to="/dashboard" variant="subtle" color="dark">Dashboard</Button>
                    <Button component={Link} to={`/vendors/${primaryTenant?.slug || ""}`} variant="subtle" color="dark">View vendor page</Button>
                    <Button component={Link} to={buildMonitorPath(primaryTenant?.slug || "")} variant="subtle" color="dark">View queue board</Button>
                    <Button component={Link} to="/dashboard/settings" variant="subtle" color="dark">Settings</Button>
                  </>
                ) : (
                  <>
                    <Button component={Link} to="/account/profile" variant="subtle" color="dark">Profile details</Button>
                    <Button component={Link} to="/account/tickets" variant="subtle" color="dark">Queue Tickets</Button>
                    <Button component={Link} to="/account/bookings" variant="subtle" color="dark">Bookings</Button>
                    <Button component={Link} to="/account/group-funded" variant="subtle" color="dark">Group-funded</Button>
                    <Button component={Link} to="/account/settings" variant="subtle" color="dark">Settings</Button>
                  </>
                )}
                <Button leftSection={<IconLogout size={16} />} onClick={handleLogout} variant="subtle" color="dark">
                  Sign out
                </Button>
              </>
            ) : null}
          </Stack>
        </Drawer>
      ) : null}

      <Box
        className={isDashboardRoute ? "page-wrap dashboard-page-wrap" : "finazze-page-wrap"}
        component="main"
      >
        {children}
      </Box>

      {!isDashboardRoute ? <SiteFooter /> : null}
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

function getVendorBookingTabRoute(pathname: string) {
  const match = pathname.match(/^\/vendors\/([^/]+)(?:\/(group-funded))?$/);
  if (!match) {
    return null;
  }

  return {
    tenantSlug: match[1],
    tab: match[2] === "group-funded" ? "group-funded" : "standard"
  };
}

function ScrollToTop() {
  const location = useLocation();
  const previousRouteRef = useRef({
    pathname: location.pathname,
    search: location.search
  });

  useEffect(() => {
    const currentRoute = `${location.pathname}${location.search}`;
    const previousRoute = `${previousRouteRef.current.pathname}${previousRouteRef.current.search}`;
    if (previousRoute === currentRoute) {
      return;
    }

    const previousVendorTab = getVendorBookingTabRoute(previousRouteRef.current.pathname);
    const currentVendorTab = getVendorBookingTabRoute(location.pathname);
    const isVendorBookingTabSwitch =
      Boolean(previousVendorTab && currentVendorTab) &&
      previousVendorTab?.tenantSlug === currentVendorTab?.tenantSlug &&
      previousVendorTab?.tab !== currentVendorTab?.tab;

    previousRouteRef.current = {
      pathname: location.pathname,
      search: location.search
    };

    if (isVendorBookingTabSwitch) {
      return;
    }

    if (location.hash) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.hash, location.pathname, location.search]);

  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path={MONITOR_ROUTE_PATH} element={<BarePage><PublicQueuePage /></BarePage>} />
        <Route path={JOINED_QUEUE_ROUTE_PATH} element={<AppShell><JoinedQueuePage /></AppShell>} />
        <Route path={LEGACY_MONITOR_ROUTE_PATH} element={<LegacyMonitorRedirect />} />
        <Route path="/" element={<AppShell><LandingPage /></AppShell>} />
        <Route path="/login" element={<AppShell><LoginPage /></AppShell>} />
        <Route path="/oauth/callback" element={<AppShell><OAuthCallbackPage /></AppShell>} />
        <Route path="/privacy-policy" element={<AppShell><PrivacyPolicyPage /></AppShell>} />
        <Route path="/contact" element={<AppShell><ContactPage /></AppShell>} />
        <Route path="/terms" element={<AppShell><TermsPage /></AppShell>} />
        <Route path="/register/vendor" element={<AppShell><RegisterVendorPage /></AppShell>} />
        <Route path="/register/customer" element={<AppShell><RegisterCustomerPage /></AppShell>} />
        <Route path="/account" element={<Navigate to="/account/profile" replace />} />
        <Route path="/account/profile" element={<AppShell><CustomerAccountPage /></AppShell>} />
        <Route path="/account/tickets" element={<AppShell><CustomerAccountPage /></AppShell>} />
        <Route path="/account/bookings" element={<AppShell><CustomerAccountPage /></AppShell>} />
        <Route path="/account/group-funded" element={<AppShell><CustomerAccountPage /></AppShell>} />
        <Route path="/account/settings" element={<AppShell><CustomerAccountPage /></AppShell>} />
        <Route path="/account/notifications" element={<AppShell><CustomerAccountPage /></AppShell>} />
        <Route path="/account/security" element={<AppShell><CustomerAccountPage /></AppShell>} />
        <Route path="/account/bookings/:bookingId" element={<AppShell><CustomerBookingDetailPage /></AppShell>} />
        <Route path="/group-funded/:publicToken" element={<AppShell><GroupFundedCampaignPage /></AppShell>} />
        <Route path="/vendors" element={<AppShell><VendorDiscoveryPage /></AppShell>} />
        <Route path="/vendors/:tenantSlug/book" element={<AppShell><BookingRequestPage /></AppShell>} />
        <Route path="/vendors/:tenantSlug/book/:serviceSlug" element={<AppShell><BookingRequestPage /></AppShell>} />
        <Route path="/vendors/:tenantSlug/group-funded" element={<AppShell><VendorProfilePage /></AppShell>} />
        <Route path="/vendors/:tenantSlug" element={<AppShell><VendorProfilePage /></AppShell>} />
        <Route path="/dashboard" element={<DashboardRedirect />} />
        <Route path="/dashboard/:section" element={<AppShell><VendorDashboardPage /></AppShell>} />
        <Route path="/join/:tenantSlug/:locationSlug?" element={<AppShell><JoinQueuePage /></AppShell>} />
        <Route path="*" element={<AppShell><NotFoundPage /></AppShell>} />
      </Routes>
    </>
  );
}
