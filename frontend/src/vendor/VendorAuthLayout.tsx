import { useRef, type ReactNode } from "react";
import { OperationButton } from "./OperationsUi";
import { useVendorTheme } from "./useVendorTheme";
import { VendorPortal } from "./portal";
import "./styles.css";
export function VendorAuthLayout({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useVendorTheme();
  return (
    <VendorPortal.Provider value={root}>
      <div
        ref={root}
        className="vendor-workspace vendor-auth"
        data-vendor-theme={theme}
      >
        <div className="ops-row ops-between">
          <p className="vendor-eyebrow">GETPRIO FOR BUSINESS</p>
          <OperationButton
            variant="ghost"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            Use {theme === "light" ? "dark" : "light"} theme
          </OperationButton>
        </div>
        {children}
      </div>
    </VendorPortal.Provider>
  );
}
