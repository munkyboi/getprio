import { CardHeader, CardContent } from "../ui";
import { Field, FieldLabel } from "../shadcn/field";
import { BusinessMedia } from "../details/BusinessMedia";
import { MapPin, CalendarDays, Mail } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BookingPaymentProofAccessResponse, PublicVendorProfileResponse, PublicBoardThemeSettings } from "@shared";
import { API_BASE_URL, apiRequest } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { showCustomerError } from "../../../utils/customerNotifications";
import { ControlledDrawer } from "../details/ControlledDrawer";
import { ResponsiveDrawer } from "../vendor/ResponsiveDrawer";
import { resolveVendorProfileMedia } from "../../../utils/vendorTheme";
import { Link } from "react-router-dom";
import { Info as IconInfoCircle, RefreshCw as IconRefresh } from "lucide-react";
import type { BookingRequestPresentationModel } from "../../../pages/BookingRequestPage";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
} from "../../../utils/dates";
import { Alert, Button, Card, Input } from "../ui";
import { CustomerPage, StatusBadge } from "../account/CustomerPage";

function SubmittedServiceThumbnail({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const restoreFocus = () => window.requestAnimationFrame(() => container.current?.closest<HTMLElement>('.booking-detail-service')?.focus());
  return <div ref={container} className="booking-service-thumbnail">
    {imageUrl && (!failed || open) ? <ResponsiveDrawer title={`View ${name} image`} triggerVariant="ghost" open={open} onOpenChange={next => { setOpen(next); if (!next && failed) restoreFocus(); }} trigger={<img src={imageUrl} alt="" onError={event => { const focused = document.activeElement === event.currentTarget.closest('button'); setFailed(true); if (!open && focused) restoreFocus(); }} />}>
      <img className="customer-service-expanded-image" src={imageUrl} alt={name} onError={event => { if (event.currentTarget.getAttribute('src') !== '/logo.svg') event.currentTarget.src = '/logo.svg'; event.currentTarget.alt = 'Image unavailable'; }} />
    </ResponsiveDrawer> : <img src="/logo.svg" alt="" />}
  </div>;
}

function isSafeProofUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || /^[a-z0-9-]+\.localhost$/u.test(url.hostname));
  } catch {
    return false;
  }
}

