import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  FileInput,
  Group,
  Image,
  PinInput,
  Select,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stepper,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core";
import { Carousel } from "@mantine/carousel";
import { DatePickerInput } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertTriangle, IconArrowLeft, IconBuildingBank, IconCalendar, IconMapPin, IconUpload } from "@tabler/icons-react";
import { addDays, format } from "date-fns";
import { Link, Navigate, useLocation,  useParams } from "react-router-dom";

import type {
  BookingOtpResponse,
  BookingSlotsResponse,
  BookingSlotSummary,
  CreateCustomerBookingRequest,

  CustomerBookingDetailResponse,
  CustomerBookingResponse,
  PublicVendorProfile,
  PublicVendorProfileResponse,
  PublicVendorService,
  SubmitBookingPaymentProofRequest,
  VerifyBookingOtpRequest,
  VerifyBookingOtpResponse
} from "@shared";
import { apiRequest } from "../api/client";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";
import PhilippineMobileInput from "../components/PhilippineMobileInput";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
  formatDateInputValue,
  toTimestamp
} from "../utils/dates";
import { getMaxBookableHours } from "../utils/availability";
import { getErrorMessage } from "../utils/errors";
import { showCustomerError, showCustomerSuccess } from "../utils/customerNotifications";

function getDefaultBookingDate() {
  return formatDateInputValue(addDays(new Date(), 1));
}

function getBookingQuantityLabel(service: PublicVendorProfile["services"][number]) {
  return service.bookingQuantityLabel || "Units";
}

function formatBookingQuantityValue(quantity: number, unitLabel: string) {
  const normalizedLabel = unitLabel.trim().toLowerCase();
  const singularLabel = quantity === 1 && normalizedLabel.endsWith("s")
    ? normalizedLabel.slice(0, -1)
    : normalizedLabel;
  return `${quantity} ${singularLabel}`;
}

