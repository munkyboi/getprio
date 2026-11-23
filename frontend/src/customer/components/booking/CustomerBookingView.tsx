import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../shadcn/collapsible";
import { Card } from "../ui";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../shadcn/input-group";
import { Alert } from "../shadcn/alert";
import { ToggleGroup, ToggleGroupItem } from "../shadcn/toggle-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../shadcn/tabs";
import { Field, FieldGroup, FieldLabel } from "../shadcn/field";
import { Textarea } from "../shadcn/textarea";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetDescription } from "../shadcn/sheet";
import {
  ArrowLeft as IconArrowLeft,
  Check as IconCheck,
  Info as IconInfoCircle,
  Layers as IconLayers,
  ListOrdered as IconListOrdered,
  Minus as IconMinus,
  Plus as IconPlus,
  Circle as IconCircle,
  CircleCheck as IconCircleCheck,
  ChevronDown as IconChevronDown,
  X as IconX,
} from "lucide-react";
import type { BookingRequestPresentationModel } from "../../../pages/BookingRequestPage";
import {
  formatDisplayTime,
  formatBookingScheduleTimeRange,
  formatBookingScheduleDate,
} from "../../../utils/dates";
import {
  formatPhilippineMobileNumber,
  normalizePhilippineMobileNumber,
} from "../../../utils/phones";
import { Button, Input } from "../ui";
import { ResponsiveDrawer } from "../vendor/ResponsiveDrawer";
import { BookingCalendar, BookingSelect } from "./BookingFields";
import { CustomerOtpField } from "../security/CustomerOtpField";
import { CustomerBookingServiceDetailsContext, useLocationServiceDetails } from "./CustomerBookingServiceDetailsContext";
function BookingServiceThumbnail({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const focusInfo = () => window.requestAnimationFrame(() => {
    container.current?.closest(".booking-service-main")?.querySelector<HTMLButtonElement>(".booking-service-actions [data-slot=sheet-trigger]")?.focus();
  });
  return <div ref={container} className="booking-service-thumbnail">
    {imageUrl && (!failed || open) ? <ResponsiveDrawer title={`View ${name} image`} triggerVariant="ghost" open={open} onOpenChange={next => { setOpen(next); if (!next && failed) focusInfo(); }} trigger={<img src={imageUrl} alt="" onError={event => { const focused = document.activeElement === event.currentTarget.closest("button"); setFailed(true); if (!open && focused) focusInfo(); }} />}>
      <img className="customer-service-expanded-image" src={imageUrl} alt={name} onError={event => { if (event.currentTarget.getAttribute("src") !== "/logo.svg") event.currentTarget.src = "/logo.svg"; event.currentTarget.alt = "Image unavailable"; }} />
    </ResponsiveDrawer> : <img src="/logo.svg" alt="" />}
  </div>;
}
const amount = (cents: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(cents / 100);
export function CustomerBookingView({
  model: m,
}: {
  model: BookingRequestPresentationModel;
}) {
  const [verificationOpen, setVerificationOpen] = useState(Boolean(m.otp));
  const serviceDetails = useLocationServiceDetails(m.resourceMode ? m.vendor?.slug : undefined, m.selectedLocationSlug);
  const submitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (m.otp) setVerificationOpen(true);
  }, [m.otp, m.otp?.otpId]);
  const locked = Boolean(m.otp) || m.submitting;
  const total = m.resourceMode
    ? "Amount confirmed by vendor"
    : amount(m.payableAmountCents);
  const canContinue =
    !m.submitting &&
    Boolean(m.resourceCatalog) &&
    Boolean(m.vendor?.services.length) &&
    Boolean(m.selectedSlot) &&
    Boolean(m.selectedBundleServices.length);
  const back = m.backToVendorPath;
  return (
    <section className="customer-booking-page">
      <div className="customer-booking-back">
        <Button
          variant="outline"
          size="icon"
          aria-label="Back to vendor"
          render={<Link to={back} />}
        >
          <IconArrowLeft />
        </Button>
      </div>
      <header className="customer-booking-title">
        <h1>Plan your visit</h1>
      </header>
      <p className="customer-booking-subtitle">
        {m.vendor?.name} ·{" "}
        {
          m.locationOptions.find(
            (item) => item.value === m.selectedLocationSlug,
          )?.label
        }
      </p>
      {m.error ? (
        <Alert className="customer-vendor-error" role="alert">
          <IconInfoCircle />
          {m.error}
        </Alert>
      ) : null}
      <form id="customer-booking-form" onSubmit={m.handleSubmit}><FieldGroup className="customer-shadcn-field-group">
        {m.locationOptions.length > 1 || !m.selectedLocationSlug ? <Field className="customer-shadcn-field"><FieldLabel className="customer-field">Location<BookingSelect label="Location" value={m.selectedLocationSlug} onChange={m.setSelectedLocationSlug} options={m.locationOptions} disabled={locked || m.submitting} /></FieldLabel></Field> : null}
        <Tabs className="customer-booking-tabs" value={m.resourceBooking ? "resources" : "services"} onValueChange={(value) => { if (value) m.changeBookingType(value === "resources"); }}>
        {m.resourceCatalog?.enabled &&
        m.resourceCatalog.resourceServiceIds?.length ? (
          <>
          <TabsList className="customer-booking-type customer-segmented-tabs" aria-label="Booking type">
            <TabsTrigger value="resources" disabled={locked}>
              Resource booking
            </TabsTrigger>
            <TabsTrigger value="services" disabled={locked}>
              Other services
            </TabsTrigger>
          </TabsList>
          <p>Resource appointments use the location’s people, rooms or equipment. The location manages its queue separately.</p>
          </>
        ) : null}
        <TabsContent value={m.resourceBooking ? "resources" : "services"}>
        <section className="customer-booking-services">
          <h2>Services</h2>
          {m.resourceMode
            ? <CustomerBookingServiceDetailsContext.Provider value={serviceDetails}>{m.resourceEditor}</CustomerBookingServiceDetailsContext.Provider>
            : m.locationServices
                .filter(
                  (service) =>
                    !m.resourceCatalog?.enabled ||
                    !m.resourceCatalog.resourceServiceSlugs?.includes(
                      service.slug,
                    ),
                )
                .map((service) => {
                  const imageUrl = service.imageUrl;
                  const selected = m.selectedBundleServiceSlugs.includes(
                      service.slug,
                    ),
                    quantity = m.getBundleItemQuantity(service),
                    bounds = m.getBundleItemBounds(service);
                  return (
                    <Card
                      className="customer-card booking-service-card booking-ordinary-service" data-slot="card"
                      data-selected={selected}
                      key={service.slug}
                    >
                      <div className="booking-service-main">
                        <BookingServiceThumbnail key={imageUrl || "fallback"} imageUrl={imageUrl} name={service.name} />
                        <div className="booking-service-copy">
                          <strong>{service.name}</strong>
                          <p>
                            {service.durationMinutes} min · {service.priceDisplay || "Price confirmed by vendor"}
                          </p>
                        </div>
                        <div className="booking-service-actions">
                        <ResponsiveDrawer
                          title={service.name}
                          triggerVariant="ghost"
                          trigger={
                            <>
                              <IconInfoCircle />
                              <span className="customer-sr-only">
                                About {service.name}
                              </span>
                            </>
                          }
                        >
                          <p>
                            {service.description ||
                              "Ask the vendor for service details."}
                          </p>
                        </ResponsiveDrawer>
                        <Button type="button" variant="ghost" size="icon" disabled={locked} aria-label={`${selected ? "Remove" : "Select"} ${service.name}`} aria-pressed={selected} onClick={() => m.selectServices(selected ? m.selectedBundleServiceSlugs.filter((slug) => slug !== service.slug) : [...m.selectedBundleServiceSlugs, service.slug])}>{selected ? <IconCheck /> : <IconPlus />}</Button>
                        </div>
                      </div>
                      {selected && service.allowBookingQuantity ? (
                        <div className="booking-service-units booking-unit-control">
                          <span>{service.bookingQuantityLabel || "Units"}</span>
                          <InputGroup className="booking-unit-stepper">
                            <InputGroupAddon align="inline-start"><InputGroupButton type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={locked || quantity <= bounds.min}
                              aria-label={`Decrease ${service.name}`}
                              onClick={() =>
                                m.updateServiceQuantity(service, quantity - 1)
                              }
                            >
                              <IconMinus />
                            </InputGroupButton></InputGroupAddon>
                            <InputGroupInput readOnly value={quantity} aria-label={`${service.name} quantity`} />
                            <InputGroupAddon align="inline-end"><InputGroupButton type="button"
                              variant="ghost"
                              size="icon-sm"
                              disabled={locked || quantity >= bounds.max}
                              aria-label={`Increase ${service.name}`}
                              onClick={() =>
                                m.updateServiceQuantity(service, quantity + 1)
                              }
                            >
                              <IconPlus />
                            </InputGroupButton></InputGroupAddon>
                          </InputGroup>
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
        </section>
        </TabsContent>
        </Tabs>
        {!m.resourceCatalog ? (
          m.catalogError ? <div role="status"><p>Services are unavailable.</p><Button type="button" variant="outline" onClick={m.retryResourceCatalog}>Try again</Button></div> : <p role="status">Loading services…</p>
        ) : !m.resourceMode && !m.locationServices.length ? (
          <p role="status">
            This vendor has not published bookable services yet.
          </p>
        ) : null}
        {!m.resourceMode && m.selectedBundleServices.length > 1 ? (
          <Card className="booking-scheduling-panel booking-timing-options">
            <h2>How would you like your services?</h2>
            <p>Choose how your services fit into your visit.</p>
            <ToggleGroup className="customer-timing-toggle-group" value={[m.executionMode]} onValueChange={(values) => { if (values[0] === "parallel" || values[0] === "sequential") m.changeExecutionMode(values[0]); }}><ToggleGroupItem type="button" value="parallel" disabled={locked}><IconLayers /><span><strong>Together</strong><small>Services start at the same time. Your visit follows the longest service.</small></span>{m.executionMode === "parallel" ? <IconCircleCheck /> : <IconCircle />}</ToggleGroupItem>
            <ToggleGroupItem type="button" value="sequential" disabled={locked}><IconListOrdered /><span><strong>One after another</strong><small>Services happen one at a time, in the order listed. Your visit includes the time for each service.</small></span>{m.executionMode === "sequential" ? <IconCircleCheck /> : <IconCircle />}</ToggleGroupItem></ToggleGroup>
          </Card>
        ) : null}
        {!m.resourceMode ? (
          <p>{m.bundleVisitDurationMinutes} minute visit{m.selectedBundleServices.length > 1 ? ` · ${m.executionMode === "parallel" ? "Together" : "One after another"}` : ""}</p>
        ) : null}
        <Field className="customer-booking-field">
          <FieldLabel>Date</FieldLabel>
          <BookingCalendar
            value={m.bookingDate}
            onChange={m.setBookingDate}
            disabled={locked}
          />
        </Field>
        <section>
          <h2>Available times</h2>
          <p>{m.slotsLoading ? "Loading available times…" : m.slotIntervalLabel}</p>
          {m.resourceMode &&
          m.selectedSlotStartAt &&
          !m.selectedSlot &&
          !m.slotsLoading ? (
            <Alert className="customer-booking-warning" role="alert">
              Your selected time no longer fits. Your resources and duration
              counts are kept. Choose another start time.
            </Alert>
          ) : null}
          {!m.slotsLoading ? (
            <div
              className="customer-booking-slots"
              role="group"
              aria-label="Available start times"
            >
              {m.slots.length ? (
                m.slots.map((slot) => (
                  <Button
                    type="button"
                    key={String(slot.startAt)}
                    variant="outline"
                    disabled={locked || !slot.isAvailable}
                    aria-pressed={m.selectedSlot === slot}
                    onClick={() =>
                      m.setSelectedSlotStartAt(String(slot.startAt))
                    }
                  >
                    <span>{formatDisplayTime(slot.startAt)}</span>
                  </Button>
                ))
              ) : (
                <p>No available times for this date.</p>
              )}
            </div>
          ) : null}
          {m.selectedSlot ? <p className="booking-selected-time">{formatBookingScheduleTimeRange(m.selectedSlot.startAt,m.selectedSlot.endAt)}</p> : null}
        </section>
        <Field className="customer-booking-field">
          <FieldLabel htmlFor="booking-customer-name">Name</FieldLabel>
          <Input
            id="booking-customer-name"
            autoComplete="name"
            required
            disabled={locked}
            value={m.customerName}
            onChange={(event) => m.setCustomerName(event.target.value)}
          />
        </Field>
        <Field className="customer-booking-field">
          <FieldLabel htmlFor="booking-customer-email">Email</FieldLabel>
          <Input
            id="booking-customer-email"
            type="email"
            autoComplete="email"
            disabled={locked}
            value={m.customerEmail}
            onChange={(event) => m.setCustomerEmail(event.target.value)}
          />
        </Field>
        <Field className="customer-booking-field">
          <FieldLabel htmlFor="booking-customer-phone">Mobile number (optional)</FieldLabel>
          <Input
            id="booking-customer-phone"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="(0917) 123-4567"
            disabled={locked}
            value={formatPhilippineMobileNumber(m.customerPhone)}
            onChange={(event) =>
              m.setCustomerPhone(
                normalizePhilippineMobileNumber(event.target.value),
              )
            }
          />
        </Field>
        <Field className="customer-booking-field">
          <FieldLabel htmlFor="booking-notes">Notes (optional)</FieldLabel>
          <Textarea
            id="booking-notes"
            data-slot="textarea"
            disabled={locked}
            value={m.notes}
            onChange={(event) => m.setNotes(event.target.value)}
          />
        </Field>
        <Collapsible className="customer-booking-summary">
          <CollapsibleTrigger type="button" className="customer-collapse-trigger">
            <span className="customer-collapse-label">
              Booking summary
              <IconChevronDown aria-hidden="true" />
            </span>
            <strong>{total}</strong>
          </CollapsibleTrigger><CollapsibleContent keepMounted>
          <p>
            {m.selectedSlot
              ? `${formatBookingScheduleDate(m.selectedSlot.startAt)} · ${formatBookingScheduleTimeRange(m.selectedSlot.startAt, m.selectedSlot.endAt)}`
              : "Choose an available time"}
          </p>
          {m.selectedBundleServices.map((service) => (
            <p key={service.slug}>
              {service.name} ·{" "}
              {m.resourceMode
                ? "Amount confirmed by vendor"
                : `${m.getBundleItemQuantity(service)} ${service.bookingQuantityLabel || "units"}`}
            </p>
          ))}
        </CollapsibleContent></Collapsible>
      </FieldGroup></form>
      <footer className="customer-booking-footer">
        <div>
          <strong>
            {m.selectedBundleServices.length}{" "}
            {m.selectedBundleServices.length === 1 ? "service" : "services"} ·{" "}
            {total}
          </strong>
          <p>Your request is subject to vendor confirmation. Required payment is reviewed manually.</p>
        </div>
        <Button
          ref={submitRef}
          type={m.otp ? "button" : "submit"}
          form="customer-booking-form"
          disabled={!canContinue}
          onClick={m.otp ? () => setVerificationOpen(true) : undefined}
        >
          {m.submitting
            ? "Processing…"
            : m.otp
              ? "Continue verification"
              : "Verify email to continue"}
        </Button>
      </footer>
      <Sheet
        open={verificationOpen && Boolean(m.otp)}
        onOpenChange={setVerificationOpen}
      >
          <SheetContent showCloseButton={false}
            className="customer-vendor-drawer customer-booking-verification"
            finalFocus={submitRef}
          >
            <header>
              <SheetTitle>Verify your email</SheetTitle>
              <SheetClose
                render={
                  <Button type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close verification"
                  />
                }
              >
                <IconX />
              </SheetClose>
            </header>
            <div className="customer-drawer-body">
              <SheetDescription>
                Enter the code sent to {m.otp?.deliveryTarget}.
              </SheetDescription>
              <form onSubmit={m.handleSubmit}>
                <CustomerOtpField
                  label="Email verification code"
                  name="booking-email-code"
                  value={m.otpCode}
                  onChange={m.setOtpCode}
                  autoFocus
                  required
                  error={m.error || undefined}
                  disabled={m.submitting}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={m.submitting || m.resendSecondsRemaining > 0}
                  onClick={() => void m.resendOtp()}
                >
                  {m.resendOtpLabel}
                </Button>
                <Button
                  type="submit"
                  disabled={m.submitting || m.otpCode.length !== 6}
                >
                  {m.submitting ? "Processing…" : "Verify and submit booking"}
                </Button>
              </form>
            </div>
          </SheetContent>
      </Sheet>
    </section>
  );
}