function SubmittedProofViewer({ bookingId }: { bookingId: string }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [viewerToken, setViewerToken] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const currentToken = useRef(token);
  currentToken.current = token;
  useEffect(() => {
    setOpen(false);
    setBusy(false);
    setUrl("");
    setViewerToken(null);
    return () => { request.current?.abort(); request.current = null; };
  }, [bookingId, token]);

  function close() {
    request.current?.abort();
    request.current = null;
    setOpen(false);
    setBusy(false);
    setUrl("");
    setViewerToken(null);
  }
  async function view() {
    if (!token) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setUrl("");
    setViewerToken(token);
    setOpen(true);
    setBusy(true);
    try {
      const response = await apiRequest<BookingPaymentProofAccessResponse>(
        `/account/bookings/${encodeURIComponent(bookingId)}/payment-proof`,
        { token, signal: controller.signal },
      );
      if (!controller.signal.aborted && request.current === controller && currentToken.current === token) {
        if (!isSafeProofUrl(response?.access?.url)) throw new Error("Invalid proof access");
        setUrl(response.access.url);
      }
    } catch {
      if (!controller.signal.aborted && request.current === controller && currentToken.current === token) {
        setOpen(false);
        showCustomerError("Please try again.", "Could not open payment proof");
      }
    } finally {
      if (!controller.signal.aborted && request.current === controller && currentToken.current === token) setBusy(false);
    }
  }

  return <>
    <Button variant="outline" disabled={!token || busy} onClick={() => void view()}>View payment proof</Button>
    <ControlledDrawer title="Payment proof" open={open && viewerToken === token} onOpenChange={(value) => { if (!value) close(); }}>
      {busy ? <p role="status">Opening payment proof…</p> : url && viewerToken === token ? <img className="customer-service-preview" src={url} alt="Your uploaded payment proof" onError={() => { close(); showCustomerError("Please open it again.", "Could not load payment proof"); }} /> : null}
    </ControlledDrawer>
  </>;
}
export function CustomerSubmittedBookingView({
  model: m,
}: {
  model: BookingRequestPresentationModel;
}) {
  const [refreshError, setRefreshError] = useState("");
  const [contactFor, setContactFor] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const b = m.booking;
  const bookingId = b?.id;
  const tenantSlug = b?.tenantSlug;
  const locationSlug = b?.locationSlug;
  const identity = JSON.stringify([bookingId, tenantSlug, locationSlug]);
  const identityRef = useRef({ key: identity, generation: 0 });
  if (identityRef.current.key !== identity) identityRef.current = { key: identity, generation: identityRef.current.generation + 1 };
  const generation = identityRef.current.generation;
  const [contactResolved, setContactResolved] = useState<number | null>(null);
  const [branding, setBranding] = useState<{ bookingId: string; tenantSlug: string; locationSlug: string | undefined; theme: PublicBoardThemeSettings | null; generation: number; contactEmail?: string; contactPhone?: string } | null>(null);
  useEffect(() => {
    if (!bookingId || !tenantSlug) return;
    const controller = new AbortController();
    setBranding(null);
    fetch(`${API_BASE_URL}/public/vendors/${encodeURIComponent(tenantSlug)}`, { credentials: "omit", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Branding unavailable");
        return response.json() as Promise<PublicVendorProfileResponse>;
      }).then(({ vendor }) => {
      if (!controller.signal.aborted && identityRef.current.generation === generation) {
        setContactResolved(generation);
        if (vendor?.slug !== tenantSlug) return;
        const location = vendor.locations.find(item => item.slug === locationSlug);
        setBranding({ bookingId, tenantSlug, locationSlug, generation, theme: resolveVendorProfileMedia(vendor.publicBoardTheme?.theme, vendor.businessProfileTheme?.theme), contactEmail: location?.contactEmail, contactPhone: location?.contactPhone });
      }
    })
      .catch(() => { if (!controller.signal.aborted && identityRef.current.generation === generation) setContactResolved(generation); });
    return () => controller.abort();
  }, [bookingId, tenantSlug, locationSlug, generation]);
  if (!b) return null;
  const activeBranding = branding && branding.generation === generation && branding.bookingId === bookingId && branding.tenantSlug === tenantSlug && branding.locationSlug === locationSlug ? branding : null;
  const destination = b.manualPaymentDestination;
  const isGroupFundedBooking = b.bookingPaymentSource === "group_funded" || Boolean(b.groupFundedBookingId || b.groupFundedCampaign);
  const lines = b.bundleItems?.length ? b.bundleItems : [{id:b.id,serviceName:b.serviceName,bookingQuantity:b.bookingQuantity,scheduledStartAt:b.scheduledStartAt,scheduledEndAt:b.scheduledEndAt,priceAmountCents:b.servicePriceAmountCents,currency:b.serviceCurrency,imageUrl:undefined}];
  return (
    <CustomerPage
      title="Booking details"
      subtitle={b.reference}
      back={m.backToVendorPath}
    >
      <Alert
        data-intent={
          m.vendorDecision?.status === "failed"
            ? "error"
            : m.vendorDecision
              ? "success"
              : "info"
        }
      >
        <IconInfoCircle />
        <div>
          <strong>
            {m.vendorDecision?.title || "Waiting for vendor confirmation"}
          </strong>
          <p>
            {m.vendorDecision?.message ||
              "Your request has been sent. The vendor will review your booking."}
          </p>
        </div>
      </Alert>
      <Card className="booking-detail-pass">
        <div className="booking-detail-first">
          <div className="customer-detail-hero-wrap"><BusinessMedia name={b.tenantName} theme={branding && branding.generation === generation && branding.bookingId === bookingId && branding.tenantSlug === tenantSlug && branding.locationSlug === locationSlug ? branding.theme : null} /><div className="customer-detail-hero-actions"><Button variant="ghost" size="icon" aria-label="Contact vendor" onClick={() => setContactFor(`${generation}:${bookingId}:${tenantSlug}:${locationSlug}`)}><Mail aria-hidden="true" /></Button><Button variant="ghost" render={<Link to={`/vendors/${encodeURIComponent(b.tenantSlug)}?location=${encodeURIComponent(b.locationSlug)}`} />}>View vendor</Button></div></div>
          <CardHeader data-slot="card-header"><h2>{b.reference}</h2><div className="booking-detail-badges"><StatusBadge status={b.status} /><StatusBadge status={b.paymentStatus} /></div></CardHeader>
          <CardContent data-slot="card-content"><div className="booking-detail-vendor"><MapPin /><div><strong>{b.tenantName}</strong><p>{b.locationName}</p></div></div>
          <div className="booking-detail-schedule"><div className="customer-action-row"><CalendarDays /><strong>{formatBookingScheduleDate(b.scheduledStartAt)}</strong></div><p>{formatBookingScheduleTimeRange(b.scheduledStartAt,b.scheduledEndAt)}</p><div className="booking-detail-schedule-meta"><span>{b.serviceName}</span><strong>{b.resourceSelection ? "Amount confirmed by vendor" : new Intl.NumberFormat("en-PH", {style:"currency",currency:b.serviceCurrency || "PHP"}).format(b.servicePriceAmountCents/100)}</strong></div></div></CardContent>
        </div><div className="booking-detail-seam" aria-hidden="true" />
        <section className="booking-detail-group"><h3>Booked services</h3>{lines.map(line => <div className="booking-detail-service" key={line.id} tabIndex={-1}><SubmittedServiceThumbnail key={`${line.id}:${line.imageUrl || ''}`} imageUrl={line.imageUrl} name={line.serviceName} /><div className="booking-detail-service-copy"><strong>{line.serviceName}</strong><p>{formatBookingScheduleTimeRange(line.scheduledStartAt,line.scheduledEndAt)}</p><p className="booking-detail-service-price">{b.resourceSelection ? "Amount confirmed by vendor" : new Intl.NumberFormat("en-PH", {style:"currency",currency:line.currency || "PHP"}).format(line.priceAmountCents/100)}</p></div><StatusBadge status={`×${line.bookingQuantity}`} /></div>)}</section>
      <div className="booking-detail-seam" aria-hidden="true" />
      {isGroupFundedBooking ? <section className="booking-detail-group booking-detail-visit"><h3>Your payment</h3><StatusBadge status={b.paymentStatus} /><p>Contact the organizer for contribution or refund details.</p></section> : m.requiresPaymentProof ? (
        <section className="booking-detail-group booking-detail-visit">
          <h3>Your payment</h3>
          {b.paymentProof ? (
            <div className="booking-detail-payment-flow submitted-payment-proof">
              <StatusBadge status="Payment proof submitted" />
              <p>Your receipt is ready for vendor review.</p>
              <SubmittedProofViewer key={String(b.id)} bookingId={String(b.id)} />
            </div>
          ) : (
            <div className="customer-page-stack">
              <p>
                Pay the vendor using the details below, then upload your
                receipt.
              </p>
              {destination ? (
                <>
                  <h3>{destination.methodLabel}</h3>
                  {destination.qrImageUrl ? (
                    <img
                      className="customer-service-preview"
                      src={destination.qrImageUrl}
                      alt="Vendor payment QR"
                    />
                  ) : null}
                  <strong>{destination.accountDisplayName}</strong>
                  <p>
                    {destination.bankName}{" "}
                    {destination.accountIdentifierDisplay}
                  </p>
                  <strong>
                    {destination.amountCents === null
                      ? "Confirm the amount with the vendor"
                      : new Intl.NumberFormat("en-PH", {
                          style: "currency",
                          currency: destination.currency,
                        }).format(destination.amountCents / 100)}
                  </strong>
                </>
              ) : (
                <Alert data-intent="warning">
                  <IconInfoCircle />
                  <p>
                    Payment details are not available. Contact the vendor before
                    paying.
                  </p>
                </Alert>
              )}
              <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                Payment reference
                <Input
                  value={m.paymentReference}
                  disabled={m.proofSubmitting}
                  onChange={(e) => m.setPaymentReference(e.target.value)}
                />
              </FieldLabel></Field>
              <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                Receipt image
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={m.proofSubmitting}
                  onChange={(e) =>
                    m.setPaymentProofFile(e.target.files?.[0] || null)
                  }
                />
              </FieldLabel></Field>
              <Button
                disabled={
                  m.proofSubmitting ||
                  !m.paymentReference.trim() ||
                  !m.paymentProofFile
                }
                onClick={() => void m.handleSubmitPaymentProof()}
              >
                {m.proofSubmitting ? "Submitting…" : "Submit payment proof"}
              </Button>
            </div>
          )}
        </section>
      ) : <section className="booking-detail-group booking-detail-visit"><h3>Your payment</h3><p>No payment proof is required for this booking.</p></section>}
      </Card>
      {refreshError ? (
        <Alert data-intent="error">
          <IconInfoCircle />
          {refreshError}
        </Alert>
      ) : null}
      <div className="customer-detail-refresh">
        <Button
          variant="outline"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            setRefreshError("");
            try {
              await m.refreshSubmittedBooking();
            } catch {
              setRefreshError(
                "We couldn't refresh this booking. Please try again.",
              );
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <IconRefresh />
          {refreshing ? "Refreshing…" : "Refresh status"}
        </Button>
      </div>
      <ControlledDrawer title="Contact vendor" open={contactFor === `${generation}:${bookingId}:${tenantSlug}:${locationSlug}`} onOpenChange={open => { if (!open) setContactFor(""); }}><div className="customer-page-stack">{activeBranding?.contactEmail ? <a href={`mailto:${activeBranding.contactEmail}`}>Email vendor</a> : null}{activeBranding?.contactPhone ? <a href={`tel:${activeBranding.contactPhone}`}>Call vendor</a> : null}{contactResolved !== generation ? <p role="status">Loading contact details…</p> : !(activeBranding?.contactEmail || activeBranding?.contactPhone) ? <p>Contact details are not available. Please contact the business directly.</p> : null}</div></ControlledDrawer>
    </CustomerPage>
  );
}
