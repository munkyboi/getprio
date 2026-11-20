/* eslint-disable react-hooks/refs -- Presentation models forward ref objects to JSX without reading their current values. */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import JoinQueuePage, { type JoinQueuePresentationModel } from "../../pages/JoinQueuePage";
import PaymentReturnPage from "../../pages/PaymentReturnPage";
import { formatDisplayTime } from "../../utils/dates";
import { Alert, Button, Input } from "../components/ui";
import { CustomerError, CustomerPage, StatusBadge } from "../components/account/CustomerPage";
import { BusinessMedia } from "../components/details/BusinessMedia";
import { resolveVendorProfileMedia } from "../../utils/vendorTheme";
import { ControlledDrawer } from "../components/details/ControlledDrawer";
import { CustomerOtpField } from "../components/security/CustomerOtpField";
import { Field, FieldLabel } from "../components/shadcn/field";
import { Switch } from "../components/shadcn/switch";
import { Textarea } from "../components/shadcn/textarea";
import CustomerVendorDetailsPage from "./CustomerVendorDetailsPage";

type IssuedTicket = { path: string; state: unknown };

function JoinView({ model: m, issued }: { model: JoinQueuePresentationModel; issued: IssuedTicket | null }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"confirm" | "details">("confirm");
  const snapshot = m.queueSnapshot;
  const close = () => navigate(m.back, { replace: true, state: { restoreJoinFocus: true } });
  const blocked = m.submitting || m.queueJoinUnavailable || (m.shouldUseTurnstile && !m.turnstileReady);
  const title = issued ? "You’re in the queue" : m.otp ? "Verify your email" : step === "confirm" ? "Join queue" : "Your details";
  const footer = issued ? (
    <Button onClick={() => navigate(issued.path, { replace: true, state: issued.state })}>View issued ticket</Button>
  ) : m.otp ? (
    <><Button variant="outline" disabled={m.submitting} onClick={close}>Cancel and return</Button><Button form="customer-join-otp" type="submit" disabled={m.submitting || m.queueJoinUnavailable || m.otpCode.length !== 6}>{m.submitting ? "Verifying…" : "Verify and join queue"}</Button></>
  ) : step === "confirm" ? (
    <><Button variant="outline" disabled={m.submitting} onClick={close}>Cancel and return</Button><Button disabled={!snapshot || m.submitting || m.queueJoinUnavailable} onClick={() => setStep("details")}>Continue</Button></>
  ) : (
    <><Button variant="outline" disabled={m.submitting} onClick={close}>Cancel and return</Button><Button form="customer-join-details" type="submit" disabled={blocked}>{m.submitting ? (m.canSkipOtp ? "Joining…" : "Sending code…") : m.canSkipOtp ? "Get priority number" : "Send verification code"}</Button></>
  );

  return <>
    <CustomerVendorDetailsPage />
    <ControlledDrawer title={title} description={`${m.pageTitle}${m.locationName ? ` · ${m.locationName}` : ""}`} open containFocus busy={m.submitting} onOpenChange={(open) => { if (!open) close(); }} footer={footer}>
      {m.shouldUseTurnstile ? <div ref={m.turnstileContainerRef} /> : null}
      {!m.tenantInfo || !snapshot ? (m.error ? <CustomerError error={m.error} retry={() => window.location.reload()} /> : <p role="status">Loading queue…</p>) : <div className="customer-join-drawer-content">
        <BusinessMedia variant="join" theme={resolveVendorProfileMedia(snapshot.publicBoardTheme?.theme, snapshot.businessProfileTheme?.theme)} name={m.pageTitle} />
        <section className="customer-join-context" aria-label="Selected queue">
          <h3>{m.pageTitle}</h3><p>{m.locationName}</p><StatusBadge status={m.queueStateBadge.label} />
          <div className="customer-join-metrics"><div><span>Waiting</span><strong>{snapshot.stats.waitingCount ?? "Not available"}</strong></div><div><span>Estimated wait</span><strong>{snapshot.stats.estimatedWaitMinutes != null ? `${snapshot.stats.estimatedWaitMinutes} min` : "Not available"}</strong></div>{snapshot.stats.currentTicketNumber ? <div><span>Now serving</span><strong>{snapshot.stats.currentTicketNumber}</strong></div> : null}</div>
        </section>
        {m.queueJoinUnavailable && !issued ? <Alert data-intent={m.queueIntakePaused ? "warning" : "error"}><Info /><span>{m.queueStateBadge.message}</span></Alert> : null}
        {m.requiresQueuePayment && !issued ? <Alert data-intent="info"><Info /><div><strong>Queue fee: {m.tenantInfo.queueFee.displayAmount}</strong><p>We’ll verify your contact details before opening checkout. Your ticket is issued after payment is confirmed.</p></div></Alert> : null}
        {issued ? <p role="status">Your ticket has been issued. You can view it now.</p> : m.otp ? <form id="customer-join-otp" className="customer-page-stack" onSubmit={m.handleVerifyOtp}>
          <p>Enter the code sent to your {m.otp.deliveryChannel} {m.maskedDeliveryTarget}.</p><p>Expires at {formatDisplayTime(m.otp.expiresAt)}.</p>
          <CustomerOtpField label="Verification code" name="otpCode" value={m.otpCode} onChange={m.setOtpCode} onVerify={() => m.handleVerifyOtp()} verificationKey={m.otp.otpId} autoFocus disabled={m.submitting || m.queueJoinUnavailable} required />
          <Button type="button" variant="link" disabled={m.submitting || m.resendSecondsRemaining > 0} onClick={() => void m.resendOtp()}>{m.resendLabel}</Button>
        </form> : step === "confirm" ? <><p>Confirm this branch before joining.</p>{!m.requiresQueuePayment ? <p>No queue entry payment is requested unless checkout is shown.</p> : null}</> : <form id="customer-join-details" onSubmit={m.handleSubmit} className="customer-page-stack">
          <p>{m.signedInCustomer ? "Your saved details are filled in. Changes here apply to this visit only." : "Enter the details you want on this ticket."}</p>
          <Field><FieldLabel htmlFor="join-name">Name</FieldLabel><Input id="join-name" name="customerName" autoComplete="name" required disabled={m.submitting} value={m.form.customerName} onChange={(e) => m.setForm((f) => ({ ...f, customerName: e.target.value }))} /></Field>
          <Field><FieldLabel htmlFor="join-email">Email</FieldLabel><Input id="join-email" name="customerEmail" type="email" autoComplete="email" required={m.requiresEmail} disabled={m.submitting} value={m.form.customerEmail} onChange={(e) => m.setForm((f) => ({ ...f, customerEmail: e.target.value }))} /></Field>
          <Field><FieldLabel htmlFor="join-phone">Phone</FieldLabel><Input id="join-phone" name="customerPhone" type="tel" autoComplete="tel" required={m.requiresPhone} disabled={m.submitting} value={m.form.customerPhone} onChange={(e) => m.setForm((f) => ({ ...f, customerPhone: e.target.value }))} /></Field>
          <Field><FieldLabel htmlFor="join-notes">Notes</FieldLabel><Textarea id="join-notes" name="notes" disabled={m.submitting} value={m.form.notes} onChange={(e) => m.setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
          <FieldLabel className="customer-switch-row"><span>Email me when I’m almost next</span><Switch className="customer-switch" checked={m.form.notifyByEmail} disabled={m.submitting} onCheckedChange={(checked) => m.setForm((f) => ({ ...f, notifyByEmail: checked }))} /></FieldLabel>
        </form>}
      </div>}
    </ControlledDrawer>
  </>;
}

export default function CustomerQueueJoinPage() {
  const [issued, setIssued] = useState<IssuedTicket | null>(null);
  return <JoinQueuePage onTicketIssued={(path, state) => setIssued({ path, state })} renderPresentation={(model) => <JoinView model={model} issued={issued} />} />;
}

export function CustomerPaymentReturnPage() {
  return <PaymentReturnPage renderPresentation={({ error }) => <CustomerPage title={error ? "Payment return unavailable" : "Returning to your queue"}>{error ? <CustomerError error={error} /> : <p role="status">Checking your payment return…</p>}<Button variant="outline" render={<Link to="/" />}>Back to home</Button></CustomerPage>} />;
}
