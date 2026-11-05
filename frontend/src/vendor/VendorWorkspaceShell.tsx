import { VendorPortal } from "./portal";
import { useRef, useState, type ReactNode, type ElementType } from "react";
import { NavLink } from "react-router-dom";
import { IconMenu2, IconSun, IconMoon, IconLogout, IconExternalLink } from "@tabler/icons-react";
import { Button } from "./components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./components/ui/sheet";
import { VendorPageHeader } from "./VendorPageHeader";
import { Separator } from "./components/ui/separator";
import { workspacePath } from "./workspace";
import { useVendorTheme } from "./useVendorTheme";
import "./styles.css";

type Workspace = "operations" | "administration";
type Item = { section: string; label: string; icon: ElementType };
type Props = {
  workspace: Workspace; canAdmin: boolean; items: Item[]; title: string; eyebrow?: string; description: string;
  name: string; role: string; plan: string; context: ReactNode; children: ReactNode; dialogs: ReactNode;
  businessName: string; locationName: string; publicVendorUrl?: string;
  breadcrumbs?: { label: string; href?: string }[]; headerAction?: ReactNode;
  onBeforeNavigate?: () => boolean; onEdit?: (form: HTMLFormElement) => void;
  onWorkspace: (workspace: Workspace) => void; onLogout: () => void; search: string; hash: string;
};

export function VendorWorkspaceShell(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const {theme,setTheme} = useVendorTheme();
  const workspaceLabel = props.workspace === "operations" ? "Operations" : "Administration";
  const initials = props.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  function guardNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        event.currentTarget.getAttribute("target") === "_blank" ||
        event.currentTarget.getAttribute("href") === window.location.pathname + window.location.search + window.location.hash) return;
    if (props.onBeforeNavigate && !props.onBeforeNavigate()) event.preventDefault();
    else setOpened(false);
  }
  function navigation() {
    return <div className="vendor-navigation-body">
      <div className="vendor-business-context">
        <p className="vendor-eyebrow">Business context</p>
        <div className="vendor-context">{props.context}</div>
      </div>
      <p className="vendor-eyebrow vendor-nav-label">{workspaceLabel}</p>
      <nav aria-label={`${workspaceLabel} navigation`}>
        {props.items.map(({ section, label, icon: Icon }) => <NavLink key={section}
          to={workspacePath(section, props.workspace, props.search, props.hash)} onClick={guardNavigation}>
          <Icon aria-hidden="true" size={18} /><span>{label}</span>
        </NavLink>)}
      </nav>
      <div className="vendor-navigation-account">
        <Separator />
        {props.publicVendorUrl ? <NavLink className="vendor-public-link" to={props.publicVendorUrl} onClick={guardNavigation}><IconExternalLink aria-hidden="true" size={18} />View public page</NavLink> : null}
        <NavLink className="vendor-account-link" to={workspacePath("account", props.workspace, props.search, props.hash)} onClick={guardNavigation}>
          <span className="vendor-avatar" aria-hidden="true">{initials}</span>
          <span><strong>{props.name}</strong><small>{props.role} · {props.plan}</small></span>
        </NavLink>
        <Button variant="ghost" onClick={props.onLogout}><IconLogout data-icon="inline-start" />Log out</Button>
      </div>
    </div>;
  }
  return <VendorPortal.Provider value={root}><div ref={root} className="vendor-workspace" data-vendor-theme={theme} onChangeCapture={(event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const form = target?.closest("form");
    if (form && !target?.closest("[data-vendor-draft-ignore]")) props.onEdit?.(form);
  }}>
    <aside className="vendor-sidebar">
      <NavLink className="vendor-brand" to="/dashboard" onClick={guardNavigation}>
        <img src={theme === "dark" ? "/logo-dark.svg" : "/logo.svg"} alt="" aria-hidden="true" />
        <span><strong>GetPrio</strong><small>Vendor dashboard</small></span>
      </NavLink>
      {navigation()}
    </aside>
    <div className="vendor-workspace-main">
      <header className="vendor-workspace-header">
        <Button className="vendor-menu-trigger" variant="ghost" size="icon" aria-label="Open dashboard navigation" onClick={() => setOpened(true)}><IconMenu2 /></Button>
        <span className="vendor-mobile-brand">GetPrio</span>
        {props.canAdmin ? <ToggleGroup className="vendor-workspace-switch" aria-label="Vendor workspace" value={[props.workspace]} onValueChange={(values) => {
          if (values[0] && values[0] !== props.workspace) { props.onWorkspace(values[0] as Workspace); }
        }} variant="workspace" spacing={1}>
          <ToggleGroupItem value="operations">Operations</ToggleGroupItem>
          <ToggleGroupItem value="administration">Administration</ToggleGroupItem>
        </ToggleGroup> : <span className="vendor-workspace-label">{workspaceLabel}</span>}
        <div className="vendor-header-tools">
          <Button variant="ghost" size="icon" aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`} onClick={() => {
            const next = theme === "light" ? "dark" : "light"; setTheme(next);
          }}>{theme === "light" ? <IconMoon /> : <IconSun />}</Button>
          <NavLink className="vendor-avatar vendor-header-account" aria-label={`Account for ${props.name}`} to={workspacePath("account", props.workspace, props.search, props.hash)} onClick={guardNavigation}>{initials}</NavLink>
        </div>
      </header>
      <main className="vendor-feature-content">
        <VendorPageHeader eyebrow={props.eyebrow} title={props.title} description={props.description} action={props.headerAction}
          breadcrumbs={props.breadcrumbs || [{label: workspaceLabel, href: workspacePath(props.items.find(item => item.section !== "account")?.section || "account", props.workspace, props.search, props.hash)}, {label: props.title}]}
          onNavigate={guardNavigation} />
        {props.children}
        <footer className="vendor-copyright">© 2026 MNK-Labs Software Development Services</footer>
      </main>
    </div>
    {props.dialogs}
    <Sheet open={opened} onOpenChange={setOpened}>
      <SheetContent side="left" container={root} className="vendor-navigation-sheet">
        <SheetHeader><SheetTitle>GetPrio navigation</SheetTitle><SheetDescription>{workspaceLabel} · {props.businessName}</SheetDescription></SheetHeader>
        {navigation()}
      </SheetContent>
    </Sheet>
  </div></VendorPortal.Provider>;
}
