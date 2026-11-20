import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft as IconArrowLeft,
  CircleAlert as IconAlertCircle,
} from "lucide-react";
import { Button, Alert, Badge, Separator } from "../ui";
export function CustomerPage({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="customer-page-stack">
      {back ? (
        <div className="customer-back-anchor">
          <Button
            size="icon"
            variant="outline"
            aria-label="Back"
            render={<Link to={back} />}
          >
            <IconArrowLeft />
          </Button>
        </div>
      ) : null}
      <header
        className={
          back ? "customer-page-heading is-subpage" : "customer-page-heading"
        }
      >
        <div className="customer-heading-content">
          <div className="customer-heading-title">
            <h1>{title}</h1>
            {actions}
          </div>
          {!back ? <Separator /> : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}
export function CustomerError({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <Alert data-intent="error">
      <IconAlertCircle aria-hidden="true" />
      <div>
        <strong>Could not load this page</strong>
        <p>{error}</p>
        {retry ? (
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const value = status.toLowerCase();
  const intent = [
    "completed",
    "served",
    "confirmed",
    "paid",
    "verified",
    "reviewed",
  ].includes(value)
    ? "success"
    : ["cancelled", "canceled", "rejected", "expired", "no_show", "missed", "unfulfilled", "failed"].includes(
          value,
        )
      ? "error"
      : ["pending", "unpaid"].includes(value)
        ? "warning"
        : ["waiting", "rescheduled"].includes(value)
          ? "waiting"
          : ["called", "in service"].includes(value)
            ? "called"
            : "neutral";
  return (
    <Badge data-intent={intent}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
