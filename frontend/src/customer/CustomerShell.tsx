import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { customerAccountApi } from "../api/customerAccount";
import { selectActiveCustomerTicket } from "../utils/customerDashboard";
import { buildJoinedQueuePathWithTicket } from "../queuePaths";
import { useState, type ReactNode } from "react";
import { CustomerSiteFooter } from "./components/CustomerSiteFooter";
import { CustomerDialog } from "./components/details/CustomerDialog";
import {
  Bell as IconBell,
  House as IconHome,
  List as IconList,
  Moon as IconMoon,
  ScanLine as IconScan,
  Search as IconSearch,
  Sun as IconSun,
  UserRound as IconUser,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./customer-theme.css";
import { appUrl } from "../surfaces/surfaceConfig";
import { useCustomerTheme } from "./CustomerTheme";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui";
const navigation = [
  { label: "Home", path: "/dashboard", icon: IconHome },
  { label: "Explore", path: "/vendors", icon: IconSearch },
  { label: "Join Queue", path: "/join", icon: IconScan },
  { label: "Lists", path: "/lists", icon: IconList },
  { label: "Profile", path: "/settings", icon: IconUser },
] as const;
const accountLinks = [
  ["Dashboard", "/dashboard"],
  ["Queue Tickets", "/lists/tickets"],
  ["Bookings", "/lists/bookings"],
  ["Settings", "/settings"],
  ["Notifications", "/inbox"],
] as const;
export default function CustomerShell({ children }: { children: ReactNode }) {
  const { user, token, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const overview = useQuery({
    queryKey: ["customer-account", token],
    queryFn: () => customerAccountApi.getOverview(token!),
    enabled: !!(user && token),
  });
  const inbox = useQuery({
    queryKey: ["customer-inbox", user?.id, undefined],
    queryFn: () =>
      apiRequest<{ unreadCount: number }>("/account/notifications", {
        token: token!,
      }),
    enabled: !!(user && token),
  });
  const activeTicket = selectActiveCustomerTicket(
    overview.data?.overview.tickets || [],
  );
  const { theme, toggleTheme } = useCustomerTheme();
  const location = useLocation();
  const joinIntent =
    new URLSearchParams(location.search).get("intent") === "join";
  const themeLabel = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  function selected(label: string) {
    if (label === "Join Queue")
      return (
        location.pathname === "/join" ||
        location.pathname.startsWith("/join/") ||
        (location.pathname === "/vendors" && joinIntent)
      );
    if (label === "Explore")
      return (
        (location.pathname === "/" ||
          location.pathname.startsWith("/vendors")) &&
        !joinIntent
      );
    if (label === "Home") return location.pathname === "/dashboard";
    if (label === "Lists")
      return (
        /^\/(?:lists(?:\/|$)|account\/(?:lists|tickets|bookings)(?:\/|$))/.test(location.pathname) ||
        location.pathname.startsWith("/ticket/")
      );
    return /^\/(?:settings(?:\/|$)|account\/(?:settings|security|notification-settings|favorites|profile)(?:\/|$))/.test(
      location.pathname,
    );
  }
  return (
    <div className="app-shell customer-app-shell customer-mobile-web">
      <a className="customer-skip-link" href="#customer-content">
        Skip to content
      </a>
      <header className="customer-web-header">
        <a
          href={appUrl("marketing")}
          aria-label="GetPrio home"
          className="customer-brand"
        >
          <img
            src={theme === "dark" ? "/logo-dark.svg" : "/logo.svg"}
            alt="GetPrio"
          />
        </a>
        <div className="customer-web-tools">
          {activeTicket ? (
            <Link
              className="customer-header-ticket"
              to={buildJoinedQueuePathWithTicket(
                activeTicket.tenantSlug,
                activeTicket.lookupCode,
                activeTicket.locationSlug,
              )}
            >
              <strong>{activeTicket.ticketNumber}</strong>
              <small>{activeTicket.status.replaceAll("_", " ")}</small>
            </Link>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            aria-label={themeLabel}
            title={themeLabel}
            onPointerDown={toggleTheme}
          >
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </Button>
          {user ? (
            <>
              <Button
                variant="outline"
                size="icon"
                aria-label="Notifications"
                title="Notifications"
                render={<Link to="/inbox" />}
              >
                <IconBell />
                {typeof inbox.data?.unreadCount === "number" &&
                inbox.data.unreadCount > 0 ? (
                  <span
                    className="customer-unread-count"
                    aria-label={`${inbox.data.unreadCount} unread`}
                  >
                    {inbox.data.unreadCount > 99
                      ? "99+"
                      : inbox.data.unreadCount}
                  </span>
                ) : null}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Account menu"
                  className="customer-avatar-trigger"
                  openOnHover
                >
                  <Avatar>
                    {user.avatarUrl ? (
                      <AvatarImage src={user.avatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback>
                      {user.name?.trim().slice(0, 1).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    {accountLinks.map(([label, path]) => (
                      <DropdownMenuItem key={path} render={<Link to={path} />}>
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setLogoutOpen(true)}>
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button variant="outline" render={<Link to="/login" />}>
              Sign in
            </Button>
          )}
        </div>
      </header>
      <CustomerDialog
        title="Log out?"
        description="You can sign in again whenever you’re ready."
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        busy={loggingOut}
        footer={
          <>
            <Button
              variant="outline"
              disabled={loggingOut}
              onClick={() => setLogoutOpen(false)}
            >
              Stay signed in
            </Button>
            <Button
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                try {
                  await logout();
                  setLogoutOpen(false);
                } finally {
                  setLoggingOut(false);
                }
              }}
            >
              Log out
            </Button>
          </>
        }
      />
      <div className="customer-web-layout">
        <nav
          className="customer-web-navigation"
          aria-label="Customer navigation"
        >
          {navigation.map(({ label, path, icon: Icon }) => (
            <Link
              key={label}
              to={path}
              aria-current={selected(label) ? "page" : undefined}
              className={
                selected(label)
                  ? "customer-navigation-item is-current"
                  : "customer-navigation-item"
              }
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <main
          id="customer-content"
          className="customer-web-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
      <CustomerSiteFooter />
    </div>
  );
}
