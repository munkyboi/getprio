import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { IconMenu2 } from "@tabler/icons-react";
import { Button } from "@vendor/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@vendor/components/ui/sheet";
import { TooltipProvider } from "@vendor/components/ui/tooltip";
import { appUrl } from "../surfaces/surfaceConfig";
import { publicUniversalAuthEnabled } from "../surfaces/PublicAuthRedirect";
import { usePublicTheme } from "../surfaces/PublicTheme";
import ThemeToggle from "./ThemeToggle";
import MarketingFooter from "./MarketingFooter";

export default function MarketingShell({ children }: { children: ReactNode }) {
  const state = usePublicTheme();
  const location = useLocation();
  const [opened, setOpened] = useState(false);
  useEffect(() => setOpened(false), [location.pathname, location.search, location.hash]);
  const links = <>
    <Button variant="ghost" render={<a href={appUrl("marketing", "/#product")} />}>Product</Button>
    <Button variant="ghost" render={<a href={appUrl("marketing", "/#pricing")} />}>Pricing</Button>
    <Button variant="ghost" render={<a href={appUrl(publicUniversalAuthEnabled ? "marketing" : "vendor", "/login")} />}>Login</Button>
    <Button render={<a href={appUrl(publicUniversalAuthEnabled ? "marketing" : "vendor", "/register")} />}>Start Free</Button>
  </>;
  return <TooltipProvider><div className="marketing-app public-marketing-shell">
    <header className="marketing-topbar"><div className="marketing-header-inner">
      <Link className="marketing-brand" to="/" aria-label="GetPrio home"><img src={state?.theme === "dark" ? "/logo-dark.svg" : "/logo.svg"} alt="" /><span>GetPrio</span></Link>
      <div className="marketing-header-actions"><nav className="marketing-desktop-nav" aria-label="Main navigation">{links}</nav><ThemeToggle />
        <Sheet open={opened} onOpenChange={setOpened}><SheetTrigger render={<Button className="marketing-menu-trigger" variant="ghost" size="icon" aria-label="Toggle navigation" />}><IconMenu2 aria-hidden="true" /></SheetTrigger>
          <SheetContent className="marketing-mobile-menu"><SheetHeader><SheetTitle>GetPrio navigation</SheetTitle></SheetHeader><nav aria-label="Mobile navigation">{links}</nav></SheetContent>
        </Sheet>
      </div>
    </div></header>
    <main>{children}</main><MarketingFooter />
  </div></TooltipProvider>;
}
