import { CustomerBookingUnavailable, CustomerLoading } from "../components/CustomerFallbackPresentations";
import { useAuth } from "../../context/AuthContext";
import { API_BASE_URL } from "../../api/client";
import type { PublicVendorProfileResponse } from "@shared";
import { showCustomerError } from "../../utils/customerNotifications";
import { useParams } from "react-router-dom";
import { CardHeader, CardContent } from "../components/ui";
import { Field, FieldLabel } from "../components/shadcn/field";
import { Textarea } from "../components/shadcn/textarea";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapPin, CalendarDays, Mail,
  Info as IconInfoCircle,
  RefreshCw as IconRefresh,
  Star as IconStar,
} from "lucide-react";
import CustomerBookingDetailPage, {
  type CustomerBookingDetailPresentationModel,
} from "../../pages/CustomerBookingDetailPage";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
} from "../../utils/dates";
import { Button, Card, Input, Alert } from "../components/ui";
import { CustomerPage, StatusBadge } from "../components/account/CustomerPage";
import { BusinessMedia } from "../components/details/BusinessMedia";
import { ControlledDrawer } from "../components/details/ControlledDrawer";
import { ResponsiveDrawer } from "../components/vendor/ResponsiveDrawer";
type BookingSelectionDisplayV4 = NonNullable<CustomerBookingDetailPresentationModel["booking"]["resourceSelection"]>;

export function associateBookingResources(serviceNames: string[], groups: BookingSelectionDisplayV4["services"]) {
  const assigned = new Map<number, BookingSelectionDisplayV4["services"][number]>();
  const unassigned: BookingSelectionDisplayV4["services"] = [];
  for (const group of groups) {
    const matches = serviceNames.flatMap((name, index) => name === group.name ? [index] : []);
    if (matches.length === 1 && groups.filter(candidate => candidate.name === group.name).length === 1) assigned.set(matches[0], group);
    else unassigned.push(group);
  }
  return { assigned, unassigned };
}

