import { Link } from "react-router-dom";
import { OperationButton, OperationPanel } from "./OperationsUi";
import { buttonVariants } from "./components/ui/button";

export function WorkspaceLoading({ message }: { message: string }) {
  return <OperationPanel><p role="status">{message}</p></OperationPanel>;
}

export function ActivationPanel({ onViewPlans }: { onViewPlans: () => void }) {
  return (
    <OperationPanel>
      <div className="vendor-access-state">
        <div className="queue-stack">
          <p className="vendor-eyebrow">Subscription required</p>
          <h2>Choose a plan to unlock this workspace.</h2>
          <p className="ops-muted">Queue operations, public links, client data, history, and reports become available after this business has an active plan.</p>
          <div className="config-actions"><OperationButton onClick={onViewPlans}>View plans</OperationButton></div>
        </div>
        <img alt="" src="/illustrations/generated/vendor-onboarding.png" />
      </div>
    </OperationPanel>
  );
}

export function WorkspaceUnavailable({ onSignOut }: { onSignOut: () => void }) {
  return (
    <OperationPanel>
      <main className="vendor-access-state">
        <div className="queue-stack">
          <p className="vendor-eyebrow">Workspace access</p>
          <h1>No business workspace available</h1>
          <p className="ops-muted">Your account does not currently have access to a business workspace.</p>
          <nav className="config-actions" aria-label="Workspace access recovery">
            <Link data-primary className={buttonVariants()} to="/">Back to site</Link>
            <Link className={buttonVariants({ variant: "outline" })} to="/account/dashboard">My account</Link>
            <OperationButton variant="ghost" onClick={onSignOut}>Sign out</OperationButton>
          </nav>
        </div>
        <img alt="" src="/illustrations/generated/vendor-onboarding.png" />
      </main>
    </OperationPanel>
  );
}
