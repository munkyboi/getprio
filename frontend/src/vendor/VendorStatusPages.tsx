import { Link } from "react-router-dom";
import type { MaintenancePresentationModel } from "../components/MaintenanceBoundary";
import { appUrl } from "../surfaces/surfaceConfig";
import { OperationAlert, OperationButton, OperationPanel } from "./OperationsUi";
import { VendorAuthLayout } from "./VendorAuthLayout";
import { buttonVariants } from "./components/ui/button";

export function VendorMaintenance({ pending, forced, enabled, message, isError, isFetching, headingRef, children, onRetry }: MaintenancePresentationModel) {
  if (pending) return <VendorAuthLayout><p role="status">Checking service availability…</p></VendorAuthLayout>;
  if (forced) {
    return (
      <VendorAuthLayout>
        <OperationPanel>
          <div className="queue-stack">
            <h1 ref={headingRef} tabIndex={-1}>GetPrio is undergoing maintenance</h1>
            <p>{message}</p>
            <p>New bookings and queue joins are temporarily paused. Existing tickets, bookings, and vendor services remain available.</p>
            {isError && <OperationAlert color="red" title="Could not check the latest status">Please try again.</OperationAlert>}
            <OperationButton loading={isFetching} onClick={onRetry}>Check again</OperationButton>
            <Link to="/login">Staff / admin sign in</Link>
            <a href={appUrl("customer", "/account/tickets")}>My existing tickets</a>
            <a href={appUrl("customer", "/account/bookings")}>My existing bookings</a>
          </div>
        </OperationPanel>
      </VendorAuthLayout>
    );
  }
  return <>
    {enabled && <OperationAlert title="New bookings and queue joins are paused">{message} Existing services can continue.</OperationAlert>}
    {children}
  </>;
}

export function VendorNotFound() {
  return (
    <VendorAuthLayout>
      <OperationPanel>
        <div className="queue-stack">
          <h1>Page not found</h1>
          <p>The vendor page you’re looking for may have moved, or the link may be out of date.</p>
          <Link className={buttonVariants()} to="/">Back to home</Link>
          <a className={buttonVariants({ variant: "outline" })} href={appUrl("customer", "/vendors")}>Browse vendors</a>
        </div>
      </OperationPanel>
    </VendorAuthLayout>
  );
}
