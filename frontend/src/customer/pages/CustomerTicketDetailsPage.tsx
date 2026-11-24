import { customerTicketStatus } from "../utils/customerTicketStatus";
import { CustomerArrivalCode, CustomerArrivalStatus } from "../components/CustomerFallbackPresentations";
import { CardHeader, CardTitle, CardDescription, Separator, CardContent } from "../components/ui";
import { Field, FieldLabel } from "../components/shadcn/field";
import { CustomerDialog } from "../components/details/CustomerDialog";
import { customerTicketBack } from "../components/account/ticketOrigin";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Info as IconInfoCircle,
  QrCode as IconQrcode,
  RefreshCw as IconRefresh,
  Star as IconStar,
  Mail as IconMail,
} from "lucide-react";
import JoinedQueuePage, {
  type JoinedQueuePresentationModel,
} from "../../pages/JoinedQueuePage";
import { formatBookingScheduleDateTime } from "../../utils/dates";
import { Alert, Button, Card, Textarea, ToggleGroup, ToggleGroupItem } from "../components/ui";
import {
  CustomerError,
  CustomerPage,
  StatusBadge,
} from "../components/account/CustomerPage";
import { BusinessMedia } from "../components/details/BusinessMedia";
import { ControlledDrawer } from "../components/details/ControlledDrawer";
function TicketView({ model: m }: { model: JoinedQueuePresentationModel }) {
  const [params] = useSearchParams();
  const back = m.customerAuthenticated
    ? customerTicketBack(params.get("from"))
    : m.backLink;
  const [qr, setQr] = useState(false),
    [contact, setContact] = useState(false),
    [composingReview, setComposingReview] = useState(false),
    [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const reviewContainer = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!m.queueRatingOpen) return;
    const textarea = reviewContainer.current?.querySelector("textarea");
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [m.queueRatingOpen, m.queueRatingComment]);
  const s = m.snapshot,
    t = s?.focusTicket;
  const [qrTicket, setQrTicket] = useState<{ id: string; wasConfirmed: boolean } | null>(null);
  const qrTrigger = useRef<HTMLElement | null>(null);
  const refreshButton = useRef<HTMLButtonElement | null>(null);
  const statusAnchor = useRef<HTMLDivElement | null>(null);
  const openQr = () => {
    if (!t?.id) return;
    setQrTicket({ id: String(t.id), wasConfirmed: Boolean(t.customerConfirmedAt) });
    qrTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQr(true);
  };
  useEffect(() => {
    const opened = qrTicket;
    if (qr && opened && t && String(t.id) === opened.id && (t.status === "skipped" || (!opened.wasConfirmed && t.customerConfirmedAt))) {
      setQrTicket(null);
      setQr(false);
      window.requestAnimationFrame(() => {
        if (t.status === "skipped") statusAnchor.current?.focus();
        else if (qrTrigger.current?.isConnected) qrTrigger.current.focus();
        else if (refreshButton.current && !refreshButton.current.disabled) refreshButton.current.focus();
        else statusAnchor.current?.focus();
      });
    }
  }, [qr, qrTicket, t, t?.id, t?.status, t?.customerConfirmedAt]);
  const theme =
    s?.businessProfileTheme?.theme || s?.publicBoardTheme?.theme || null;
  const completed = t?.status === "served" || t?.serviceOutcome === "completed";
  const confirmed = Boolean(t?.status === "called" && t.customerConfirmedAt);
  const skipped = t?.status === "skipped";
  const served = t?.status === "served" || skipped;
  const reviewLength = Array.from(m.queueRatingComment).length;
  const ticketStatus = customerTicketStatus(t);
  const liveWait = t?.status === "pending_carry_over" || t?.status === "skipped" ? null : t?.estimatedWaitMinutes;
  const displayWait = served ? null : liveWait;
  const rows = [
    ["Joined", t?.joinedAt ? formatBookingScheduleDateTime(t.joinedAt) : "Not available"],
    ["Position", served ? "--" : t?.position != null ? `#${t.position}` : "Not available"],
    [
      "Estimated wait",
      displayWait != null
        ? `${displayWait} min`
        : "Not available",
    ],
    [
      "Queue length",
      served ? "--" : s?.stats.waitingCount != null
        ? `${s.stats.waitingCount} waiting`
        : "Not available",
    ],
    ["Location", m.locationName],
  ];
  return (
    <CustomerPage title="Ticket details" back={back}>
      {m.error ? (
        <CustomerError error={m.error} retry={() => window.location.reload()} />
      ) : null}
      {!s ? (
        <p role="status">Loading ticket…</p>
      ) : (
        <>
          {t ? (
            <Alert data-intent={ticketStatus.key === "served" ? "success" : ticketStatus.key === "called" ? "warning" : "info"} role="status" aria-live="polite">
              <IconInfoCircle />
              <div ref={statusAnchor} tabIndex={-1}><strong>{ticketStatus.label}</strong><p>{ticketStatus.message}</p></div>
            </Alert>
          ) : null}
          {m.queueState.label !== "Open" ? (
            <Alert data-intent="info">
              <IconInfoCircle />
              <div>
                <strong>{m.queueState.label}</strong>
                <p>{m.queueState.message}</p>
              </div>
            </Alert>
          ) : null}
          {m.emailDeliveryFallback ? (
            <Alert data-intent="info">
              <IconInfoCircle />
              Follow live updates on this page. Email updates are not confirmed
              for this ticket.
            </Alert>
          ) : null}
          <Card className="ticket-native-pass">
            <div className="ticket-native-first">
              <div className="customer-detail-hero-wrap"><BusinessMedia theme={theme} name={m.businessName} /><div className="customer-detail-hero-actions"><Button variant="ghost" size="icon" aria-label="Contact vendor" onClick={() => setContact(true)}><IconMail aria-hidden="true" /></Button><Button variant="ghost" render={<Link to={m.vendorDetailsPath} />}>View vendor</Button></div></div>
              <CardHeader data-slot="card-header"><div className="row-between"><CardTitle data-slot="card-title">{m.businessName}</CardTitle><StatusBadge status={ticketStatus.label}/></div><CardDescription data-slot="card-description">{m.locationName}</CardDescription></CardHeader>
              <Separator data-slot="separator" className="ticket-native-heading-divider"/>
              <CardContent data-slot="card-content"><div className="ticket-native-person"><div><span>Ticket number</span><strong className="ticket-number">{t?.ticketNumber || "Not available"}</strong></div><Separator orientation="vertical" data-slot="separator"/><div><span>Customer</span><strong>{t?.customerDisplayName || t?.customerName || "Not available"}</strong></div></div></CardContent>
            </div>
            <div className="booking-detail-seam ticket-native-seam" aria-hidden="true"/>
            <section className="ticket-native-body"><dl className="ticket-native-fields">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd className={served && (label === "Position" || label === "Queue length") ? "customer-ticket-muted-value" : undefined}>{value}</dd></div>)}</dl>
              {m.linkedBookingReference ? <p className="ticket-native-service"><span>Booking reference</span><strong>{m.linkedBookingReference}</strong></p>:null}
              {!completed && !skipped ? <section className="ticket-native-status" aria-label="Current queue"><IconInfoCircle aria-hidden="true"/><div><dl><div><dt>Estimated wait</dt><dd>{displayWait != null ? `${displayWait} min`:"Unavailable"}</dd></div><div><dt>Waiting now</dt><dd>{s.stats.waitingCount??"Unavailable"}</dd></div></dl><p>Currently serving <strong>{s.current?.ticketNumber||s.stats.currentTicketNumber||"--"}</strong></p></div></section> : null}
            </section>
          </Card>
          <div className="customer-detail-refresh"><Button ref={refreshButton} variant="outline" disabled={served} onClick={() => window.location.reload()}><IconRefresh />Refresh ticket</Button></div>
          <div className="customer-action-row">
            {m.canJoinAgain && !confirmed && !served ? <Button variant="outline" render={<Link to={m.joinPath} />}>Join again</Button> : null}
            {completed && !served && m.queueRatingStatus?.eligible && !m.queueRatingStatus.rating ? <Button variant="outline" onClick={() => m.setQueueRatingOpen(true)}><IconStar />Rate vendor</Button> : null}
            {m.queueRatingStatus?.rating ? <p>Rating submitted</p> : null}
            {!m.customerAuthenticated ? <Button render={<Link to="/register/customer" state={m.registrationState} />}>Create customer account</Button> : null}
          </div>
          {(served || m.canCancelTicket || (t && ["waiting", "called", "skipped", "pending_carry_over"].includes(t.status))) ? <div className="customer-action-row customer-detail-sticky-actions customer-detail-primary-actions customer-ticket-primary-actions">
            {skipped ? (m.canJoinAgain ? <Button variant="outline" render={<Link to={m.joinPath} />}>Join again</Button> : <Button variant="outline" disabled>Join again</Button>) : served ? <>
              {m.canJoinAgain ? <Button variant="outline" render={<Link to={m.joinPath} />}>Join again</Button> : <Button variant="outline" disabled>Join again</Button>}
              <Button disabled={!m.customerAuthenticated || !m.queueRatingStatus?.eligible || Boolean(m.queueRatingStatus.rating)} onClick={() => m.setQueueRatingOpen(true)}><IconStar />Rate vendor</Button>
            </> : m.canCancelTicket ? <Button variant="outline" onClick={() => m.setCancelConfirmOpen(true)}>Cancel ticket</Button> : null}
            {served ? null : confirmed ? (m.canJoinAgain ? <Button variant="outline" render={<Link to={m.joinPath} />}>Join again</Button> : <Button variant="outline" disabled>Join again</Button>) : t && ["waiting", "called", "skipped", "pending_carry_over"].includes(t.status) ? <Button onClick={openQr}><IconQrcode />Show QR pass</Button> : null}
          </div> : null}
          <CustomerDialog
            title="Your arrival pass"
            open={qr && Boolean(t && qrTicket?.id === String(t.id))}
            onOpenChange={setQr}
          >
            {m.ticketBarcode}
          </CustomerDialog>
          <ControlledDrawer
            title="Contact vendor"
            open={contact}
            onOpenChange={setContact}
          >
            <div className="customer-page-stack">
              {s.location?.contactEmail || s.tenant.contactEmail ? (
                <a
                  href={`mailto:${s.location?.contactEmail || s.tenant.contactEmail}`}
                >
                  Email vendor
                </a>
              ) : null}
              {s.location?.contactPhone || s.tenant.contactPhone ? (
                <a
                  href={`tel:${s.location?.contactPhone || s.tenant.contactPhone}`}
                >
                  Call vendor
                </a>
              ) : null}
              {!s.location?.contactEmail &&
              !s.tenant.contactEmail &&
              !s.location?.contactPhone &&
              !s.tenant.contactPhone ? (
                <p>
                  Contact details are not available. Please contact the business
                  directly.
                </p>
              ) : null}
            </div>
          </ControlledDrawer>
        </>
      )}
      <ControlledDrawer
        title="Cancel this ticket?"
        open={m.cancelConfirmOpen}
        busy={m.cancelSubmitting}
        onOpenChange={m.setCancelConfirmOpen}
        footer={
          <Button
            disabled={m.cancelSubmitting}
            onClick={() => void m.handleCancelTicket()}
          >
            Confirm cancel
          </Button>
        }
      >
        <div className="customer-page-stack">
          <Alert data-intent="warning">
            <IconInfoCircle />
            Cancelling removes your place in today’s queue. Joining again may
            give you a new position.
          </Alert>
          {m.error ? <CustomerError error={m.error} /> : null}
          <Button
            variant="outline"
            disabled={m.cancelSubmitting}
            onClick={() => m.setCancelConfirmOpen(false)}
          >
            Keep ticket
          </Button>
        </div>
      </ControlledDrawer>
      <ControlledDrawer
        title="Unable to cancel ticket"
        open={m.cancelErrorModalOpen}
        onOpenChange={m.setCancelErrorModalOpen}
      >
        <CustomerError error="We could not verify that this ticket belongs to you." />
      </ControlledDrawer>
      <ControlledDrawer
        title={`Rate ${m.businessName}`}
        open={m.queueRatingOpen}
        busy={m.queueRatingSubmitting}
        onOpenChange={m.setQueueRatingOpen}
        footer={
          <Button
            disabled={!m.queueRatingStars || m.queueRatingSubmitting || composingReview || reviewLength > 500}
            onClick={() => void m.handleSubmitQueueRating()}
          >
            Submit rating
          </Button>
        }
      >
        <div className="customer-page-stack">
          <p>Share a public rating for your completed visit.</p>
          <div className="customer-ticket-rating-display" onPointerLeave={() => setHoveredRating(null)}>
            <ToggleGroup className="customer-ticket-rating-stars" aria-label="Rating" value={m.queueRatingStars ? [String(m.queueRatingStars)] : []} onValueChange={(values) => { setHoveredRating(null); const star = Number(values[0]); if (star >= 1 && star <= 5) m.setQueueRatingStars(star); }}>
              {[1, 2, 3, 4, 5].map(star => <ToggleGroupItem type="button" size="lg" className="customer-ticket-rating-star" key={star} value={String(star)} aria-label={`${star} ${star === 1 ? "star" : "stars"}`} onFocus={() => setHoveredRating(null)} onPointerEnter={(e) => { if (e.pointerType === "mouse") setHoveredRating(star); }}>
                <IconStar aria-hidden="true" color={star <= (hoveredRating ?? m.queueRatingStars) ? "var(--customer-primary)" : "var(--muted)"} fill={star <= (hoveredRating ?? m.queueRatingStars) ? "var(--customer-primary)" : "none"} />
              </ToggleGroupItem>)}
            </ToggleGroup>
            <span className="customer-ticket-rating-number" aria-hidden="true">{(hoveredRating ?? m.queueRatingStars).toFixed(1)}</span>
          </div>
          <Field className="customer-shadcn-field"><div className="customer-review-header"><FieldLabel htmlFor="queue-review">Your review (optional)</FieldLabel><small id="queue-review-count">{reviewLength} / 500</small></div>
            <div ref={reviewContainer}><Textarea id="queue-review" className="customer-review-textarea" rows={2} value={m.queueRatingComment} aria-describedby="queue-review-count" onCompositionStart={() => setComposingReview(true)} onCompositionEnd={(e) => { setComposingReview(false); m.setQueueRatingComment(Array.from(e.currentTarget.value).slice(0, 500).join("")); }} onChange={(e) => m.setQueueRatingComment(composingReview || (e.nativeEvent as InputEvent).isComposing ? e.target.value : Array.from(e.target.value).slice(0, 500).join(""))} /></div>
          </Field>
        </div>
      </ControlledDrawer>
    </CustomerPage>
  );
}
export default function CustomerTicketDetailsPage() {
  return (
    <JoinedQueuePage
      renderArrivalCode={CustomerArrivalCode}
      renderArrivalStatus={(message) => <CustomerArrivalStatus message={message} />}
      renderPresentation={(model) => <TicketView key={model.snapshot?.focusTicket?.id || "loading"} model={model} />}
      renderUnavailable={(error, back) => (
        <CustomerPage title="Ticket details" back={back}>
          <CustomerError error={error} retry={() => window.location.reload()} />
        </CustomerPage>
      )}
      renderPendingPayment={(m) => (
        <CustomerPage title="Confirming payment" back={m.back}>
          {m.error ? (
            <CustomerError error={m.error} />
          ) : (
            <Alert data-intent="info">
              <IconInfoCircle />
              {m.pending
                ? "Payment confirmation is still pending."
                : "We are checking your payment and loading your ticket."}
            </Alert>
          )}
          <Button disabled={m.busy} onClick={() => window.location.reload()}>
            Refresh payment status
          </Button>
        </CustomerPage>
      )}
    />
  );
}
