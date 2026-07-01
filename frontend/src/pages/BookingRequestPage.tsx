import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Image,
  NumberInput,
  PinInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconArrowLeft, IconCalendar, IconCalendarCheck, IconMapPin } from "@tabler/icons-react";
import { addDays } from "date-fns";
import { Link, Navigate, useParams } from "react-router-dom";
import type {
  BookingOtpResponse,
  BookingSlotsResponse,
  BookingSlotSummary,
  CreateCustomerBookingRequest,
  CustomerBookingResponse,
  PublicVendorProfile,
  PublicVendorProfileResponse,
  VerifyBookingOtpRequest,
  VerifyBookingOtpResponse
} from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
  formatDateInputValue
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";

function getDefaultBookingDate() {
  return formatDateInputValue(addDays(new Date(), 1));
}

function getServiceLabel(service: PublicVendorProfile["services"][number]) {
  const price = service.priceDisplay || `PHP ${(service.priceAmountCents / 100).toLocaleString()}`;
  return `${service.name} - ${service.durationMinutes} min - ${price}`;
}

function getBookingQuantityLabel(service: PublicVendorProfile["services"][number]) {
  return service.bookingQuantityLabel || "Units";
}

function formatSlotLabel(slot: BookingSlotSummary) {
  const timeLabel = formatBookingScheduleTimeRange(slot.startAt, slot.endAt);
  return slot.isAvailable ? `${timeLabel} (${slot.remainingCapacity} left)` : `${timeLabel} (full)`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) {
    return `${hours} hr ${remainder} min`;
  }
  if (hours) {
    return `${hours} hr`;
  }
  return `${minutes} min`;
}

function formatPaymentAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

function getPendingStorageKey(tenantSlug: string) {
  return `getprio:booking:${tenantSlug}:pending`;
}

interface PendingBookingPayload extends CreateCustomerBookingRequest {
  bookingVerificationToken: string;
}

