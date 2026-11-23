import { useEffect, useState, type ReactNode } from "react";
import { Anchor, Avatar, Box, Burger, Button, Container, Drawer, Group, Stack } from "@mantine/core";
import { Link, useLocation } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import SiteFooter from "../components/SiteFooter";
import { useAuth } from "../context/AuthContext";
import { appUrl } from "./surfaceConfig";
import { publicUniversalAuthEnabled } from "./publicAuthEnabled";
import { usePublicTheme } from "./PublicTheme";
import { IconMoon, IconSun } from "@tabler/icons-react";

export default function PublicShell({ children, marketing = false }: { children: ReactNode; marketing?: boolean }) {
  if (marketing) return <MarketingPublicShell>{children}</MarketingPublicShell>;
  return <AuthenticatedPublicShell>{children}</AuthenticatedPublicShell>;
}

function MarketingPublicShell({ children }: { children: ReactNode }) {
  const publicTheme = usePublicTheme() ?? { theme: "light" as const, toggleTheme: () => undefined };
  const [opened, setOpened] = useState(false);
  const location = useLocation();
  useEffect(() => setOpened(false), [location.pathname, location.search, location.hash]);

  const loginHref = publicUniversalAuthEnabled ? "/login" : appUrl("vendor", "/login");
  const registerHref = publicUniversalAuthEnabled ? "/register" : appUrl("vendor", "/register");
  const links = <>
    <a className="marketing-nav-link" href="/#product">Product</a>
    <a className="marketing-nav-link" href="/#pricing">Pricing</a>
    <a className="marketing-nav-link" href={loginHref}>Login</a>
    <a className="marketing-nav-cta" href={registerHref}>Start Free</a>
  </>;
  const dark = publicTheme.theme === "dark";

  return <div className="marketing-app public-marketing-shell">
    <header className="marketing-topbar">
      <div className="marketing-header-inner">
        <a className="marketing-brand" href="/" aria-label="GetPrio home">
          <img src={dark ? "/logo-dark.svg" : "/logo.svg"} alt="" aria-hidden="true" />
          <span>GetPrio</span>
        </a>
        <div className="marketing-header-actions">
          <button
            className="public-theme-toggle"
            type="button"
            onClick={publicTheme.toggleTheme}
            aria-label={publicTheme.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={publicTheme.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <IconSun aria-hidden="true" size={18} stroke={1.8} /> : <IconMoon aria-hidden="true" size={18} stroke={1.8} />}
          </button>
          <nav className="marketing-desktop-nav" aria-label="Main navigation">{links}</nav>
          <button
            className="marketing-menu-trigger"
            type="button"
            aria-controls="marketing-mobile-nav"
            aria-expanded={opened}
            aria-label={opened ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setOpened(value => !value)}
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </div>
      <nav id="marketing-mobile-nav" className="marketing-mobile-nav" aria-label="Mobile navigation" hidden={!opened}>
        {links}
      </nav>
    </header>
    <main>{children}</main>
    <SiteFooter />
  </div>;
}

function AuthenticatedPublicShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [opened, setOpened] = useState(false);
  const location = useLocation();
  useEffect(() => setOpened(false), [location.pathname, location.search, location.hash]);
  const links = <>
    <Button component="a" href={appUrl("customer", "/vendors")} variant="subtle" color="dark">Vendors</Button>
    {user ? <><Button component={Link} to="/account/dashboard" variant="subtle" color="dark" leftSection={<Avatar size={28} src={user.avatarUrl}>{user.name.slice(0, 1)}</Avatar>}>My account</Button><Button component={Link} to="/account/bookings" variant="subtle" color="dark">Bookings</Button><Button component={Link} to="/account/tickets" variant="subtle" color="dark">Queue tickets</Button><Button onClick={() => { void logout(); setOpened(false); }} variant="subtle" color="dark">Sign out</Button></> : <><Button component={Link} to="/login" variant="subtle" color="dark">Customer login</Button><Button component={Link} to="/register" color="orange">Register</Button></>}
  </>;
  return <Box className="app-shell finazze-app-shell">
    <Box component="header" className="finazze-topbar"><Container size="xl" w="100%"><Group className="public-topbar-inner" justify="space-between"><Anchor href={appUrl("marketing")} c="inherit" underline="never"><BrandMark /></Anchor><Group component="nav" aria-label="Main navigation" className="desktop-nav-links" gap="xs">{links}</Group><Burger className="mobile-nav-trigger" opened={opened} onClick={() => setOpened(!opened)} aria-label="Toggle navigation" /></Group></Container></Box>
    <Drawer classNames={{ body: "mobile-nav-drawer-body", content: "mobile-nav-drawer-content", header: "mobile-nav-drawer-header" }} opened={opened} onClose={() => setOpened(false)} title="GetPrio navigation" position="right"><Stack>{links}</Stack></Drawer>
    <Box component="main" className="finazze-page-wrap">{children}</Box><SiteFooter />
  </Box>;
}
