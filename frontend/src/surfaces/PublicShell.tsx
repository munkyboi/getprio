import { useEffect, useState, type ReactNode } from "react";
import { Anchor, Avatar, Box, Burger, Button, Container, Drawer, Group, Stack, Text } from "@mantine/core";
import { Link, useLocation } from "react-router-dom";
import BrandMark from "../components/BrandMark";
import SiteFooter from "../components/SiteFooter";
import { useAuth } from "../context/AuthContext";
import { appUrl } from "./surfaceConfig";
import { publicUniversalAuthEnabled } from "./PublicAuthRedirect";
import { usePublicTheme } from "./PublicTheme";
import PublicThemeToggle from "./PublicThemeToggle";

export default function PublicShell({ children, marketing = false }: { children: ReactNode; marketing?: boolean }) {
  const { user, logout } = useAuth();
  const [opened, setOpened] = useState(false);
  const location = useLocation();
  const publicTheme = usePublicTheme();
  useEffect(() => setOpened(false), [location.pathname, location.search, location.hash]);
  const links = <>
    {marketing ? <><Button component="a" href={appUrl("marketing", "/#product")} variant="subtle" color="dark">Product</Button><Button component="a" href={appUrl("marketing", "/#pricing")} variant="subtle" color="dark">Pricing</Button></> : null}
    {!marketing ? <Button component="a" href={appUrl("customer", "/vendors")} variant="subtle" color="dark">Vendors</Button> : null}
    {marketing ? <><Button component="a" href={appUrl(publicUniversalAuthEnabled ? "marketing" : "vendor", "/login")} variant="subtle" color="dark">Login</Button><Button component="a" href={appUrl(publicUniversalAuthEnabled ? "marketing" : "vendor", "/register")} color="orange">Start Free</Button></> : user ? <><Button component={Link} to="/account/dashboard" variant="subtle" color="dark" leftSection={<Avatar size={28} src={user.avatarUrl}>{user.name.slice(0, 1)}</Avatar>}>My account</Button><Button component={Link} to="/account/bookings" variant="subtle" color="dark">Bookings</Button><Button component={Link} to="/account/tickets" variant="subtle" color="dark">Queue tickets</Button><Button onClick={() => { logout(); setOpened(false); }} variant="subtle" color="dark">Sign out</Button></> : <><Button component={Link} to="/login" variant="subtle" color="dark">Customer login</Button><Button component={Link} to="/register" color="orange">Register</Button></>}
  </>;
  return <Box className={`app-shell finazze-app-shell${marketing ? " public-marketing-shell" : ""}`}>
    <Box component="header" className="finazze-topbar"><Container size="xl" w="100%"><Group className="public-topbar-inner" justify="space-between"><Anchor href={appUrl("marketing")} c="inherit" underline="never">{marketing ? <Group gap="sm" wrap="nowrap" align="center"><img className="getprio-brand-logo" src={publicTheme?.theme === "dark" ? "/logo-dark.svg" : "/logo.svg"} alt="" aria-hidden="true" /><Text fw={900} lh={1}>GetPrio</Text></Group> : <BrandMark />}</Anchor><Group gap="xs" wrap="nowrap"><Group component="nav" aria-label="Main navigation" className="desktop-nav-links" gap="xs">{links}</Group>{marketing ? <PublicThemeToggle /> : null}<Burger className="mobile-nav-trigger" opened={opened} onClick={() => setOpened(!opened)} aria-label="Toggle navigation" /></Group></Group></Container></Box>
    <Drawer classNames={{ body: "mobile-nav-drawer-body", content: `mobile-nav-drawer-content${marketing ? " public-marketing-drawer" : ""}`, header: "mobile-nav-drawer-header" }} opened={opened} onClose={() => setOpened(false)} title="GetPrio navigation" position="right"><Stack>{links}</Stack></Drawer>
    <Box component="main" className="finazze-page-wrap">{children}</Box><SiteFooter />
  </Box>;
}