export default function BookingRequestPage() {
  const { tenantSlug = "", serviceSlug = "" } = useParams<{ tenantSlug: string; serviceSlug?: string }>();
  const { token, user, loading: authLoading } = useAuth();
  const [vendor, setVendor] = useState<PublicVendorProfile | null>(null);
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [selectedServiceSlug, setSelectedServiceSlug] = useState(serviceSlug);
  const [bookingDate, setBookingDate] = useState(getDefaultBookingDate);
  const [bookingQuantity, setBookingQuantity] = useState(1);
  const [slots, setSlots] = useState<BookingSlotSummary[]>([]);
  const [selectedSlotStartAt, setSelectedSlotStartAt] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [otp, setOtp] = useState<BookingOtpResponse | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [bookingVerificationToken, setBookingVerificationToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState<CustomerBookingResponse["booking"] | null>(null);
  const [manualPaymentConfirmed, setManualPaymentConfirmed] = useState(false);

  useEffect(() => {
    if (!tenantSlug) {
      setError("Vendor not found.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      apiRequest<PublicVendorProfileResponse>(`/public/vendors/${tenantSlug}`)
    ])
      .then(([vendorData]) => {
        if (!active) {
          return;
        }
        setVendor(vendorData.vendor);
        setSelectedLocationSlug((current) => current || vendorData.vendor.location.slug || vendorData.vendor.locations[0]?.slug || "");
        setSelectedServiceSlug((current) => current || vendorData.vendor.services[0]?.slug || "");
      })
      .catch((loadError) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [tenantSlug]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setCustomerName((current) => current || user.name || "");
    setCustomerEmail((current) => current || user.email || "");
    setCustomerPhone((current) => current || user.phone || "");
  }, [user]);

  const selectedService = useMemo(
    () => vendor?.services.find((service) => service.slug === selectedServiceSlug) || null,
    [selectedServiceSlug, vendor]
  );
  const allowBookingQuantity = selectedService?.allowBookingQuantity === true;
  const quantityForRequest = allowBookingQuantity ? bookingQuantity : 1;

  useEffect(() => {
    if (!allowBookingQuantity && bookingQuantity !== 1) {
      setBookingQuantity(1);
    }
  }, [allowBookingQuantity, bookingQuantity]);

  useEffect(() => {
    if (!vendor || !selectedLocationSlug || !selectedServiceSlug || !bookingDate) {
      setSlots([]);
      return;
    }

    const controller = new AbortController();
    setSlotsLoading(true);
    setSelectedSlotStartAt("");

    apiRequest<BookingSlotsResponse>(
      `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/services/${selectedServiceSlug}/slots?date=${encodeURIComponent(bookingDate)}&bookingQuantity=${quantityForRequest}`,
      { signal: controller.signal }
    )
      .then((data) => setSlots(data.slots))
      .catch((slotError) => {
        if (controller.signal.aborted) {
          return;
        }
        setSlots([]);
        setError(getErrorMessage(slotError));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSlotsLoading(false);
        }
      });

    return () => controller.abort();
  }, [bookingDate, quantityForRequest, selectedLocationSlug, selectedServiceSlug, vendor]);

  const selectedLocation = useMemo(
    () => vendor?.locations.find((location) => location.slug === selectedLocationSlug) || null,
    [selectedLocationSlug, vendor]
  );
  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.startAt === selectedSlotStartAt) || null,
    [selectedSlotStartAt, slots]
  );
  const serviceOptions = useMemo(
    () => vendor?.services.map((service) => ({
      value: service.slug,
      label: getServiceLabel(service)
    })) || [],
    [vendor]
  );
  const locationOptions = useMemo(
    () => vendor?.locations.map((location) => ({
      value: location.slug,
      label: [location.name, location.city, location.province].filter(Boolean).join(", ")
    })) || [],
    [vendor]
  );
  const slotOptions = useMemo(
    () => slots.map((slot) => ({
      value: String(slot.startAt),
      label: formatSlotLabel(slot),
      disabled: !slot.isAvailable
    })),
    [slots]
  );
  const totalDurationMinutes = selectedService ? selectedService.durationMinutes * quantityForRequest : 0;

  function buildBookingPayload(verificationToken: string): PendingBookingPayload {
    if (!vendor || !selectedSlot) {
      throw new Error("Select an available booking slot.");
    }

    return {
      tenantSlug: vendor.slug,
      locationSlug: selectedLocationSlug,
      serviceSlug: selectedServiceSlug,
      scheduledStartAt: String(selectedSlot.startAt),
      bookingQuantity: quantityForRequest,
      customerName,
      customerEmail,
      customerPhone,
      notes,
      bookingVerificationToken: verificationToken
    };
  }

  const submitBooking = useCallback(async (payload: PendingBookingPayload) => {
    if (!token) {
      return;
    }

    const response = await apiRequest<CustomerBookingResponse, CreateCustomerBookingRequest>("/account/bookings", {
      method: "POST",
      token,
      body: payload
    });
    sessionStorage.removeItem(getPendingStorageKey(payload.tenantSlug));
    setBooking(response.booking);
  }, [token]);

  if (authLoading || loading) {
    return <Card className="finazze-auth-card">Loading booking flow...</Card>;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(`/vendors/${tenantSlug}/book/${serviceSlug}`)}`} replace />;
  }

  async function continueAfterVerification(verificationToken: string) {
    if (!vendor) {
      return;
    }
    await submitBooking(buildBookingPayload(verificationToken));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vendor || !selectedServiceSlug || !selectedLocationSlug || !selectedSlot || !token) {
      setError("Select an available booking slot.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (!otp) {
        const otpResponse = await apiRequest<BookingOtpResponse>(
          `/public/vendors/${vendor.slug}/booking-otp`,
          {
            method: "POST",
            token,
            body: {
              tenantSlug: vendor.slug,
              locationSlug: selectedLocationSlug,
              serviceSlug: selectedServiceSlug,
              scheduledStartAt: String(selectedSlot.startAt),
              bookingQuantity: quantityForRequest,
              customerName,
              customerEmail,
              customerPhone,
              notes,
              channel: "email"
            }
          }
        );
        setOtp(otpResponse);
        setOtpCode("");
        return;
      }

      if (!bookingVerificationToken) {
        const verified = await apiRequest<VerifyBookingOtpResponse, VerifyBookingOtpRequest>(
          `/public/vendors/${vendor.slug}/booking-otp/verify`,
          {
            method: "POST",
            body: {
              otpId: otp.otpId,
              code: otpCode
            }
          }
        );
        setBookingVerificationToken(verified.bookingVerificationToken);
        await continueAfterVerification(verified.bookingVerificationToken);
        return;
      }

      await continueAfterVerification(bookingVerificationToken);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function resendOtp() {
    if (!otp || !vendor) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const nextOtp = await apiRequest<BookingOtpResponse>(
        `/public/vendors/${vendor.slug}/booking-otp/${otp.otpId}/resend`,
        { method: "POST" }
      );
      setOtp(nextOtp);
      setOtpCode("");
    } catch (resendError) {
      setError(getErrorMessage(resendError));
    } finally {
      setSubmitting(false);
    }
  }

  if (booking) {
    const manualPaymentDestination = booking.manualPaymentDestination;

    return (
      <Stack className="customer-account-page" gap="lg">
        <Button component={Link} leftSection={<IconArrowLeft size={16} />} to={`/vendors/${booking.tenantSlug}`} variant="subtle" w="fit-content">
          Back to vendor
        </Button>
        <Card className="finazze-auth-card customer-account-card" p="xl">
          <Stack gap="md">
            <Badge color="teal" w="fit-content">Booking request submitted</Badge>
            <Title order={1}>{booking.reference}</Title>
            <Text c="dimmed">Your booking request is pending vendor confirmation.</Text>
            <Group gap="xl" align="flex-start">
              <Stack gap={2}>
                <Text fw={700}>Vendor</Text>
                <Text c="dimmed">{booking.tenantName}</Text>
              </Stack>
              <Stack gap={2}>
                <Text fw={700}>Service</Text>
                <Text c="dimmed">{booking.serviceName}</Text>
                <Text c="dimmed" size="sm">Quantity {booking.bookingQuantity}</Text>
              </Stack>
              <Stack gap={2}>
                <Text fw={700}>Schedule</Text>
                <Text c="dimmed">{formatBookingScheduleDate(booking.scheduledStartAt)}</Text>
                <Text c="dimmed" size="sm">
                  {formatBookingScheduleTimeRange(booking.scheduledStartAt, booking.scheduledEndAt)}
                </Text>
              </Stack>
              <Stack gap={2}>
                <Text fw={700}>Status</Text>
                <Badge color="yellow" variant="light">{booking.status}</Badge>
              </Stack>
            </Group>
            {manualPaymentDestination ? (
              <Card withBorder radius="md" p="md">
                <Group align="flex-start" gap="lg">
                  <Image
                    alt={`${manualPaymentDestination.methodLabel} payment QR`}
                    fit="contain"
                    h={180}
                    radius="sm"
                    src={manualPaymentDestination.qrImageUrl}
                    w={180}
                  />
                  <Stack gap={4}>
                    <Badge color="yellow" variant="light" w="fit-content">Vendor payment QR</Badge>
                    <Text fw={700}>Pay vendor through {manualPaymentDestination.methodLabel}</Text>
                    <Text c="dimmed" size="sm">{manualPaymentDestination.accountDisplayName}</Text>
                    {manualPaymentDestination.accountIdentifierDisplay ? (
                      <Text c="dimmed" size="sm">{manualPaymentDestination.accountIdentifierDisplay}</Text>
                    ) : null}
                    <Text fw={700} mt="xs">
                      Total payable: {formatPaymentAmount(manualPaymentDestination.amountCents, manualPaymentDestination.currency)}
                    </Text>
                    <Text c="dimmed" size="sm">
                      {manualPaymentDestination.unitPriceDisplay} x {booking.bookingQuantity}
                    </Text>
                    <Text c="dimmed" size="sm">
                      Submit your reference number and proof image from the booking detail page.
                    </Text>
                  </Stack>
                </Group>
              </Card>
            ) : null}
            {manualPaymentDestination ? (
              <Checkbox
                checked={manualPaymentConfirmed}
                label={`I have already made the payment via ${manualPaymentDestination.methodLabel}`}
                onChange={(event) => setManualPaymentConfirmed(event.currentTarget.checked)}
              />
            ) : null}
            <Group>
              {manualPaymentDestination ? (
                <Button
                  color="dark"
                  component={Link}
                  disabled={!manualPaymentConfirmed}
                  onClick={(event) => {
                    if (!manualPaymentConfirmed) {
                      event.preventDefault();
                    }
                  }}
                  to={`/account/bookings/${booking.id}`}
                >
                  Submit payment proof
                </Button>
              ) : (
                <Button component={Link} color="dark" to={`/account/bookings/${booking.id}`}>
                  View booking detail
                </Button>
              )}
              <Button component={Link} to={`/vendors/${booking.tenantSlug}`} variant="light">
                Back to vendor profile
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack className="customer-account-page" gap="lg">
      <Button component={Link} leftSection={<IconArrowLeft size={16} />} to={`/vendors/${tenantSlug}`} variant="subtle" w="fit-content">
        Back to vendor
      </Button>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="sm">
          <Text className="finazze-section-label">Booking request</Text>
          <Title order={1}>{vendor?.name || "Book a service"}</Title>
          <Text c="dimmed">
            Choose a service, branch, and available slot. The vendor will review and confirm the request.
          </Text>
        </Stack>
      </Card>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            {error ? <Alert color="red">{error}</Alert> : null}
            {!vendor?.services.length ? (
              <Alert color="yellow">This vendor has not published bookable services yet.</Alert>
            ) : null}

            <Select
              data={serviceOptions}
              disabled={!serviceOptions.length || Boolean(otp)}
              label="Service"
              leftSection={<IconCalendarCheck size={16} />}
              onChange={(value) => setSelectedServiceSlug(value || "")}
              required
              value={selectedServiceSlug}
            />
            {selectedService ? (
              <Alert color="teal" variant="light">
                <Stack gap={4}>
                  <Text size="sm">
                    {selectedService.description || `${selectedService.durationMinutes} minute service`}
                  </Text>
                  {selectedService.manualPaymentRequired ? (
                    <Text fw={700} size="sm">
                      Manual payment proof is required for this service.
                    </Text>
                  ) : null}
                </Stack>
              </Alert>
            ) : null}

            {selectedService && allowBookingQuantity ? (
              <NumberInput
                allowDecimal={false}
                allowNegative={false}
                clampBehavior="strict"
                disabled={Boolean(otp)}
                label={getBookingQuantityLabel(selectedService)}
                min={1}
                max={24}
                onChange={(value) => {
                  setSelectedSlotStartAt("");
                  setBookingQuantity(Number(value) || 1);
                }}
                required
                step={1}
                value={bookingQuantity}
              />
            ) : null}
            {selectedService && allowBookingQuantity ? (
              <Text c="dimmed" size="sm">
                Total booking time: {formatDuration(totalDurationMinutes)}.
              </Text>
            ) : null}

            <Select
              data={locationOptions}
              disabled={!locationOptions.length || Boolean(otp)}
              label="Branch"
              leftSection={<IconMapPin size={16} />}
              onChange={(value) => setSelectedLocationSlug(value || "")}
              required
              value={selectedLocationSlug}
            />
            {selectedLocation ? (
              <Text c="dimmed" size="sm">
                {selectedLocation.name} {selectedLocation.city || selectedLocation.province ? `- ${[selectedLocation.city, selectedLocation.province].filter(Boolean).join(", ")}` : ""}
              </Text>
            ) : null}

            <DatePickerInput
              clearable={false}
              label="Date"
              leftSection={<IconCalendar size={16} />}
              minDate={formatDateInputValue()}
              onChange={(value) => setBookingDate(value || "")}
              required
              value={bookingDate}
            />

            <Select
              data={slotOptions}
              disabled={slotsLoading || !slotOptions.length || Boolean(otp)}
              label="Available slot"
              onChange={(value) => setSelectedSlotStartAt(value || "")}
              placeholder={slotsLoading ? "Loading slots..." : "Select a time"}
              required
              value={selectedSlotStartAt}
            />
            {!slotsLoading && bookingDate && !slotOptions.length ? (
              <Alert color="yellow">No available slots for this date.</Alert>
            ) : null}

            <TextInput
              label="Name"
              onChange={(event) => setCustomerName(event.currentTarget.value)}
              required
              value={customerName}
            />
            <TextInput
              label="Email"
              onChange={(event) => setCustomerEmail(event.currentTarget.value)}
              type="email"
              value={customerEmail}
            />
            <Alert color="blue" variant="light">
              Email alerts are enabled automatically when an email address is available.
            </Alert>
            <TextInput
              label="Mobile number"
              onChange={(event) => setCustomerPhone(event.currentTarget.value)}
              value={customerPhone}
            />
            <Alert color="gray" variant="light">
              Browser notifications are configured after login in your account settings.
            </Alert>

            <Textarea
              label="Notes"
              minRows={3}
              onChange={(event) => setNotes(event.currentTarget.value)}
              value={notes}
            />

            {otp ? (
              <Card withBorder radius="md" p="md">
                <Stack gap="sm">
                  <Text fw={700}>Verification code</Text>
                  <Text c="dimmed" size="sm">
                    Sent by {otp.deliveryChannel} to {otp.deliveryTarget}.
                  </Text>
                  <PinInput
                    length={6}
                    onChange={(value) => setOtpCode(value.replace(/\D/g, ""))}
                    oneTimeCode
                    type="number"
                    value={otpCode}
                  />
                  <Button disabled={submitting} onClick={resendOtp} variant="subtle" w="fit-content">
                    Resend code
                  </Button>
                </Stack>
              </Card>
            ) : null}

            <Group justify="space-between">
              <Text c="dimmed" size="sm">
                {selectedService
                  ? allowBookingQuantity
                    ? `${getServiceLabel(selectedService)} - ${formatDuration(totalDurationMinutes)} total`
                    : getServiceLabel(selectedService)
                  : "Select a service to continue."}
              </Text>
                <Button color="dark" disabled={submitting || !vendor?.services.length || !selectedSlot} type="submit">
                  {submitting
                    ? "Processing..."
                    : otp
                      ? "Verify and submit booking"
                      : "Send verification code"}
                </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
