import { IconCreditCard, IconListDetails, IconLogout, IconMoon, IconShieldLock, IconSun, IconUser, IconUsers } from "@tabler/icons-react";
import { ActionIcon, Avatar, Menu } from "@mantine/core";
import type { MouseEvent, ReactNode } from "react";
import type { Session } from "./developerApi";
import "./DeveloperShell.css";

type DeveloperShellProps = {
  children: ReactNode;
  light: boolean;
  onToggleTheme: () => void;
  path: string;
  authenticated?: boolean;
  session?: Session | null;
  onLogout?: () => Promise<void>;
};

const navigation = [
  ["/guides", "Guides"],
  ["/reference", "API reference"],
  ["/#pricing", "Pricing"],
  ["/faq", "FAQ"],
  ["/changelog", "Changelog"],
] as const;

function initials(session?: Session | null) {
  const value = session?.user.displayName || session?.user.name || session?.user.email || "Account";
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
}

function navigateInternal(event: MouseEvent<HTMLAnchorElement>, href: string) {
  // Keep dashboard navigation inside the mounted portal so the shell, loaded
  // project data, and theme state are preserved between account pages.
  if (!href.startsWith("/")) return;
  event.preventDefault();
  if (`${window.location.pathname}${window.location.search}` !== href) {
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export default function DeveloperShell({ children, light, onToggleTheme, path, authenticated = false, session, onLogout }: DeveloperShellProps) {
  return (
    <>
      <a className="developer-shell-skip" href="#main-content">Skip to content</a>
      <header className="developer-shell-header">
        <a className="developer-shell-brand" href="/" aria-label="GetPrio Developers home">
          <img src={light ? "/logo.svg" : "/logo-dark.svg"} alt="GetPrio" />
          <span>developers</span>
        </a>
        <nav aria-label="Developer portal">
          {navigation.map(([href, label]) => (
            <a key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</a>
          ))}
          <a className="developer-shell-login" href={authenticated ? "/dashboard" : "/login"} aria-current={(authenticated ? path.startsWith("/dashboard") : path === "/login") ? "page" : undefined}>{authenticated ? "Workspace" : "Developer login"}</a>
          {authenticated && session && <Menu position="bottom-end" shadow="md" withinPortal={false}>
            <Menu.Target>
              <button type="button" className="developer-shell-avatar-trigger" aria-label="Open account menu" title="Account menu">
                <Avatar size={34} radius="xl" color="blue">{initials(session)}</Avatar>
              </button>
            </Menu.Target>
            <Menu.Dropdown className="developer-shell-menu-dropdown">
              <Menu.Label>{session.user.email}</Menu.Label>
              <Menu.Item component="a" href="/dashboard/account/profile" onClick={(event) => navigateInternal(event, "/dashboard/account/profile")} leftSection={<IconUser size={16} aria-hidden="true" />}>Account profile</Menu.Item>
              {session.developerAccount.role === "owner" ? <>
                <Menu.Item component="a" href="/dashboard/account/billing" onClick={(event) => navigateInternal(event, "/dashboard/account/billing")} leftSection={<IconCreditCard size={16} aria-hidden="true" />}>Billing &amp; wallet</Menu.Item>
                <Menu.Item component="a" href="/dashboard/account/subscriptions" onClick={(event) => navigateInternal(event, "/dashboard/account/subscriptions")} leftSection={<IconListDetails size={16} aria-hidden="true" />}>Project subscriptions</Menu.Item>
                <Menu.Item component="a" href="/dashboard/account/team-security" onClick={(event) => navigateInternal(event, "/dashboard/account/team-security")} leftSection={<IconUsers size={16} aria-hidden="true" />}>Team &amp; security</Menu.Item>
              </> : <Menu.Item component="a" href="/dashboard/account/security" onClick={(event) => navigateInternal(event, "/dashboard/account/security")} leftSection={<IconShieldLock size={16} aria-hidden="true" />}>My security</Menu.Item>}
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconLogout size={16} aria-hidden="true" />} onClick={() => void onLogout?.()}>Logout</Menu.Item>
            </Menu.Dropdown>
          </Menu>}
          <ActionIcon type="button" variant="subtle" onClick={onToggleTheme} aria-label={`Switch to ${light ? "dark" : "light"} theme`}>
            {light ? <IconMoon size={20} /> : <IconSun size={20} />}
          </ActionIcon>
        </nav>
      </header>
      {children}
      <footer className="developer-shell-footer">
        <p>GetPrio Developers <span>· V1 pre-launch preview</span></p>
        <nav aria-label="Developer resources">
          <a href="/guides">Guides</a>
          <a href="/reference">API reference</a>
          <a href="/faq">FAQ</a>
          <a href="/help">Help</a>
          <a href="/changelog">Changelog</a>
          <a href="https://getprio.online/privacy-policy">Privacy</a>
        </nav>
      </footer>
    </>
  );
}
