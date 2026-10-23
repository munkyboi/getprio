import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconSun, IconMoon } from "@tabler/icons-react";
import { OperationButton } from "./OperationsUi";
import { useVendorTheme } from "./useVendorTheme";
import { VendorPortal } from "./portal";
import "./styles.css";
import "./vendor-auth.css";

export function VendorAuthLayout({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useVendorTheme();
  return (
    <VendorPortal.Provider value={root}>
      <div
        ref={root}
        className="vendor-workspace vendor-auth vendor-auth-surface"
        data-vendor-theme={theme}
      >
        <header className="vendor-auth-header">
          <Link
            className="vendor-auth-brand"
            to="/login"
            aria-label="GetPrio Vendor sign in"
          >
            <img
              src={theme === "dark" ? "/logo-dark.svg" : "/logo.svg"}
              alt=""
              aria-hidden="true"
            />
            <span>
              <strong>GetPrio</strong>
              <small>Vendor workspace</small>
            </span>
          </Link>
          <OperationButton
            variant="ghost"
            aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? (
              <IconMoon aria-hidden="true" data-icon="inline-start" />
            ) : (
              <IconSun aria-hidden="true" data-icon="inline-start" />
            )}
            <span className="vendor-auth-theme-label">Appearance</span>
          </OperationButton>
        </header>
        <main
          className={
            wide ? "vendor-auth-main vendor-auth-main-wide" : "vendor-auth-main"
          }
        >
          {children}
        </main>
      </div>
    </VendorPortal.Provider>
  );
}