function ResourceDetails({ resources, serviceName }: { resources: BookingSelectionDisplayV4["services"][number]["resources"]; serviceName: string }) {
  return <>{resources.map((resource, index) => <p key={index}>{resource.name === serviceName ? "Resource" : resource.name} · {resource.quantity} × {resource.durationMinutes} minutes{resource.extras.map(extra => ` · ${extra.name}: ${extra.quantity} × ${extra.durationMinutes} minutes`).join("")}</p>)}</>;
}
export function AccountServiceThumbnail({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const restoreFocus = () => window.requestAnimationFrame(() => container.current?.closest<HTMLElement>(".booking-detail-service")?.focus());
  return <div className="booking-service-thumbnail" ref={container}>
    {imageUrl && (!failed || open) ? <ResponsiveDrawer title={`View ${name} image`} triggerVariant="ghost" open={open} onOpenChange={next => { setOpen(next); if (!next && failed) restoreFocus(); }} trigger={<img src={imageUrl} alt="" onError={event => { const focused = document.activeElement === event.currentTarget.closest("button"); setFailed(true); if (!open && focused) restoreFocus(); }} />}>
      <img className="customer-service-expanded-image" src={imageUrl} alt={name} onError={event => { if (event.currentTarget.getAttribute("src") !== "/logo.svg") event.currentTarget.src = "/logo.svg"; event.currentTarget.alt = "Image unavailable"; }} />
    </ResponsiveDrawer> : <img src="/logo.svg" alt="" />}
  </div>;
}
const money = (cents: number, currency = "PHP") =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(
    cents / 100,
  );
function BookingDetailsView({
  model: m,
}: {
  model: CustomerBookingDetailPresentationModel;
}) {
  const b = m.booking;
  const [proofOpen, setProofOpen] = useState(false);
  const [contactFor, setContactFor] = useState("");
  const identity = JSON.stringify([b.id, b.tenantSlug, b.locationSlug]);
  const [scope, setScope] = useState({ key: identity, generation: 0 });
  if (scope.key !== identity) setScope({ key: identity, generation: scope.generation + 1 });
  const generation = scope.generation;
  const identityRef = useRef(scope);
  useLayoutEffect(() => { identityRef.current = scope; }, [scope]);
  const [contactData, setContactData] = useState<{ generation: number; email?: string; phone?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE_URL}/public/vendors/${encodeURIComponent(b.tenantSlug)}`, { credentials: "omit", signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Contact unavailable"); return response.json() as Promise<PublicVendorProfileResponse>; })
      .then(({ vendor }) => { if (!controller.signal.aborted && identityRef.current.generation === generation) { const location = vendor?.slug === b.tenantSlug ? vendor.locations.find(item => item.slug === b.locationSlug) : undefined; setContactData({ generation, email: location?.contactEmail, phone: location?.contactPhone }); } })
      .catch(() => { if (!controller.signal.aborted && identityRef.current.generation === generation) setContactData({ generation }); });
    return () => controller.abort();
  }, [b.id, b.tenantSlug, b.locationSlug, generation]);
  const vendorLocation = contactData?.generation === generation ? contactData : null;
  useEffect(() => {
    if (b.paymentProof) setProofOpen(false);
  }, [b.paymentProof]);
  const contact = b;
  const resourceGroups = associateBookingResources(m.services.map(service => service.serviceName), b.resourceSelection?.services || []);
  return (
    <CustomerPage
      title="Booking details"
      subtitle={b.reference}
      back="/account/bookings"
    >
      {m.error ? (
        <Alert data-intent="error">
          <IconInfoCircle />
          {m.error}
        </Alert>
      ) : null}
      {m.linkedQueuePath ? (
        <Alert data-intent="success">
          <IconInfoCircle />
          <div>
            <strong>You&apos;re checked in</strong>
            <p>
              Your booking is linked to a queue ticket.{" "}
              <Link to={m.linkedQueuePath}>Open linked queue ticket</Link>
            </p>
          </div>
        </Alert>
      ) : b.status === "confirmed" || b.status === "rescheduled" ? (
        <Alert data-intent="success">
          <IconInfoCircle />
          <div>
            <strong>Your visit is confirmed</strong>
            <p>Check your visit details and check in when you arrive.</p>
          </div>
        </Alert>
      ) : (
        <Alert data-intent={b.status === "pending" ? "warning" : "info"}>
          <IconInfoCircle />
          <div>
            <strong>
              {b.status === "pending"
                ? "Waiting for vendor confirmation"
                : "Booking update"}
            </strong>
            <p>
              {b.fulfillmentOutcomeReason ||
                b.expirationReason ||
                `This booking is ${b.status}.`}
            </p>
          </div>
        </Alert>
      )}
      <Card className="booking-detail-pass"><div className="booking-detail-first">
        <div className="customer-detail-hero-wrap"><BusinessMedia name={b.tenantName} theme={m.vendorTheme} /><div className="customer-detail-hero-actions"><Button variant="ghost" size="icon" aria-label="Contact vendor" onClick={() => setContactFor(`${generation}:${b.id}:${b.tenantSlug}:${b.locationSlug}`)}><Mail aria-hidden="true" /></Button><Button variant="ghost" render={<Link to={`/vendors/${encodeURIComponent(b.tenantSlug)}?location=${encodeURIComponent(b.locationSlug)}`} />}>View vendor</Button></div></div>
        <CardHeader data-slot="card-header">
          <h2>{b.reference}</h2>
          <div className="booking-detail-badges">
            <StatusBadge status={b.status} />
            <StatusBadge status={b.paymentStatus} />
          </div>
        </CardHeader><CardContent data-slot="card-content"><div className="booking-detail-vendor"><MapPin /><div><strong>{b.tenantName}</strong><p>{b.locationName}</p></div></div>
          <div className="booking-detail-schedule">
            <div className="customer-action-row"><CalendarDays /><strong>{formatBookingScheduleDate(b.scheduledStartAt)}</strong></div>
            <p>
              {formatBookingScheduleTimeRange(
                b.scheduledStartAt,
                b.scheduledEndAt,
              )}
            </p>
            <div className="booking-detail-schedule-meta">
              <span>
                {m.totalBookingHoursLabel} · {m.services.length} service
                {m.services.length === 1 ? "" : "s"}
              </span>
              <strong>{m.bookingTotalFeeDisplay}</strong>
            </div>
          </div>

        </CardContent></div>
        <div className="booking-detail-seam" aria-hidden="true" />
        <section className="booking-detail-group">
          <h3>Booked services</h3>
          {b.resourceSelection ? (
            <>
              {b.resourceSelection.warning ? (
                <Alert data-intent="warning">
                  {b.resourceSelection.warning}
                </Alert>
              ) : null}
            </>
          ) : null}
          {m.services.map((s, i) => (
            <div
              className="booking-detail-service"
              key={`${s.serviceSlug}-${i}`}
              tabIndex={-1}
            >
              <AccountServiceThumbnail key={`${s.serviceSlug}:${s.imageUrl || ""}`} imageUrl={s.imageUrl} name={s.serviceName} />
              <div className="booking-detail-service-copy">
                <strong>{s.serviceName}</strong>
                <p>
                  {formatBookingScheduleTimeRange(
                    s.scheduledStartAt,
                    s.scheduledEndAt,
                  )}{" "}
                  (
                  {Math.max(
                    0,
                    Math.round(
                      (new Date(s.scheduledEndAt).getTime() -
                        new Date(s.scheduledStartAt).getTime()) /
                        60000,
                    ),
                  )}{" "}
                  mins)
                </p>
                <strong>
                  {b.resourceSelection
                    ? "Amount confirmed by vendor"
                    : money(s.priceAmountCents, s.currency)}
                </strong>
                {resourceGroups.assigned.has(i) ? <ResourceDetails serviceName={s.serviceName} resources={resourceGroups.assigned.get(i)!.resources} /> : null}
              </div><StatusBadge status={`×${s.bookingQuantity}`} />
            </div>
          ))}
          {resourceGroups.unassigned.length ? <div><h3>Selected resources</h3>{resourceGroups.unassigned.map((group, index) => <div key={index}><strong>{group.name}</strong><ResourceDetails serviceName={group.name} resources={group.resources} /></div>)}</div> : null}
        </section>
        <div className="booking-detail-seam" aria-hidden="true" />
        <section className="booking-detail-group booking-detail-visit">
          <div className="account-payment-heading"><h3>Your payment</h3><StatusBadge status={b.paymentStatus} /></div>
          <dl className="account-payment-contacts">{[["Customer", contact.customerName], ["Email", contact.customerEmail], ["Phone", contact.customerPhone === "" ? "Not provided" : contact.customerPhone]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{typeof value === "string" && value ? value : "Not available"}</dd></div>)}</dl>
          {m.isGroupFundedBooking ? (
            b.groupFundedCampaign ? (
              <div className="customer-record-list">
                <h3>
                  {b.groupFundedCampaign.campaignTitle || "Group payment"}
                </h3>
                <StatusBadge status={b.groupFundedCampaign.campaignStatus} />
                <dl className="customer-detail-facts">
                  <div>
                    <dt>Organizer</dt>
                    <dd>{b.groupFundedCampaign.organizerDisplayName}</dd>
                  </div>
                  <div>
                    <dt>Contributions received</dt>
                    <dd>
                      {b.groupFundedCampaign.paidParticipantCount} of{" "}
                      {b.groupFundedCampaign.requiredContributors}
                    </dd>
                  </div>
                  <div>
                    <dt>Amount received</dt>
                    <dd>
                      {money(
                        b.groupFundedCampaign.fundedAmountCents,
                        b.groupFundedCampaign.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment target</dt>
                    <dd>
                      {money(
                        b.groupFundedCampaign.targetAmountCents +
                          (b.groupFundedCampaign.roundingAdjustmentCents || 0),
                        b.groupFundedCampaign.currency,
                      )}
                    </dd>
                  </div>
                </dl>
                <p>Contact the organizer for contribution or refund details.</p>
              </div>
            ) : (
              <p>
                Group payment details are unavailable. Contact the organizer for
                contribution or refund details.
              </p>
            )
          ) : !b.serviceManualPaymentRequired ? (
            <p>No payment proof is required for this booking.</p>
          ) : (
            <div className="booking-detail-payment-flow account-payment-actions">
              <p>
                {b.paymentVerifiedAt
                  ? "Your payment has been verified."
                  : b.paymentRejectedAt
                    ? b.paymentRejectionReason ||
                      "Payment proof was rejected. Contact the vendor."
                    : b.paymentProof
                      ? "Your payment proof is waiting for vendor review."
                      : "Complete the vendor payment, then send your receipt."}
              </p>
              {m.proofSubmissionAllowed && !b.paymentProof ? (
                <Button onClick={() => setProofOpen(true)}>
                  Submit payment proof
                </Button>
              ) : null}
              {b.paymentProof ? (
                <Button
                  variant="outline"
                  disabled={m.proofViewBusy}
                  onClick={() => void m.handleViewPaymentProof()}
                >
                  {m.proofViewBusy ? "Opening…" : "View payment proof"}
                </Button>
              ) : null}
            </div>
          )}

        </section>
      </Card>
      <div className="customer-detail-refresh"><Button variant="outline" onClick={m.refresh}><IconRefresh />Refresh status</Button></div>{!m.cancellationAllowed ? <div className="customer-action-row"><Link to={`/vendors/${encodeURIComponent(b.tenantSlug)}`}>Contact vendor to reschedule</Link></div> : null}
      <div className="customer-action-row customer-detail-sticky-actions customer-detail-primary-actions customer-booking-detail-primary-actions">
        {m.cancellationAllowed ? <Button variant="outline" onClick={() => m.setCancelModalOpen(true)}>Cancel booking</Button> : null}
                  {m.linkedQueuePath ? (
            <Button variant="default" render={<Link to={m.linkedQueuePath} />}>
              {m.checkInActionLabel}
            </Button>
          ) : (
            <Button
              variant="default"
              disabled={
                !m.customerArrivalAvailable ||
                m.busy ||
                m.proofBusy ||
                m.arrivalBusy
              }
              onClick={() => void m.markArrival()}
            >
              {m.arrivalBusy ? "Checking in…" : m.checkInActionLabel}
            </Button>
          )}
      </div>
      <ControlledDrawer title="Contact vendor" open={contactFor === `${generation}:${b.id}:${b.tenantSlug}:${b.locationSlug}`} onOpenChange={open => { if (!open) setContactFor(""); }}><div className="customer-page-stack">{vendorLocation?.email ? <a href={`mailto:${vendorLocation.email}`}>Email vendor</a> : null}{vendorLocation?.phone ? <a href={`tel:${vendorLocation.phone}`}>Call vendor</a> : null}{!vendorLocation ? <p role="status">Loading contact details…</p> : !vendorLocation.email && !vendorLocation.phone ? <p>Contact details are not available. Please contact the business directly.</p> : null}</div></ControlledDrawer>
      {["completed", "reviewed"].includes(b.status) ? (
        <Card>
          <h2>Rate your visit</h2>
          {m.ratingSubmitted ? (
            <p>Thank you for your review.</p>
          ) : (
            <>
              <div className="customer-action-row">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    variant="ghost"
                    size="icon"
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    aria-pressed={m.ratingStars === n}
                    onClick={() => m.setRatingStars(n)}
                  >
                    <IconStar
                      fill={n <= m.ratingStars ? "currentColor" : "none"}
                      className={
                        n <= m.ratingStars
                          ? "customer-star-filled"
                          : "customer-star-empty"
                      }
                    />
                  </Button>
                ))}
              </div>
              <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                Your review
                <Textarea
                  value={m.ratingComment}
                  onChange={(e) => m.setRatingComment(e.target.value)}
                />
              </FieldLabel></Field>
              <Button
                disabled={!m.ratingStars || m.busy}
                onClick={() => void m.submitVendorRating()}
              >
                Submit review
              </Button>
            </>
          )}
        </Card>
      ) : null}
      <ControlledDrawer
        title="Your payment"
        open={proofOpen}
        onOpenChange={setProofOpen}
        busy={m.proofBusy}
        footer={
          <Button
            disabled={
              m.proofBusy || !m.paymentReference.trim() || !m.paymentProofFile
            }
            onClick={() => void m.handleSubmitPaymentProof()}
          >
            {m.proofBusy ? "Submitting…" : "Submit payment proof"}
          </Button>
        }
      >
        <div className="customer-page-stack">
          {b.manualPaymentDestination ? (
            <>
              <h3>{b.manualPaymentDestination.methodLabel}</h3>
              {b.manualPaymentDestination.qrImageUrl ? (
                <img
                  className="customer-service-preview"
                  src={b.manualPaymentDestination.qrImageUrl}
                  alt="Vendor payment QR"
                />
              ) : null}
              <strong>{b.manualPaymentDestination.accountDisplayName}</strong>
              <p>
                {b.manualPaymentDestination.bankName}{" "}
                {b.manualPaymentDestination.accountIdentifierDisplay}
              </p>
              <p>
                {b.manualPaymentDestination.amountCents === null
                  ? "Confirm the amount with the vendor before paying."
                  : money(
                      b.manualPaymentDestination.amountCents,
                      b.manualPaymentDestination.currency,
                    )}
              </p>
            </>
          ) : (
            <Alert data-intent="warning">
              Payment details are not available. Contact the vendor before
              paying.
            </Alert>
          )}
          <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
            Payment reference
            <Input
              value={m.paymentReference}
              onChange={(e) => m.setPaymentReference(e.target.value)}
              disabled={m.proofBusy}
            />
          </FieldLabel></Field>
          <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
            Receipt image
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={m.proofBusy}
              onChange={(e) =>
                m.setPaymentProofFile(e.target.files?.[0] || null)
              }
            />
          </FieldLabel></Field>
        </div>
      </ControlledDrawer>
      <ControlledDrawer
        title="Payment proof"
        open={m.proofModalOpen}
        onOpenChange={m.setProofModalOpen}
        footer={
          m.proofAccessUrl ? (
            <a
              href={m.proofAccessUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open image in new tab
            </a>
          ) : null
        }
      >
        {m.proofAccessUrl ? (
          <img
            className="customer-service-preview"
            src={m.proofAccessUrl}
            alt="Your uploaded payment proof"
            onError={() => { m.setProofModalOpen(false); showCustomerError("Please open it again.", "Could not load payment proof"); }}
          />
        ) : (
          <p role={m.proofViewBusy ? "status" : undefined}>{m.proofViewBusy ? "Opening payment proof…" : "Open the proof again to refresh its private image link."}</p>
        )}
      </ControlledDrawer>
      <ControlledDrawer
        title="Cancel booking"
        open={m.cancelModalOpen}
        onOpenChange={m.setCancelModalOpen}
        busy={m.busy}
        footer={
          <Button
            type="submit"
            form="customer-cancel-booking"
            disabled={m.busy}
          >
            {m.busy ? "Cancelling…" : "Cancel booking"}
          </Button>
        }
      >
        <Alert data-intent="warning">
          This cancels your booking. You will need a new booking if you still
          want the service.
        </Alert>
        <form id="customer-cancel-booking" onSubmit={m.handleCancel}>
          <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
            Cancellation reason
            <Textarea
              value={m.reason}
              disabled={m.busy}
              onChange={(e) => m.setReason(e.target.value)}
            />
          </FieldLabel></Field>
        </form>
      </ControlledDrawer>
    </CustomerPage>
  );
}
const renderCustomerBookingLoading = () => <CustomerLoading message="Loading booking…" />;
export default function CustomerBookingDetailsViewPage() {
  const { bookingId } = useParams();
  const { token, user } = useAuth();
  const [identity, setIdentity] = useState({ token, userId: user?.id, generation: 0 });
  if (identity.token !== token || identity.userId !== user?.id) {
    setIdentity({ token, userId: user?.id, generation: identity.generation + 1 });
  }
  return (
    <CustomerBookingDetailPage
      key={JSON.stringify([bookingId, identity.generation])}
      renderLoading={renderCustomerBookingLoading}
      renderUnavailable={CustomerBookingUnavailable}
      renderPresentation={(model) => <BookingDetailsView model={model} />}
    />
  );
}
