import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  FileInput,
  Group,
  Image,
  NumberInput,
  PinInput,
  Select,
  Stepper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconAlertTriangle, IconArrowLeft, IconCalendar, IconCalendarCheck, IconMapPin, IconUpload } from "@tabler/icons-react";
import { addDays } from "date-fns";
import { Link, Navigate, useParams } from "react-router-dom";
import type {
  BookingPaymentProofUploadResponse,
  BookingOtpResponse,
  BookingSlotsResponse,
  BookingSlotSummary,
  CreateCustomerBookingRequest,
  CustomerBookingDetailResponse,
  CustomerBookingResponse,
  PublicVendorProfile,
  PublicVendorProfileResponse,
  SubmitBookingPaymentProofRequest,
  VerifyBookingOtpRequest,
  VerifyBookingOtpResponse
} from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import PhilippineMobileInput from "../components/PhilippineMobileInput";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
  formatDateInputValue,
  toTimestamp
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

function getBookingFlowStep(
  booking: CustomerBookingResponse["booking"] | null,
  otp: BookingOtpResponse | null,
  requiresPaymentProof: boolean,
  vendorDecisionReached: boolean
) {
  if (booking) {
    if (vendorDecisionReached) {
      return requiresPaymentProof ? 4 : 3;
    }
    if (requiresPaymentProof && !booking.paymentProof) {
      return 2;
    }
    return requiresPaymentProof ? 3 : 2;
  }

  if (otp) {
    return 1;
  }

  return 0;
}

