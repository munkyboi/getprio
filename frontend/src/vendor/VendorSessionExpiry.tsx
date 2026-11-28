import { useRef } from "react";
import type { SessionExpiryActions } from "../context/AuthContext";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "./components/ui/dialog";
import { VendorPortal } from "./portal";
import { useVendorTheme } from "./useVendorTheme";

export function VendorSessionExpiry({ onContinue, onSignOut }: SessionExpiryActions) {
  const container = useRef<HTMLDivElement>(null);
  const { theme } = useVendorTheme();
  return (
    <div ref={container} className="vendor-workspace" data-vendor-theme={theme} style={{ display: "contents" }}>
      <VendorPortal.Provider value={container}>
        <Dialog open>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Your session will expire soon</DialogTitle>
            <DialogDescription>Continue your session to keep working without losing your place.</DialogDescription>
            <DialogFooter>
              <Button variant="outline" onClick={onSignOut}>Sign out now</Button>
              <Button onClick={onContinue}>Continue session</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </VendorPortal.Provider>
    </div>
  );
}
