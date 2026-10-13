import { useEffect, useRef, useState, type ReactNode, type ElementType } from "react";
import { NavLink } from "react-router-dom";
import { IconMenu2, IconSun, IconMoon, IconLogout } from "@tabler/icons-react";
import { Button } from "./components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./components/ui/sheet";
import { Separator } from "./components/ui/separator";
import { readPreference, savePreference, workspacePath } from "./workspace";
import "./styles.css";

type Workspace = "operations" | "administration";
type Item = { section: string; label: string; icon: ElementType };
type Props = {
  workspace: Workspace; canAdmin: boolean; items: Item[]; title: string; description: string;
  name: string; role: string; plan: string; context: ReactNode; children: ReactNode; dialogs: ReactNode;
  onBeforeNavigate?: () => boolean; onEdit?: (form: HTMLFormElement) => void;
  onWorkspace: (workspace: Workspace) => void; onLogout: () => void; search: string; hash: string;
};

export function VendorWorkspaceShell(props: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = readPreference("getprio.vendor.theme");
    return saved === "dark" || saved === "light" ? saved :
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const change = () => { if (!readPreference("getprio.vendor.theme")) setTheme(query.matches ? "dark" : "light"); };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  function navigation() {
    return <div className="vendor-navigation-body">
      {props.canAdmin ? <ToggleGroup aria-label="Vendor workspace" value={[props.workspace]} onValueChange={(values) => {
        if (values[0]) { props.onWorkspace(values[0] as Workspace); setOpened(false); }
      }} variant="outline">
        <ToggleGroupItem value="operations">Operations</ToggleGroupItem>
        <ToggleGroupItem value="administration">Administration</ToggleGroupItem>
      </ToggleGroup> : <p className="vendor-eyebrow">Operations workspace</p>}
      <nav aria-label={`${props.workspace === "operations" ? "Operations" : "Administration"} navigation`}>
        {props.items.map(({ section, label, icon: Icon }) => <NavLink key={section}
          to={workspacePath(section, props.workspace, props.search, props.hash)} onClick={(event) => { if (props.onBeforeNavigate && !props.onBeforeNavigate()) event.preventDefault(); else setOpened(false); }}>
          <Icon aria-hidden="true" size={20} /><span>{label}</span>
        </NavLink>)}
      </nav>
      <div className="vendor-navigation-account">
        <Separator />
        <p>{props.name}<small>{props.role} · {props.plan}</small></p>
        <Button variant="outline" onClick={props.onLogout}><IconLogout data-icon="inline-start" />Log out</Button>
      </div>
    </div>;
  }
  return <div ref={root} className="vendor-workspace" data-vendor-theme={theme} onChangeCapture={(event) => {
    const form = event.target instanceof HTMLElement ? event.target.closest("form") : null;
    if (form) props.onEdit?.(form);
  }}>
    <aside className="vendor-sidebar"><NavLink className="vendor-brand" to="/dashboard" onClick={(event) => { if (props.onBeforeNavigate && !props.onBeforeNavigate()) event.preventDefault(); }}>GetPrio<span>Vendor workspace</span></NavLink>{navigation()}</aside>
    <div className="vendor-workspace-main">
      <header className="vendor-workspace-header">
        <div className="vendor-title-row"><Button className="vendor-menu-trigger" variant="outline" size="icon" aria-label="Open dashboard navigation" onClick={() => setOpened(true)}><IconMenu2 /></Button>
          <div><p className="vendor-eyebrow">{props.workspace === "operations" ? "Operations" : "Administration"}</p><h1>{props.title}</h1></div>
          <Button variant="outline" size="icon" aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`} onClick={() => {
            const next = theme === "light" ? "dark" : "light"; savePreference("getprio.vendor.theme", next); setTheme(next);
          }}>{theme === "light" ? <IconMoon /> : <IconSun />}</Button>
        </div>
        <p className="vendor-page-description">{props.description}</p>
        <div className="vendor-context">{props.context}</div>
      </header>
      <main className="vendor-feature-content">{props.children}</main>
    </div>
    {props.dialogs}
    <Sheet open={opened} onOpenChange={setOpened}>
      <SheetContent side="left" container={root} className="vendor-navigation-sheet">
        <SheetHeader><SheetTitle>GetPrio navigation</SheetTitle><SheetDescription>Your permitted vendor workspace</SheetDescription></SheetHeader>
        {navigation()}
      </SheetContent>
    </Sheet>
  </div>;
}