function getServiceLineAmountCents(service: PublicVendorProfile["services"][number], bookingQuantity = 1) {
  return service.priceAmountCents * bookingQuantity;
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
  const { tenantSlug = "", serviceSlug = "" } = useParams<{
    tenantSlug: string;
    serviceSlug?: string;
  }>();
  const location = useLocation();

  const selectedLocationFromQuery = useMemo(() => new URLSearchParams(location.search).get("location") || "", [location.search]);

  const { token, user, loading: authLoading } = useAuth();
  const [vendor, setVendor] = useState<PublicVendorProfile | null>(null);
  const [selectedLocationSlug, setSelectedLocationSlug] = useState("");
  const [selectedServiceSlug, setSelectedServiceSlug] = useState(serviceSlug);
  const [selectedBundleServiceSlugs, setSelectedBundleServiceSlugs] = useState<string[]>(serviceSlug ? [serviceSlug] : []);
  const [bundleQuantities, setBundleQuantities] = useState<Record<string, number>>({});
  const [executionMode, setExecutionMode] = useState<"parallel" | "sequential">("parallel");
  const [locationServices, setLocationServices] = useState<Array<PublicVendorService & { capacity: number }>>([]);
  const [bookingDate, setBookingDate] = useState(getDefaultBookingDate);
  const [bookingQuantity, setBookingQuantity] = useState(1);
  const [slots, setSlots] = useState<BookingSlotSummary[]>([]);
  const [calendarMonth, setCalendarMonth] = useState<Date | null>(null);
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
    if (error) {
      showCustomerError(error, "Could not continue booking");
    }
  }, [error]);

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
        setSelectedLocationSlug((current) => {
          if (current) {
            return current;
          }

          if (
            selectedLocationFromQuery &&
            vendorData.vendor.locations.some((location) => location.slug === selectedLocationFromQuery)
          ) {
            return selectedLocationFromQuery;
          }

          return vendorData.vendor.location.slug || vendorData.vendor.locations[0]?.slug || "";
        });
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
  }, [tenantSlug, selectedLocationFromQuery]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setCustomerName((current) => current || user.name || "");
    setCustomerEmail((current) => current || user.email || "");
    setCustomerPhone((current) => current || user.phone || "");
  }, [user]);

  useEffect(() => {
    if (!vendor || !selectedLocationSlug) {
      setLocationServices([]);
      return;
    }

    const controller = new AbortController();
    apiRequest<{ services: Array<PublicVendorService & { capacity: number; locationServiceId: string }> }>(
      `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/services`,
      { signal: controller.signal }
    )
      .then((data) => {
        setLocationServices(data.services);
        setSelectedServiceSlug((current) => {
          const currentService = data.services.find((service) => service.slug === current);
          if (currentService && ((true))) {
            return current;
          }
          const defaultService = data.services[0];
          return defaultService?.slug || "";
        });
      })
      .catch((serviceError) => {
        if (!controller.signal.aborted) {
          setLocationServices([]);
          setError(getErrorMessage(serviceError));
        }
      });

    return () => controller.abort();
  }, [selectedLocationSlug, vendor]);

  const selectedService = useMemo(
    () => locationServices.find((service) => service.slug === selectedServiceSlug) || null,
    [locationServices, selectedServiceSlug]
  );
  const selectedLocation = useMemo(
    () => vendor?.locations.find((location) => location.slug === selectedLocationSlug) || null,
    [selectedLocationSlug, vendor]
  );
  const allowBookingQuantity = selectedService?.allowBookingQuantity === true;
  const maxBookableQuantity = getMaxBookableHours(
    selectedLocation?.hours || [],
    new Date(`${bookingDate}T00:00:00`).getDay()
  );
  const quantityForRequest = allowBookingQuantity ? bookingQuantity : 1;

  const selectedBundleServices = useMemo(() => {
    {
      const selectedSlugs = new Set(selectedBundleServiceSlugs);
      const services = locationServices.filter((service) => selectedSlugs.has(service.slug));
      return selectedService
        ? [selectedService, ...services.filter((service) => service.slug !== selectedService.slug)]
        : services;
    }

  }, [
    locationServices,
    selectedBundleServiceSlugs,
    selectedService
  ]);
  const getBundleItemQuantity = useCallback((service: PublicVendorService) => {
    if (!service.allowBookingQuantity) return 1;
    if (service.slug === selectedServiceSlug) return bookingQuantity;
    return bundleQuantities[service.slug] || 1;
  }, [bookingQuantity, bundleQuantities, selectedServiceSlug]);
  const shouldSynchronizeTogetherQuantities = useMemo(() => {
    if (executionMode !== "parallel" || selectedBundleServices.length < 2) {
      return false;
    }

    const sharedDuration = selectedBundleServices[0]?.durationMinutes;
    return selectedBundleServices.every((service) => (
      service.allowBookingQuantity
      && service.durationMinutes === sharedDuration
    ));
  }, [executionMode, selectedBundleServices]);
  const bundleAmountCents = selectedBundleServices.reduce((sum, service) => {
    return sum + getServiceLineAmountCents(service, getBundleItemQuantity(service));
  }, 0);
  const payableAmountCents = bundleAmountCents;

  const isMobileViewport = useMediaQuery("(max-width: 47.99em)");

  useEffect(() => {
    if (!allowBookingQuantity && bookingQuantity !== 1) {
      setBookingQuantity(1);
    }
  }, [allowBookingQuantity, bookingQuantity]);

  useEffect(() => {
    if ((!selectedServiceSlug)) {
      return;
    }
    setSelectedBundleServiceSlugs((current) => current.includes(selectedServiceSlug)
      ? current
      : [selectedServiceSlug, ...current]);
  }, [selectedServiceSlug]);

  useEffect(() => {

  }, [bookingQuantity, maxBookableQuantity]);

  useEffect(() => {
    if (!shouldSynchronizeTogetherQuantities) {
      return;
    }

    const synchronizedQuantity = Math.max(1, Math.min(bookingQuantity, maxBookableQuantity));
    if (synchronizedQuantity !== bookingQuantity) {
      setBookingQuantity(synchronizedQuantity);
    }
    setBundleQuantities((current) => {
      const next = { ...current };
      let changed = false;

      for (const service of selectedBundleServices) {
        if (service.slug === selectedServiceSlug || next[service.slug] === synchronizedQuantity) {
          continue;
        }
        next[service.slug] = synchronizedQuantity;
        changed = true;
      }

      return changed ? next : current;
    });
  }, [bookingQuantity, maxBookableQuantity, selectedBundleServices, selectedServiceSlug, shouldSynchronizeTogetherQuantities]);

  const updateServiceQuantity = useCallback((service: PublicVendorService, quantity: number) => {
    setSelectedSlotStartAt("");

    if (shouldSynchronizeTogetherQuantities) {
      setBookingQuantity(quantity);
      setBundleQuantities((current) => {
        const next = { ...current };
        for (const selectedService of selectedBundleServices) {
          if (selectedService.slug !== selectedServiceSlug) {
            next[selectedService.slug] = quantity;
          }
        }
        return next;
      });
      return;
    }

    if (service.slug === selectedServiceSlug) {
      setBookingQuantity(quantity);
      return;
    }
    setBundleQuantities((current) => ({ ...current, [service.slug]: quantity }));
  }, [selectedBundleServices, selectedServiceSlug, shouldSynchronizeTogetherQuantities]);

  useEffect(() => {
    if (!vendor || !selectedLocationSlug || !selectedServiceSlug || !bookingDate || booking) {
      setSlots([]);
      return;
    }

    const controller = new AbortController();
    setSlotsLoading(true);
    setSelectedSlotStartAt("");

    const requestedItems = selectedBundleServices.map((service) => ({
      serviceSlug: service.slug,
      bookingQuantity: getBundleItemQuantity(service)
    }));
    const request = requestedItems.length > 1
      ? apiRequest<{ slots: BookingSlotSummary[] }>(
          `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/composed-slots`,
          {
            method: "POST",
            signal: controller.signal,
            body: {
              date: formatDateInputValue(bookingDate),
              executionMode,
              items: requestedItems,
              includeGroupFundedHolds: false
            }
          }
        )
      : apiRequest<BookingSlotsResponse>(
          `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/services/${selectedServiceSlug}/slots?date=${encodeURIComponent(formatDateInputValue(bookingDate))}&bookingQuantity=${quantityForRequest}${""}`,
          { signal: controller.signal }
        );

    request
      .then((data) => {
        setSlots(data.slots || []);
      })
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
  }, [booking, bookingDate, executionMode, getBundleItemQuantity, quantityForRequest, selectedBundleServices, selectedLocationSlug, selectedServiceSlug, vendor]);

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

  const selectedSlot = useMemo(() => {
    const selectedTimestamp = toTimestamp(selectedSlotStartAt);
    if (Number.isNaN(selectedTimestamp)) {
      return null;
    }

    return slots.find((slot) => slot.startAt === selectedSlotStartAt)
      || slots.find((slot) => toTimestamp(slot.startAt) === selectedTimestamp)
      || null;
  }, [selectedSlotStartAt, slots]);

  const locationOptions = useMemo(
    () => vendor?.locations.map((location) => ({
      value: location.slug,
      label: [location.name, location.city, location.province].filter(Boolean).join(", ")
    })) || [],
    [vendor]
  );
  const slotIntervalLabel = useMemo(() => {
    if (slots.length < 2) {
      return "Choose an available start time.";
    }

    const firstStart = toTimestamp(slots[0]?.startAt);
    const secondStart = toTimestamp(slots[1]?.startAt);
    const intervalMinutes = Math.round((secondStart - firstStart) / (60 * 1000));

    return Number.isFinite(intervalMinutes) && intervalMinutes > 0
      ? `Start times are offered every ${formatDuration(intervalMinutes)}.`
      : "Choose an available start time.";
  }, [slots]);
  const bundleVisitDurationMinutes = selectedBundleServices.reduce((total, service) => {
    const duration = service.durationMinutes * getBundleItemQuantity(service);
    return executionMode === "sequential" ? total + duration : Math.max(total, duration);
  }, 0);
  const slotPickerLabel = `Available start times — ${formatDuration(bundleVisitDurationMinutes || selectedService?.durationMinutes || 0)} booking`;
  const unavailableSlotResourceLabel = selectedBundleServices.length === 1
    ? selectedBundleServices[0]?.name || "This service"
    : "A selected service";
  const slotCarouselGroups = useMemo(() => {
    const groupSize = isMobileViewport ? 4 : 1;
    return slots.reduce<BookingSlotSummary[][]>((groups, slot, index) => {
      if (index % groupSize === 0) {
        groups.push([]);
      }
      groups[groups.length - 1].push(slot);
      return groups;
    }, []);
  }, [isMobileViewport, slots]);
  const requiresPaymentProof = (Boolean(
    booking?.serviceManualPaymentRequired ||
    selectedService?.manualPaymentRequired
  ));
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
      executionMode,
      bundleItems: selectedBundleServices.map((service) => ({
        serviceSlug: service.slug,
        bookingQuantity: getBundleItemQuantity(service)
      })),
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
    showCustomerSuccess("Booking request created", "Your booking request is ready for the next step.");
  }, [token]);

  if (authLoading || loading) {
    return <Card className="finazze-auth-card">Loading booking flow...</Card>;
  }

  if (!user) {
    const params = new URLSearchParams();
    if (selectedLocationSlug) {
      params.set("location", selectedLocationSlug);
    }

    const nextPath = `${serviceSlug ? `/vendors/${tenantSlug}/book/${serviceSlug}` : `/vendors/${tenantSlug}/book`}${
      params.toString() ? `?${params.toString()}` : ""
    }`;

    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />;
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
              executionMode,
              bundleItems: selectedBundleServices.map((service) => ({
                serviceSlug: service.slug,
                bookingQuantity: getBundleItemQuantity(service)
              })),
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
        showCustomerSuccess("Verification code sent", "Check your email for the booking verification code.");
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
        showCustomerSuccess("Email verified", "Your booking request is being created.");
        await continueAfterVerification(verified.bookingVerificationToken);
        return;
      }

      await continueAfterVerification(bookingVerificationToken);
    } catch (submitError) {
      showCustomerError(getErrorMessage(submitError), "Could not continue booking");
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
      showCustomerSuccess("Verification code resent", "Check your email for the new code.");
    } catch (resendError) {
      showCustomerError(getErrorMessage(resendError), "Could not resend verification code");
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
      const uploadData = await customerAccountApi.uploadBookingPaymentProof(token, booking.id, paymentProofFile);
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
      showCustomerSuccess("Payment proof submitted", "The vendor will review your payment proof.");
    } catch (proofError) {
      showCustomerError(getErrorMessage(proofError), "Could not submit payment proof");
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
          <Text className="finazze-section-label">{"Booking request"}</Text>
          <Title order={1}>{booking?.reference || vendor?.name || ("Start a booking")}</Title>
          <Text c="dimmed">
            {booking
              ? "Continue the booking request on this page."
              : "Plan your visit by choosing a branch, services, visit length, and an available start time."}
          </Text>
        </Stack>
      </Card>

      <div className="booking-flow-layout">
        <Card className="finazze-auth-card customer-account-card booking-flow-main" p="xl">
          <Stack gap="lg">
            <Stepper
              active={currentFlowStep}
              className={`booking-flow-stepper ${"booking-flow-stepper--booking"}`}
              color="orange"
              size="sm"
            >
              <Stepper.Step
                label={"Plan Visit"}
                description={"Branch, services, and schedule"}
              >
                {booking ? (
                  <Stack gap="md">
                    <Badge color="teal" variant="light" w="fit-content">Booking submitted</Badge>
                    <Text c="dimmed" size="sm">Your service, schedule, and customer details were submitted.</Text>
                  </Stack>
                ) : (
                  <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                      {!locationServices.length ? (
                        <Alert color="yellow">This vendor has not published bookable services yet.</Alert>
                      ) : null}

                      <Card className="booking-bundle-card booking-setup-section" withBorder radius="md" p="md">
                        <Stack gap="sm">
                          <div>
                            <Text fw={800}>1. Plan your visit</Text>
                            <Text c="dimmed" size="sm">Choose a branch, services, and visit length before selecting an available time.</Text>
                          </div>
                          <Select
                            data={locationOptions}
                            disabled={!locationOptions.length || Boolean(otp)}
                            label="Branch"
                            leftSection={<IconMapPin size={16} />}
                            onChange={(value) => setSelectedLocationSlug(value || "")}
                            required
                            value={selectedLocationSlug}
                          />
                          <div>
                            <Text fw={600} size="sm">Services</Text>
                            <Text c="dimmed" size="sm">Choose one service, or combine services for the same visit.</Text>
                          </div>
                          <Checkbox.Group
                            onChange={(values) => {
                              if (!values.length) return;
                              setSelectedBundleServiceSlugs(values);
                              setSelectedServiceSlug(values[0]);
                              setSelectedSlotStartAt("");
                            }}
                            value={selectedBundleServiceSlugs}
                          >
                            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xs">
                              {(locationServices).map((service) => {
                                const isSelected = selectedBundleServiceSlugs.includes(service.slug);
                                const quantityLabel = getBookingQuantityLabel(service);
                                const quantity = getBundleItemQuantity(service);

                                return (
                                  <Stack className="booking-bundle-option" gap="xs" key={service.slug}>
                                    <Checkbox
                                      description={`${formatDuration(service.durationMinutes * quantity)} · ${formatPaymentAmount(getServiceLineAmountCents(service, quantity), service.currency)}`}
                                      disabled={Boolean(otp)}
                                      label={service.name}
                                      value={service.slug}
                                    />
                                    {service.allowBookingQuantity ? (
                                      <Stack gap={4} pl={28} pr="xs">
                                        <Group justify="space-between" gap="xs">
                                          <Text c="dimmed" size="xs">{quantityLabel}</Text>
                                          <Badge color="orange" size="sm" variant="light">
                                            {formatBookingQuantityValue(quantity, quantityLabel)}
                                          </Badge>
                                        </Group>
                                        <Slider
                                          aria-label={`${service.name} ${quantityLabel}`}
                                          className="booking-value-slider"
                                          disabled={Boolean(otp) || !isSelected}
                                          label={(value) => formatBookingQuantityValue(value, quantityLabel)}
                                          max={maxBookableQuantity}
                                          min={1}
                                          onChange={(value) => updateServiceQuantity(service, value)}
                                          step={1}
                                          value={quantity}
                                        />
                                      </Stack>
                                    ) : null}
                                  </Stack>
                                );
                              })}
                            </SimpleGrid>
                          </Checkbox.Group>
                          <Text c="dimmed" size="sm">Set each selected service&apos;s quantity with its slider. The maximum follows the selected date&apos;s store hours.</Text>
                          {selectedBundleServices.length > 1 ? (
                            <Stack gap={4}>
                              <SegmentedControl
                                data={[{ label: "Together", value: "parallel" }, { label: "Back-to-back", value: "sequential" }]}
                                disabled={Boolean(otp)}
                                onChange={(value) => {
                                  setExecutionMode(value as "parallel" | "sequential");
                                  setSelectedSlotStartAt("");
                                }}
                                value={executionMode}
                              />
                              {shouldSynchronizeTogetherQuantities ? (
                                <Text c="teal" size="sm">Matching service durations are linked while this visit is together.</Text>
                              ) : null}
                            </Stack>
                          ) : null}
                          <Alert color="teal" variant="light">
                            {selectedBundleServices.length > 1
                              ? `${executionMode === "parallel" ? "Together" : "Back-to-back"} visit: ${formatDuration(bundleVisitDurationMinutes)}.`
                              : "One service selected — choose a date and available start time next."}
                          </Alert>
                          <Text fw={700} size="sm">
                            Bundle total: {selectedBundleServices.length
                              ? formatPaymentAmount(payableAmountCents, selectedBundleServices[0]?.currency || "PHP")
                              : "Choose at least one service"}
                          </Text>
                        </Stack>
                      </Card>

                      <DatePickerInput
                        className="booking-schedule-field booking-schedule-field--date"
                        clearable={false}
                        disabled={Boolean(otp)}
                        label="2. Choose a date"
                        leftSection={<IconCalendar size={16} />}
                        minDate={new Date()}
                        onChange={(value) => setBookingDate(value || "")}
                        date={calendarMonth || bookingDate}
                        onDateChange={(value: string) => setCalendarMonth(value ? new Date(value) : null)}
                        required
                        value={bookingDate}
                      />
                      <Card className="booking-schedule-field booking-time-slot-picker" p="md">
                        <Stack gap="sm">
                          <Group justify="space-between" align="flex-start" gap="sm">
                            <div>
                              <Text fw={800}>{slotPickerLabel} <Text component="span" c="red">*</Text></Text>
                              <Text c="dimmed" size="sm">
                                {slotsLoading ? "Loading available times..." : slotIntervalLabel}
                              </Text>
                            </div>
                            {selectedSlot ? <Badge color="teal" variant="light">Selected</Badge> : null}
                          </Group>
                          {slotsLoading ? (
                            <Text c="dimmed" size="sm">Loading available times...</Text>
                          ) : slots.length ? (
                            <div aria-label="Available start times" role="radiogroup">
                              <Carousel
                                className="booking-time-slot-carousel"
                                controlSize={32}
                                emblaOptions={{ align: "start" }}
                                slideGap="sm"
                                slideSize={{ base: "100%", sm: "25%" }}
                                withControls={slotCarouselGroups.length > 1}
                              >
                                {slotCarouselGroups.map((slotGroup) => (
                                  <Carousel.Slide key={slotGroup.map((slot) => String(slot.startAt)).join("-")}>
                                    <Stack className="booking-time-slot-carousel-slide" gap="sm">
                                      {slotGroup.map((slot) => {
                                        const isSelected = toTimestamp(slot.startAt) === toTimestamp(selectedSlotStartAt);
                                        const unavailableReason = slot.disabledReason === "capacity_full"
                                          ? `Unavailable — ${unavailableSlotResourceLabel} is booked`
                                          : "Unavailable — this time cannot accommodate the selected visit";

                                        return (
                                      <button
                                        aria-checked={isSelected}
                                        className="booking-time-slot"
                                        data-selected={isSelected}
                                        disabled={Boolean(otp) || !slot.isAvailable}
                                        key={String(slot.startAt)}
                                        onClick={() => setSelectedSlotStartAt(String(slot.startAt))}
                                        role="radio"
                                        type="button"
                                      >
                                        <span className="booking-time-slot__time">{format(slot.startAt, "h:mm a")}</span>
                                        <span className="booking-time-slot__availability">
                                          {slot.isAvailable
                                            ? `Ends ${format(slot.endAt, "h:mm a")} · ${slot.remainingCapacity} left`
                                            : unavailableReason}
                                        </span>
                                      </button>
                                        );
                                      })}
                                    </Stack>
                                  </Carousel.Slide>
                                ))}
                              </Carousel>
                            </div>
                          ) : (
                            <Alert color="yellow">No available slots for this date.</Alert>
                          )}
                          {selectedSlot ? (
                            <Card className="booking-time-slot-summary" p="sm" withBorder>
                              <Text c="dimmed" size="xs">Selected slot</Text>
                              <Text fw={800}>
                                {formatBookingScheduleDate(selectedSlot.startAt)} · {formatBookingScheduleTimeRange(selectedSlot.startAt, selectedSlot.endAt)}
                              </Text>
                            </Card>
                          ) : null}
                        </Stack>
                      </Card>

                      {null}

                      {null}

                      {(
                        <Stack className="booking-customer-section" gap="md">
                          <div>
                            <Text fw={800}>4. Add your contact details</Text>
                            <Text c="dimmed" size="sm">We&apos;ll use these details to verify and manage your booking.</Text>
                          </div>
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

                        </Stack>
                      )}

                      {null}

                      <Stack className="booking-flow-actions" gap="sm">
                        {(
                          <Accordion className="booking-campaign-summary">
                            <Accordion.Item value="booking-summary">
                              <Accordion.Control>
                                <Group justify="space-between" gap="sm" wrap="nowrap">
                                  <Text fw={800}>Booking summary</Text>
                                  <Badge color="teal" variant="light">
                                    {formatPaymentAmount(payableAmountCents, selectedService?.currency || "PHP")}
                                  </Badge>
                                </Group>
                              </Accordion.Control>
                              <Accordion.Panel>
                                <Stack gap="sm">
                                  <Group className="booking-campaign-summary-row" justify="space-between" gap="sm" wrap="nowrap">
                                    <Text c="dimmed" size="sm">Visit</Text>
                                    <Text fw={600} size="sm" ta="right">
                                      {selectedSlot
                                        ? `${formatBookingScheduleDate(selectedSlot.startAt)} · ${formatBookingScheduleTimeRange(selectedSlot.startAt, selectedSlot.endAt)}`
                                        : bookingDate
                                          ? `${formatBookingScheduleDate(bookingDate)} · Choose a start time`
                                          : "Choose a date and time"}
                                    </Text>
                                  </Group>
                                  <Stack className="booking-campaign-summary-row" gap={4}>
                                    <Text c="dimmed" size="sm">Services</Text>
                                    {selectedBundleServices.length ? selectedBundleServices.map((service) => (
                                      <Group justify="space-between" key={service.slug} wrap="nowrap">
                                        <Text size="sm">{service.name} · {formatDuration(service.durationMinutes * getBundleItemQuantity(service))}</Text>
                                        <Text fw={600} size="sm">{formatPaymentAmount(getServiceLineAmountCents(service, getBundleItemQuantity(service)), service.currency)}</Text>
                                      </Group>
                                    )) : <Text size="sm">Choose at least one service</Text>}
                                  </Stack>
                                  <Group className="booking-campaign-summary-row" justify="space-between" gap="sm" wrap="nowrap">
                                    <Text c="dimmed" size="sm">Contact</Text>
                                    <Text fw={600} size="sm" ta="right">
                                      {customerName || "Add your name"}
                                    </Text>
                                  </Group>
                                  <Group justify="space-between" gap="sm" wrap="nowrap">
                                    <Text c="dimmed" size="sm">Total</Text>
                                    <Text fw={700} size="sm" ta="right">
                                      {formatPaymentAmount(payableAmountCents, selectedService?.currency || "PHP")}
                                    </Text>
                                  </Group>
                                </Stack>
                              </Accordion.Panel>
                            </Accordion.Item>
                          </Accordion>
                        )}
                        <Divider />
                        <Group justify="space-between" align="flex-end">
                        <Button
                          className="booking-campaign-submit customer-primary-action"
                          color="dark"
                          disabled={
                            submitting ||
                            !vendor?.services.length ||
                            !selectedSlot ||
                            ((!selectedBundleServices.length)) ||
                            ((false))
                          }
                          h={56}
                          size="lg"
                          type="submit"
                        >
                          {submitting ? "Processing..." : "Send verification code"}
                        </Button>
                      </Group>
                      </Stack>
                    </Stack>
                  </form>
                )}
              </Stepper.Step>

              {[
              <Stepper.Step key="verify-otp" label="Verify contact" description="Confirm your OTP">
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
                      <Group className="customer-action-row booking-step-action" justify="space-between">
                        <Button
                          disabled={submitting || resendSecondsRemaining > 0}
                          onClick={resendOtp}
                          variant="subtle"
                          w="fit-content"
                        >
                          {resendOtpLabel}
                        </Button>
                        <Button
                          className="customer-primary-action"
                          color="dark"
                          disabled={submitting || otpCode.length !== 6}
                          size="lg"
                          type="submit"
                        >
                          {submitting ? "Processing..." : "Verify and submit booking"}
                        </Button>
                      </Group>
                    </Stack>
                  </form>
                ) : (
                  <Text c="dimmed" size="sm">Complete service selection first.</Text>
                )}
              </Stepper.Step>,
              requiresPaymentProof ? (
                <Stepper.Step key="payment-proof" label="Payment proof" description="Upload receipt">
                  {booking?.paymentProof ? (
                    <Stack gap="sm">
                      <Badge color="teal" variant="light" w="fit-content">Payment proof submitted</Badge>
                      <Text c="dimmed" size="sm">Your receipt is ready for vendor review.</Text>
                    </Stack>
                  ) : booking ? (
                    <Stack gap="md">
                      {manualPaymentDestination ? (
                        <Card className="group-funded-payment-card" withBorder padding="md" radius="md">
                          <div className="group-funded-payment-layout">
                            <div className="group-funded-payment-visual">
                              {manualPaymentDestination.methodLabel === "Bank Transfer" ? (
                                <Stack align="center" className="group-funded-bank-payment-icon" gap="sm" justify="center">
                                  <ThemeIcon color="blue" radius="xl" size={88} variant="light"><IconBuildingBank size={48} /></ThemeIcon>
                                  <Text fw={800}>Bank transfer</Text>
                                </Stack>
                              ) : (
                                <Image alt={`${manualPaymentDestination.methodLabel} payment QR`} className="group-funded-payment-image" fit="contain" src={manualPaymentDestination.qrImageUrl} />
                              )}
                            </div>
                            <Stack className="group-funded-payment-fields" gap="md">
                              <div>
                                <Text c="dimmed" size="xs">Payment destination</Text>
                                <Text fw={800}>{manualPaymentDestination.methodLabel}</Text>
                                {manualPaymentDestination.bankName ? <Text>{manualPaymentDestination.bankName}</Text> : null}
                                <Text>{manualPaymentDestination.accountDisplayName}</Text>
                                {manualPaymentDestination.accountIdentifierDisplay ? <Text c="dimmed" size="sm">{manualPaymentDestination.accountIdentifierDisplay}</Text> : null}
                                {manualPaymentDestination.methodLabel !== "Bank Transfer" ? <Text c="dimmed" mt={6} size="sm">Scan the QR, pay the exact amount, then submit your proof.</Text> : null}
                              </div>
                              <Text fw={800}>
                                Total payable: {formatPaymentAmount(manualPaymentDestination.amountCents, manualPaymentDestination.currency)}
                              </Text>
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
                              <div className="booking-step-action">
                                <Button
                                  className="group-funded-submit-button"
                                  color="dark"
                                  disabled={!paymentReference.trim() || !paymentProofFile}
                                  loading={proofSubmitting}
                                  onClick={handleSubmitPaymentProof}
                                  size="lg"
                                >
                                  Submit payment proof
                                </Button>
                              </div>
                            </Stack>
                          </div>
                        </Card>
                      ) : (
                        <Alert color="yellow" variant="light">
                          The vendor payment QR is not available yet. Contact the vendor before sending payment.
                        </Alert>
                      )}
                    </Stack>
                  ) : (
                    <Text c="dimmed" size="sm">Submit the booking before uploading proof.</Text>
                  )}
                </Stepper.Step>
              ) : null,

              <Stepper.Step
                key="vendor-verification"
                color={vendorDecision?.color}
                completedIcon={vendorDecision?.status === "failed" ? vendorDecision.icon : undefined}
                label="Vendor confirmation"
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
                ]}
              <Stepper.Completed>
                {vendorDecision ? (
                  <Stack gap="md">
                    <Alert color={vendorDecision.color} title={vendorDecision.title} variant="light">
                      {vendorDecision.message}
                    </Alert>
                    {vendorDecision.status === "success" && booking ? (
                      <div className="booking-step-action">
                        <Button className="booking-completion-action" component={Link} color="dark" to={`/account/bookings/${booking.id}`} w="fit-content">
                          View booking details
                        </Button>
                      </div>
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