function getVendorDecision(booking: CustomerBookingResponse["booking"] | null) {
  if (!booking) {
    return null;
  }

  if (booking.status === "confirmed" || booking.status === "rescheduled") {
    return {
      status: "success" as const,
      color: "teal" as const,
      title: "Congratulations, your booking is now confirmed",
      message: "Booking completed: the vendor has validated your booking request."
    };
  }

  if (booking.status === "canceled" || booking.paymentRejectedAt || booking.expiredAt) {
    const reason = booking.paymentRejectionReason || booking.expirationReason;
    return {
      status: "failed" as const,
      color: "red" as const,
      icon: <IconAlertTriangle size={18} />,
      title: "Sorry, your booking was rejected",
      message: reason
        ? `Booking completed with attention needed. Reason: ${reason}`
        : "Booking completed with attention needed. The vendor did not approve this booking request."
    };
  }

  return null;
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
  const [now, setNow] = useState(() => Date.now());
  const [bookingVerificationToken, setBookingVerificationToken] = useState("");
  const [booking, setBooking] = useState<CustomerBookingResponse["booking"] | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tenantSlug) {
      setError("Vendor not found.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    apiRequest<PublicVendorProfileResponse>(`/public/vendors/${tenantSlug}`)
      .then((vendorData) => {
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
    if (!vendor || !selectedLocationSlug || !selectedServiceSlug || !bookingDate || booking) {
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
  }, [booking, bookingDate, quantityForRequest, selectedLocationSlug, selectedServiceSlug, vendor]);

  const loadSubmittedBooking = useCallback(async () => {
    if (!token || !booking) {
      return;
    }

    const data = await apiRequest<CustomerBookingDetailResponse>(`/account/bookings/${booking.id}`, { token });
    setBooking(data.booking);
  }, [booking, token]);

  useEffect(() => {
    if (!booking || !token) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadSubmittedBooking().catch(() => undefined);
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [booking, loadSubmittedBooking, token]);

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
  const requiresPaymentProof = Boolean(
    booking?.serviceManualPaymentRequired ||
    selectedService?.manualPaymentRequired
  );
  const vendorDecision = getVendorDecision(booking);
  const currentFlowStep = getBookingFlowStep(booking, otp, requiresPaymentProof, Boolean(vendorDecision));
  const manualPaymentDestination = booking?.manualPaymentDestination || null;
  const resendAvailableAtMs = otp ? toTimestamp(otp.resendAvailableAt) : 0;
  const resendSecondsRemaining = Math.max(0, Math.ceil((resendAvailableAtMs - now) / 1000));
  const resendOtpLabel =
    resendSecondsRemaining > 0
      ? `Resend code in ${Math.floor(resendSecondsRemaining / 60)}:${String(resendSecondsRemaining % 60).padStart(2, "0")}`
      : "Resend code";

  useEffect(() => {
    if (!otp || resendSecondsRemaining <= 0) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [otp, resendSecondsRemaining]);

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

  async function handleSubmitPaymentProof() {
    if (!token || !booking) {
      return;
    }

    const trimmedReference = paymentReference.trim();
    if (!trimmedReference) {
      setError("Payment reference is required.");
      return;
    }

    if (!paymentProofFile) {
      setError("Payment proof image is required.");
      return;
    }

    setProofSubmitting(true);
    setError("");
    try {
      const uploadResponse = await fetch(
        `${API_BASE_URL}/account/bookings/${booking.id}/payment-proof/uploads/direct?fileName=${encodeURIComponent(paymentProofFile.name)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": paymentProofFile.type
          },
          body: paymentProofFile
        }
      );

      if (!uploadResponse.ok) {
        throw new Error("Payment proof upload failed. Please try again.");
      }

      const uploadData = await uploadResponse.json() as BookingPaymentProofUploadResponse;
      const payload: SubmitBookingPaymentProofRequest = {
        paymentReference: trimmedReference,
        objectKey: uploadData.proof.objectKey,
        fileName: uploadData.proof.fileName,
        contentType: uploadData.proof.contentType,
        sizeBytes: uploadData.proof.sizeBytes
      };
      const data = await apiRequest<CustomerBookingResponse, SubmitBookingPaymentProofRequest>(
        `/account/bookings/${booking.id}/payment-proof`,
        {
          method: "POST",
          token,
          body: payload
        }
      );
      setBooking(data.booking);
      setPaymentReference("");
      setPaymentProofFile(null);
    } catch (proofError) {
      setError(getErrorMessage(proofError));
    } finally {
      setProofSubmitting(false);
    }
  }

  return (
    <Stack className="customer-account-page" gap="lg">
      <Button component={Link} leftSection={<IconArrowLeft size={16} />} to={`/vendors/${booking?.tenantSlug || tenantSlug}`} variant="subtle" w="fit-content">
        Back to vendor
      </Button>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="sm">
          <Text className="finazze-section-label">Booking request</Text>
          <Title order={1}>{booking?.reference || vendor?.name || "Book a service"}</Title>
          <Text c="dimmed">
            {booking ? "Continue the booking request on this page." : "Choose a service, branch, and available slot. The vendor will review and confirm the request."}
          </Text>
        </Stack>
      </Card>

      <div className="booking-flow-layout">
        <Card className="finazze-auth-card customer-account-card booking-flow-main" p="xl">
          <Stack gap="lg">
            <Stepper active={currentFlowStep} className="booking-flow-stepper" color="orange" size="sm">
              <Stepper.Step label="Select Service" description="Choose service and schedule">
                {booking ? (
                  <Stack gap="md">
                    <Badge color="teal" variant="light" w="fit-content">Booking submitted</Badge>
                    <Text c="dimmed" size="sm">Your service, schedule, and customer details were submitted.</Text>
                  </Stack>
                ) : (
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
                                Payment proof will be required after OTP verification.
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
                        disabled={Boolean(otp)}
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
                        disabled={Boolean(otp)}
                        label="Name"
                        onChange={(event) => setCustomerName(event.currentTarget.value)}
                        required
                        value={customerName}
                      />
                      <TextInput
                        disabled={Boolean(otp)}
                        label="Email"
                        onChange={(event) => setCustomerEmail(event.currentTarget.value)}
                        type="email"
                        value={customerEmail}
                      />
                      <PhilippineMobileInput
                        disabled={Boolean(otp)}
                        label="Mobile number"
                        value={customerPhone}
                        onChange={(nextValue) => setCustomerPhone(nextValue)}
                      />
                      <Textarea
                        disabled={Boolean(otp)}
                        label="Notes"
                        minRows={3}
                        onChange={(event) => setNotes(event.currentTarget.value)}
                        value={notes}
                      />

                      <Group justify="space-between" align="flex-end" className="booking-flow-actions">
                        <Text c="dimmed" size="sm">
                          {selectedService
                            ? allowBookingQuantity
                              ? `${getServiceLabel(selectedService)} - ${formatDuration(totalDurationMinutes)} total`
                              : getServiceLabel(selectedService)
                            : "Select a service to continue."}
                        </Text>
                        <Button color="dark" disabled={submitting || !vendor?.services.length || !selectedSlot} type="submit">
                          {submitting ? "Processing..." : "Send verification code"}
                        </Button>
                      </Group>
                    </Stack>
                  </form>
                )}
              </Stepper.Step>

              <Stepper.Step label="Verify OTP" description="Confirm your contact">
                {error ? <Alert color="red" mb="md">{error}</Alert> : null}
                {otp ? (
                  <form onSubmit={handleSubmit}>
                    <Stack gap="sm">
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
                      <Group justify="space-between">
                        <Button
                          disabled={submitting || resendSecondsRemaining > 0}
                          onClick={resendOtp}
                          variant="subtle"
                          w="fit-content"
                        >
                          {resendOtpLabel}
                        </Button>
                        <Button color="dark" disabled={submitting || otpCode.length !== 6} type="submit">
                          {submitting ? "Processing..." : "Verify and submit booking"}
                        </Button>
                      </Group>
                    </Stack>
                  </form>
                ) : (
                  <Text c="dimmed" size="sm">Complete service selection first.</Text>
                )}
              </Stepper.Step>

              {requiresPaymentProof ? (
                <Stepper.Step label="Payment Proof" description="Upload receipt">
                  {error ? <Alert color="red" mb="md">{error}</Alert> : null}
                  {booking?.paymentProof ? (
                    <Stack gap="sm">
                      <Badge color="teal" variant="light" w="fit-content">Payment proof submitted</Badge>
                      <Text c="dimmed" size="sm">Your receipt is ready for vendor review.</Text>
                    </Stack>
                  ) : booking ? (
                    <Stack gap="md">
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
                            </Stack>
                          </Group>
                        </Card>
                      ) : (
                        <Alert color="yellow" variant="light">
                          The vendor payment QR is not available yet. Contact the vendor before sending payment.
                        </Alert>
                      )}
                      <TextInput
                        label="Payment reference"
                        onChange={(event) => setPaymentReference(event.currentTarget.value)}
                        placeholder="Reference number from your bank or wallet"
                        value={paymentReference}
                      />
                      <FileInput
                        accept="image/jpeg,image/png,image/webp"
                        clearable
                        label="Proof image"
                        leftSection={<IconUpload size={16} />}
                        onChange={setPaymentProofFile}
                        placeholder="Choose JPEG, PNG, or WebP"
                        value={paymentProofFile}
                      />
                      <Button
                        color="dark"
                        disabled={!paymentReference.trim() || !paymentProofFile}
                        loading={proofSubmitting}
                        onClick={handleSubmitPaymentProof}
                        w="fit-content"
                      >
                        Submit payment proof
                      </Button>
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm">Submit the booking before uploading proof.</Text>
                  )}
                </Stepper.Step>
              ) : null}

              <Stepper.Step
                color={vendorDecision?.color}
                completedIcon={vendorDecision?.status === "failed" ? vendorDecision.icon : undefined}
                label="Vendor Verification"
                description="Await vendor review"
              >
                {booking ? (
                  <Stack gap="md">
                    {vendorDecision ? (
                      <Alert color={vendorDecision.color} title={vendorDecision.title} variant="light">
                        {vendorDecision.message}
                      </Alert>
                    ) : (
                      <Text c="dimmed" size="sm">
                        Your booking is waiting for vendor verification. This page will refresh the booking status while it remains open.
                      </Text>
                    )}
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
                        <Badge color={vendorDecision?.color || "yellow"} variant="light">
                          {booking.status}
                        </Badge>
                      </Stack>
                    </Group>
                    <Button component={Link} to={`/vendors/${booking.tenantSlug}`} variant="light" w="fit-content">
                      Back to vendor profile
                    </Button>
                  </Stack>
                ) : (
                  <Text c="dimmed" size="sm">Submit the booking request first.</Text>
                )}
              </Stepper.Step>
              <Stepper.Completed>
                {vendorDecision ? (
                  <Stack gap="md">
                    <Alert color={vendorDecision.color} title={vendorDecision.title} variant="light">
                      {vendorDecision.message}
                    </Alert>
                    {vendorDecision.status === "success" && booking ? (
                      <Button component={Link} color="dark" to={`/account/bookings/${booking.id}`} w="fit-content">
                        View booking details
                      </Button>
                    ) : null}
                  </Stack>
                ) : (
                  <Text c="dimmed" size="sm">Waiting for the vendor to finish reviewing your booking.</Text>
                )}
              </Stepper.Completed>
            </Stepper>
          </Stack>
        </Card>
      </div>
    </Stack>
  );
}
