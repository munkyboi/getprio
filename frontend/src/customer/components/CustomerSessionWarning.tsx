import type { SessionWarningPresentation } from "../../context/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./shadcn/dialog";
import { Button } from "./ui";

/** AuthProvider owns all timing and commands; this renderer only presents them. */
export function CustomerSessionWarning({ opened, onContinue, onLogout }: SessionWarningPresentation) {
  return <Dialog open={opened} onOpenChange={(_open, details) => details.cancel()}>
    <DialogContent showCloseButton={false} className="customer-compact-dialog">
      <header><div><p className="customer-eyebrow">Session security</p><DialogTitle>Your session will expire soon</DialogTitle></div></header>
      <div className="customer-dialog-body"><DialogDescription>For your security, you’ll be signed out soon. Continue your session to keep working without losing your place.</DialogDescription></div>
      <footer className="customer-drawer-footer"><Button onClick={onContinue}>Continue session</Button><Button variant="ghost" onClick={onLogout}>Sign out now</Button></footer>
    </DialogContent>
  </Dialog>;
}
