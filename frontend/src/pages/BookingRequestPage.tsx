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
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { IconAlertTriangle, IconArrowLeft, IconBuildingBank, IconCalendar, IconMapPin, IconUpload } from "@tabler/icons-react";
import { addDays, format } from "date-fns";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import CampaignDescriptionEditor from "../components/CampaignDescriptionEditor";
import type {
  BookingPaymentProofUploadResponse,
  BookingOtpResponse,
  BookingSlotsResponse,
  BookingSlotSummary,
  CreateCustomerBookingRequest,
  CreateGroupFundedCampaignRequest,
  CustomerBookingDetailResponse,
  CustomerBookingResponse,
  PublicVendorProfile,
  PublicVendorProfileResponse,
  PublicVendorService,
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

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function roundUpToHalfHour(date: Date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const nextMinutes = minutes === 0 || minutes === 30 ? minutes : minutes < 30 ? 30 : 60;
  rounded.setMinutes(nextMinutes);
  return rounded;
}

function roundDownToHalfHour(date: Date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(rounded.getMinutes() < 30 ? 0 : 30);
  return rounded;
}

function parseDateTimePickerValue(value: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDate(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getLocalDayStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getLocalDayEnd(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function formatTimeConstraint(date: Date) {
  return [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    "00"
  ].join(":");
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
  const navigate = useNavigate();
  const selectedLocationFromQuery = useMemo(() => new URLSearchParams(location.search).get("location") || "", [location.search]);
  const bookingMode = useMemo(() => new URLSearchParams(location.search).get("mode") || "standard", [location.search]);
  const isGroupFundedMode = bookingMode === "group-funded";
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
  const [requiredContributors, setRequiredContributors] = useState(2);
  const [fundingDeadlineAt, setFundingDeadlineAt] = useState("");
  const [campaignVisibility, setCampaignVisibility] = useState<"private_link" | "public">("private_link");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
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
          if (currentService && (!isGroupFundedMode || currentService.groupFunded?.enabled)) {
            return current;
          }
          const defaultService = isGroupFundedMode
            ? data.services.find((service) => service.groupFunded?.enabled)
            : data.services[0];
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
  }, [isGroupFundedMode, selectedLocationSlug, vendor]);

  const selectedService = useMemo(
    () => locationServices.find((service) => service.slug === selectedServiceSlug) || null,
    [locationServices, selectedServiceSlug]
  );
  const selectedLocation = useMemo(
    () => vendor?.locations.find((location) => location.slug === selectedLocationSlug) || null,
    [selectedLocationSlug, vendor]
  );
  const allowBookingQuantity = selectedService?.allowBookingQuantity === true;
  const maxGroupFundedBookingQuantity = getMaxBookableHours(
    selectedLocation?.hours || [],
    new Date(`${bookingDate}T00:00:00`).getDay()
  );
  const quantityForRequest = allowBookingQuantity ? bookingQuantity : 1;
  const groupFundedSettings = selectedService?.groupFunded || null;
  const groupFundedAvailable = Boolean(groupFundedSettings?.enabled);
  const groupFundedEligibleServices = useMemo(
    () => locationServices.filter((service) => service.groupFunded?.enabled),
    [locationServices]
  );
  const selectedBundleServices = useMemo(() => {
    if (!isGroupFundedMode) {
      const selectedSlugs = new Set(selectedBundleServiceSlugs);
      const services = locationServices.filter((service) => selectedSlugs.has(service.slug));
      return selectedService
        ? [selectedService, ...services.filter((service) => service.slug !== selectedService.slug)]
        : services;
    }
    const selectedSlugs = new Set(selectedBundleServiceSlugs);
    const services = groupFundedEligibleServices.filter((service) => selectedSlugs.has(service.slug));
    return selectedService
      ? [selectedService, ...services.filter((service) => service.slug !== selectedService.slug)]
      : services;
  }, [
    groupFundedEligibleServices,
    isGroupFundedMode,
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
  const groupFundedMinContributors = groupFundedSettings?.minRequiredContributors || 2;
  const groupFundedMaxContributors = Math.max(
    groupFundedMinContributors,
    groupFundedSettings?.maxRequiredContributors || 100
  );
  const computedContributionCents = requiredContributors > 0 ? Math.ceil(payableAmountCents / requiredContributors) : 0;

  useEffect(() => {
    if (!allowBookingQuantity && bookingQuantity !== 1) {
      setBookingQuantity(1);
    }
  }, [allowBookingQuantity, bookingQuantity]);

  useEffect(() => {
    if (isGroupFundedMode || !selectedServiceSlug) {
      return;
    }
    setSelectedBundleServiceSlugs((current) => current.includes(selectedServiceSlug)
      ? current
      : [selectedServiceSlug, ...current]);
  }, [isGroupFundedMode, selectedServiceSlug]);

  useEffect(() => {
    if (isGroupFundedMode && bookingQuantity > maxGroupFundedBookingQuantity) {
      setBookingQuantity(maxGroupFundedBookingQuantity);
    }
  }, [bookingQuantity, isGroupFundedMode, maxGroupFundedBookingQuantity]);

  useEffect(() => {
    if (!shouldSynchronizeTogetherQuantities) {
      return;
    }

    const synchronizedQuantity = Math.max(1, Math.min(bookingQuantity, maxGroupFundedBookingQuantity));
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
  }, [bookingQuantity, maxGroupFundedBookingQuantity, selectedBundleServices, selectedServiceSlug, shouldSynchronizeTogetherQuantities]);

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
    if (!groupFundedSettings?.enabled) {
      return;
    }
    const defaultCount = Math.min(
      groupFundedMaxContributors,
      Math.max(
        groupFundedMinContributors,
        groupFundedSettings.defaultRequiredContributors || groupFundedMinContributors
      )
    );
    setRequiredContributors((current) => {
      return current >= groupFundedMinContributors && current <= groupFundedMaxContributors
        ? current
        : defaultCount;
    });
  }, [groupFundedMaxContributors, groupFundedMinContributors, groupFundedSettings]);

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
              includeGroupFundedHolds: isGroupFundedMode
            }
          }
        )
      : apiRequest<BookingSlotsResponse>(
          `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/services/${selectedServiceSlug}/slots?date=${encodeURIComponent(formatDateInputValue(bookingDate))}&bookingQuantity=${quantityForRequest}${isGroupFundedMode ? "&groupFunded=1" : ""}`,
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
  }, [booking, bookingDate, executionMode, getBundleItemQuantity, isGroupFundedMode, quantityForRequest, selectedBundleServices, selectedLocationSlug, selectedServiceSlug, vendor]);

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

  const fundingDeadlineBounds = useMemo(() => {
    if (!isGroupFundedMode || !selectedSlot || !groupFundedSettings?.enabled) {
      return { min: null, max: null, hasValidWindow: false };
    }

    const slotStart = new Date(String(selectedSlot.startAt));
    if (Number.isNaN(slotStart.getTime())) {
      return { min: null, max: null, hasValidWindow: false };
    }

    const minDeadlineHours = Number(groupFundedSettings.minDeadlineHours || 24);
    const maxDeadlineDays = Number(groupFundedSettings.maxDeadlineDays || 14);
    const minimumDeadline = roundUpToHalfHour(new Date(Date.now() + minDeadlineHours * 60 * 60 * 1000));
    const maximumBySettings = roundDownToHalfHour(new Date(Date.now() + maxDeadlineDays * 24 * 60 * 60 * 1000));
    const maximumBySlot = roundDownToHalfHour(new Date(slotStart.getTime() - 24 * 60 * 60 * 1000));
    const maximumDeadline = maximumBySlot < maximumBySettings ? maximumBySlot : maximumBySettings;

    return {
      min: minimumDeadline,
      max: maximumDeadline,
      hasValidWindow: minimumDeadline <= maximumDeadline
    };
  }, [
    groupFundedSettings?.enabled,
    groupFundedSettings?.maxDeadlineDays,
    groupFundedSettings?.minDeadlineHours,
    isGroupFundedMode,
    selectedSlot
  ]);

  const fundingDeadlineValue = useMemo(
    () => parseDateTimePickerValue(fundingDeadlineAt),
    [fundingDeadlineAt]
  );

  const fundingDeadlineTimeBounds = useMemo(() => ({
    min:
      fundingDeadlineBounds.min && fundingDeadlineValue && isSameLocalDate(fundingDeadlineValue, fundingDeadlineBounds.min)
        ? formatTimeConstraint(fundingDeadlineBounds.min)
        : undefined,
    max:
      fundingDeadlineBounds.max && fundingDeadlineValue && isSameLocalDate(fundingDeadlineValue, fundingDeadlineBounds.max)
        ? formatTimeConstraint(fundingDeadlineBounds.max)
        : undefined
  }), [fundingDeadlineBounds.max, fundingDeadlineBounds.min, fundingDeadlineValue]);

  const excludeFundingDeadlineDate = useCallback((value: string | Date) => {
    if (!fundingDeadlineBounds.min || !fundingDeadlineBounds.max || !fundingDeadlineBounds.hasValidWindow) {
      return true;
    }

    const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return true;
    }

    return (
      getLocalDayEnd(date) < fundingDeadlineBounds.min ||
      getLocalDayStart(date) > fundingDeadlineBounds.max
    );
  }, [fundingDeadlineBounds.hasValidWindow, fundingDeadlineBounds.max, fundingDeadlineBounds.min]);

  useEffect(() => {
    if (!isGroupFundedMode) {
      return;
    }

    if (!selectedSlot || !fundingDeadlineBounds.min || !fundingDeadlineBounds.max || !fundingDeadlineBounds.hasValidWindow) {
      setFundingDeadlineAt("");
      return;
    }

    const preferredDeadline = roundUpToHalfHour(new Date(Date.now() + 48 * 60 * 60 * 1000));
    const deadline = preferredDeadline < fundingDeadlineBounds.min
      ? fundingDeadlineBounds.min
      : preferredDeadline > fundingDeadlineBounds.max
        ? fundingDeadlineBounds.max
        : preferredDeadline;
    setFundingDeadlineAt(toDateTimeLocalValue(deadline));
  }, [
    fundingDeadlineBounds.hasValidWindow,
    fundingDeadlineBounds.max,
    fundingDeadlineBounds.min,
    isGroupFundedMode,
    selectedSlot
  ]);

  const locationOptions = useMemo(
    () => vendor?.locations.map((location) => ({
      value: location.slug,
      label: [location.name, location.city, location.province].filter(Boolean).join(", ")
    })) || [],
    [vendor]
  );
  const slotIntervalLabel = useMemo(() => {
    if (slots.length < 2) {
      return isGroupFundedMode ? "Start times are offered every 30 minutes." : "Choose an available start time.";
    }

    const firstStart = toTimestamp(slots[0]?.startAt);
    const secondStart = toTimestamp(slots[1]?.startAt);
    const intervalMinutes = Math.round((secondStart - firstStart) / (60 * 1000));

    return Number.isFinite(intervalMinutes) && intervalMinutes > 0
      ? `Start times are offered every ${formatDuration(intervalMinutes)}.`
      : "Choose an available start time.";
  }, [isGroupFundedMode, slots]);
  const bundleVisitDurationMinutes = selectedBundleServices.reduce((total, service) => {
    const duration = service.durationMinutes * getBundleItemQuantity(service);
    return executionMode === "sequential" ? total + duration : Math.max(total, duration);
  }, 0);
  const slotPickerLabel = `Available start times — ${formatDuration(bundleVisitDurationMinutes || selectedService?.durationMinutes || 0)} booking`;
  const unavailableSlotResourceLabel = selectedBundleServices.length === 1
    ? selectedBundleServices[0]?.name || "This service"
    : "A selected service";
  const requiresPaymentProof = !isGroupFundedMode && Boolean(
    booking?.serviceManualPaymentRequired ||
    selectedService?.manualPaymentRequired
  );
  const vendorDecision = getVendorDecision(booking);
  const currentFlowStep = isGroupFundedMode ? 0 : getBookingFlowStep(booking, otp, requiresPaymentProof, Boolean(vendorDecision));
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

  function buildGroupFundedPayload(): CreateGroupFundedCampaignRequest {
    if (!vendor || !selectedSlot) {
      throw new Error("Select an available booking slot.");
    }
    if (!selectedBundleServices.length) {
      throw new Error("Select at least one available service for this slot.");
    }
    if (!fundingDeadlineBounds.hasValidWindow || !fundingDeadlineBounds.min || !fundingDeadlineBounds.max) {
      throw new Error("Choose a later booking slot so funding can close before vendor review.");
    }
    const fundingDeadlineDate = parseDateTimePickerValue(fundingDeadlineAt);
    if (!fundingDeadlineDate) {
      throw new Error("Set a valid funding deadline.");
    }
    if (
      (fundingDeadlineDate < fundingDeadlineBounds.min || fundingDeadlineDate > fundingDeadlineBounds.max)
    ) {
      throw new Error("Funding deadline must be within the allowed window for the selected booking slot.");
    }
    return {
      tenantSlug: vendor.slug,
      locationSlug: selectedLocationSlug,
      serviceSlug: selectedBundleServices[0].slug,
      scheduledStartAt: String(selectedSlot.startAt),
      bookingQuantity: quantityForRequest,
      executionMode,
      bundleItems: selectedBundleServices.map((service) => ({
        serviceSlug: service.slug,
        bookingQuantity: getBundleItemQuantity(service)
      })),
      requiredContributors,
      fundingDeadlineAt: fundingDeadlineDate.toISOString(),
      visibility: campaignVisibility,
      campaignTitle: campaignTitle.trim(),
      description: campaignDescription.trim()
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

  const submitGroupFundedCampaign = useCallback(async (payload: CreateGroupFundedCampaignRequest) => {
    if (!token) {
      return;
    }

    const response = await apiRequest<{ campaign: { publicToken: string } }, CreateGroupFundedCampaignRequest>(
      "/account/group-funded-campaigns",
      {
        method: "POST",
        token,
        body: payload
      }
    );
    showCustomerSuccess("Campaign created", "Your group-funded campaign is ready to share.");
    navigate(`/group-funded/${response.campaign.publicToken}`);
  }, [navigate, token]);

  if (authLoading || loading) {
    return <Card className="finazze-auth-card">Loading booking flow...</Card>;
  }

  if (!user) {
    const params = new URLSearchParams();
    if (selectedLocationSlug) {
      params.set("location", selectedLocationSlug);
    }
    if (isGroupFundedMode) {
      params.set("mode", "group-funded");
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
      if (isGroupFundedMode) {
        if (!groupFundedAvailable) {
          throw new Error("Group-funded booking is not enabled for this service at this branch.");
        }
        await submitGroupFundedCampaign(buildGroupFundedPayload());
        return;
      }

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
          <Text className="finazze-section-label">{isGroupFundedMode ? "Group-funded campaign" : "Booking request"}</Text>
          <Title order={1}>{booking?.reference || vendor?.name || (isGroupFundedMode ? "Start group-funded booking" : "Start a booking")}</Title>
          <Text c="dimmed">
            {booking
              ? "Continue the booking request on this page."
              : isGroupFundedMode
                ? "Choose the branch, services, schedule, contributor count, and funding deadline. The slot is not reserved until the campaign is fully funded and vendor-approved."
                : "Plan your visit by choosing a branch, services, visit length, and an available start time."}
          </Text>
        </Stack>
      </Card>

      <div className="booking-flow-layout">
        <Card className="finazze-auth-card customer-account-card booking-flow-main" p="xl">
          <Stack gap="lg">
            <Stepper
              active={currentFlowStep}
              className={`booking-flow-stepper ${isGroupFundedMode ? "booking-flow-stepper--group-funded" : "booking-flow-stepper--booking"}`}
              color="orange"
              size="sm"
            >
              <Stepper.Step
                label={isGroupFundedMode ? "Plan Campaign" : "Plan Visit"}
                description={isGroupFundedMode ? "Branch, bundle, schedule, funding" : "Branch, services, and schedule"}
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
                              {(isGroupFundedMode ? groupFundedEligibleServices : locationServices).map((service) => {
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
                                          max={maxGroupFundedBookingQuantity}
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
                                slideSize={{ base: "100%", sm: "50%", md: "33.333333%", lg: "25%" }}
                                withControls={slots.length > 1}
                              >
                                {slots.map((slot) => {
                                  const isSelected = toTimestamp(slot.startAt) === toTimestamp(selectedSlotStartAt);
                                  const unavailableReason = slot.disabledReason === "capacity_full"
                                    ? `Unavailable — ${unavailableSlotResourceLabel} is booked`
                                    : "Unavailable — this time cannot accommodate the selected visit";

                                  return (
                                    <Carousel.Slide key={String(slot.startAt)}>
                                      <button
                                        aria-checked={isSelected}
                                        className="booking-time-slot"
                                        data-selected={isSelected}
                                        disabled={Boolean(otp) || !slot.isAvailable}
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
                                    </Carousel.Slide>
                                  );
                                })}
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

                      {isGroupFundedMode && selectedSlot ? (
                        fundingDeadlineBounds.hasValidWindow && fundingDeadlineBounds.min && fundingDeadlineBounds.max ? (
                          <Alert color="blue" variant="light">
                            Funding deadline: {format(fundingDeadlineBounds.min, "MMM d, yyyy h:mm a")} – {format(fundingDeadlineBounds.max, "MMM d, yyyy h:mm a")}.
                          </Alert>
                        ) : (
                          <Alert color="yellow" icon={<IconAlertTriangle size={16} />} variant="light">
                            This slot is too soon for a group-funded campaign. Choose a later booking slot so funding can close before vendor review.
                          </Alert>
                        )
                      ) : null}

                      {isGroupFundedMode ? (
                        <Stack className="booking-funding-section" gap="md">
                          <div>
                            <Text fw={800}>4. Set up funding</Text>
                            <Text c="dimmed" size="sm">Set the contribution goal and how people can discover this campaign.</Text>
                          </div>
                          <Alert color="yellow" icon={<IconAlertTriangle size={16} />} variant="light">
                            This funding-stage campaign does not reserve the slot. It moves to vendor review only after all required contributions are verified.
                          </Alert>
                          <Stack gap={6}>
                            <Group justify="space-between" gap="sm">
                              <Text fw={500} size="sm">Required contributors <Text component="span" c="red">*</Text></Text>
                              <Badge color="orange" variant="light">
                                <span style={{ fontWeight: 400 }}>{requiredContributors} people: </span>
                                <strong>{formatPaymentAmount(computedContributionCents, selectedService?.currency || "PHP")} each</strong>
                              </Badge>
                            </Group>
                            <Slider
                              aria-label="Required contributors"
                              className="booking-value-slider"
                              disabled={Boolean(otp) || !groupFundedAvailable}
                              label={(value) => `${value} contributors`}
                              max={groupFundedMaxContributors}
                              min={groupFundedMinContributors}
                              onChange={setRequiredContributors}
                              step={1}
                              value={requiredContributors}
                            />
                            <Group className="booking-slider-bounds" justify="space-between">
                              <Text c="dimmed" size="xs">Min {groupFundedMinContributors}</Text>
                              <Text c="dimmed" size="xs">Max {groupFundedMaxContributors}</Text>
                            </Group>
                          </Stack>
                          <DateTimePicker
                            clearable
                            defaultTimeValue="12:00"
                            disabled={Boolean(otp) || !groupFundedAvailable || !selectedSlot || !fundingDeadlineBounds.hasValidWindow}
                            excludeDate={excludeFundingDeadlineDate}
                            label="Funding deadline"
                            maxDate={fundingDeadlineBounds.hasValidWindow ? fundingDeadlineBounds.max || undefined : undefined}
                            minDate={fundingDeadlineBounds.hasValidWindow ? fundingDeadlineBounds.min || undefined : undefined}
                            onChange={(value) => setFundingDeadlineAt(value || "")}
                            placeholder="Select funding deadline"
                            required
                            timePickerProps={{
                              format: "12h",
                              max: fundingDeadlineTimeBounds.max,
                              min: fundingDeadlineTimeBounds.min,
                              minutesStep: 30,
                              popoverProps: { withinPortal: false },
                              withDropdown: true
                            }}
                            value={fundingDeadlineAt}
                            valueFormat="MMM D, YYYY h:mm A"
                          />
                          <Select
                            data={[
                              { label: "Private link only", value: "private_link" },
                              { label: "Public on vendor profile", value: "public", disabled: !groupFundedSettings?.allowPublicCampaigns }
                            ]}
                            disabled={Boolean(otp) || !groupFundedAvailable}
                            label="Visibility"
                            onChange={(value) => setCampaignVisibility((value || "private_link") as "private_link" | "public")}
                            value={campaignVisibility}
                          />
                          <TextInput
                            disabled={Boolean(otp) || !groupFundedAvailable}
                            label="Campaign title"
                            maxLength={90}
                            onChange={(event) => setCampaignTitle(event.currentTarget.value)}
                            placeholder={selectedService ? `${selectedService.name} group booking` : "Weekend group session"}
                            required
                            value={campaignTitle}
                          />
                          <Stack gap={4}>
                            <Text fw={500} size="sm">Campaign description</Text>
                            <CampaignDescriptionEditor
                              disabled={Boolean(otp) || !groupFundedAvailable}
                              onChange={setCampaignDescription}
                              value={campaignDescription}
                            />
                          </Stack>
                          <Alert color="teal" variant="light">
                            Each person contributes {formatPaymentAmount(computedContributionCents, selectedService?.currency || "PHP")}. Everyone pays the same amount in full, so there are no partial payments, extra payments, or tips.
                          </Alert>
                        </Stack>
                      ) : null}

                      {!isGroupFundedMode ? (
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
                      ) : null}

                      {isGroupFundedMode ? (
                        <Alert className="booking-next-steps" color="blue" variant="light">
                          <Text fw={800} size="sm">What happens next</Text>
                          <Text size="sm">Create campaign → contributors fund it → vendor reviews → booking confirmed.</Text>
                        </Alert>
                      ) : null}

                      <Stack className="booking-flow-actions" gap="sm">
                        {isGroupFundedMode ? (
                          <Accordion className="booking-campaign-summary">
                            <Accordion.Item value="campaign-summary">
                              <Accordion.Control>
                                <Group justify="space-between" gap="sm" wrap="nowrap">
                                  <Text fw={800}>Campaign summary</Text>
                                  <Badge color="teal" variant="light">
                                    {formatPaymentAmount(payableAmountCents, selectedBundleServices[0]?.currency || "PHP")}
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
                                    )) : <Text size="sm">Choose at least one available service</Text>}
                                  </Stack>
                                  <Group className="booking-campaign-summary-row" justify="space-between" gap="sm" wrap="nowrap">
                                    <Text c="dimmed" size="sm">Funding</Text>
                                    <Text fw={600} size="sm" ta="right">
                                      {requiredContributors} people · {formatPaymentAmount(computedContributionCents, selectedService?.currency || "PHP")} each
                                    </Text>
                                  </Group>
                                  <Group className="booking-campaign-summary-row" justify="space-between" gap="sm" wrap="nowrap">
                                    <Text c="dimmed" size="sm">Funding deadline</Text>
                                    <Text fw={600} size="sm" ta="right">
                                      {fundingDeadlineAt ? format(new Date(fundingDeadlineAt), "MMM d, yyyy h:mm a") : "Choose a deadline"}
                                    </Text>
                                  </Group>
                                  <Group justify="space-between" gap="sm" wrap="nowrap">
                                    <Text c="dimmed" size="sm">Visibility</Text>
                                    <Text fw={600} size="sm" ta="right">
                                      {campaignVisibility === "public" ? "Public on vendor profile" : "Private link only"}
                                    </Text>
                                  </Group>
                                </Stack>
                              </Accordion.Panel>
                            </Accordion.Item>
                          </Accordion>
                        ) : (
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
                            (!isGroupFundedMode && !selectedBundleServices.length) ||
                            (isGroupFundedMode && (!groupFundedAvailable || !fundingDeadlineBounds.hasValidWindow))
                          }
                          h={56}
                          size="lg"
                          type="submit"
                        >
                          {submitting ? "Processing..." : isGroupFundedMode ? "Create campaign" : "Send verification code"}
                        </Button>
                      </Group>
                      </Stack>
                    </Stack>
                  </form>
                )}
              </Stepper.Step>

              {isGroupFundedMode ? [
                  <Stepper.Step key="funding" label="Funding" description="Contributors upload proof">
                    <Text c="dimmed" size="sm">
                      After creation, contributors join from the campaign page and submit their payment proof.
                    </Text>
                  </Stepper.Step>,
                  <Stepper.Step key="vendor-review" label="Vendor Review" description="Capacity hold and approval">
                    <Text c="dimmed" size="sm">
                      When funding is verified, the vendor reviews capacity before confirming the linked booking.
                    </Text>
                  </Stepper.Step>,
                  <Stepper.Step key="confirmed-booking" label="Confirmed Booking" description="Organizer booking created">
                    <Text c="dimmed" size="sm">
                      Vendor approval creates one organizer-owned booking backed by the contribution ledger.
                    </Text>
                  </Stepper.Step>
                ] : [
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
