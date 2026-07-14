import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  FileInput,
  Group,
  Image,
  NumberInput,
  PinInput,
  Select,
  Slider,
  Stepper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { IconAlertTriangle, IconArrowLeft, IconCalendar, IconCalendarCheck, IconMapPin, IconUpload } from "@tabler/icons-react";
import { addDays, eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns";
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

function getServiceLabel(service: PublicVendorProfile["services"][number]) {
  const price = service.priceDisplay || `PHP ${(service.priceAmountCents / 100).toLocaleString()}`;
  return `${service.name} - ${service.durationMinutes} min - ${price}`;
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
  const [locationServices, setLocationServices] = useState<Array<PublicVendorService & { capacity: number }>>([]);
  const [bookingDate, setBookingDate] = useState(getDefaultBookingDate);
  const [bookingQuantity, setBookingQuantity] = useState(1);
  const [slots, setSlots] = useState<BookingSlotSummary[]>([]);
  const [groupFundedSlotsByService, setGroupFundedSlotsByService] = useState<Record<string, BookingSlotSummary[]>>({});
  const [calendarAvailability, setCalendarAvailability] = useState<Record<string, boolean>>({});
  const [calendarMonth, setCalendarMonth] = useState<Date | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
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
  const groupFundedServiceEligibility = useMemo(() => {
    if (!isGroupFundedMode || !selectedSlotStartAt) {
      return new Map<string, { available: boolean; reason: string }>();
    }
    return new Map(groupFundedEligibleServices.map((service) => {
      const slot = groupFundedSlotsByService[service.slug]?.find((entry) => String(entry.startAt) === selectedSlotStartAt);
      return [service.slug, {
        available: Boolean(slot?.isAvailable),
        reason: slot?.disabledReason === "capacity_full" ? "Full capacity for this slot" : "Unavailable for this slot"
      }];
    }));
  }, [groupFundedEligibleServices, groupFundedSlotsByService, isGroupFundedMode, selectedSlotStartAt]);
  const selectedBundleServices = useMemo(() => {
    if (!isGroupFundedMode) {
      return selectedService ? [selectedService] : [];
    }
    const selectedSlugs = new Set(selectedBundleServiceSlugs);
    return groupFundedEligibleServices.filter((service) => selectedSlugs.has(service.slug));
  }, [
    groupFundedEligibleServices,
    isGroupFundedMode,
    selectedBundleServiceSlugs,
    selectedService,
    selectedServiceSlug
  ]);
  const groupFundedQuantityService = selectedBundleServices[0] || selectedService || groupFundedEligibleServices[0];
  const groupFundedQuantityLabel = groupFundedQuantityService
    ? getBookingQuantityLabel(groupFundedQuantityService)
    : "Units";
  const bundleAmountCents = selectedBundleServices.reduce((sum, service) => {
    return sum + getServiceLineAmountCents(service, quantityForRequest);
  }, 0);
  const payableAmountCents = isGroupFundedMode ? bundleAmountCents : selectedService ? getServiceLineAmountCents(selectedService, quantityForRequest) : 0;
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
    if (isGroupFundedMode && bookingQuantity > maxGroupFundedBookingQuantity) {
      setBookingQuantity(maxGroupFundedBookingQuantity);
    }
  }, [bookingQuantity, isGroupFundedMode, maxGroupFundedBookingQuantity]);

  useEffect(() => {
    if (!isGroupFundedMode) {
      return;
    }

    const eligibleSlugs = new Set(groupFundedEligibleServices
      .filter((service) => groupFundedServiceEligibility.get(service.slug)?.available !== false)
      .map((service) => service.slug));
    setSelectedBundleServiceSlugs((current) => {
      const next = current.filter((slug) => eligibleSlugs.has(slug))
        .filter((slug, index, list) => list.indexOf(slug) === index);
      return next.join("|") === current.join("|") ? current : next;
    });
  }, [groupFundedEligibleServices, groupFundedServiceEligibility, isGroupFundedMode]);

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
    if (!vendor || !selectedLocationSlug || !bookingDate || booking || (!isGroupFundedMode && !selectedServiceSlug)) {
      setSlots([]);
      return;
    }

    const controller = new AbortController();
    setSlotsLoading(true);
    setSelectedSlotStartAt("");

    const requestSlots = (slug: string) => apiRequest<BookingSlotsResponse>(
      `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/services/${slug}/slots?date=${encodeURIComponent(formatDateInputValue(bookingDate))}&bookingQuantity=${quantityForRequest}${isGroupFundedMode ? "&groupFunded=1" : ""}`,
      { signal: controller.signal }
    );
    const serviceRequest = isGroupFundedMode
      ? Promise.all(groupFundedEligibleServices.map(async (service) => [service.slug, await requestSlots(service.slug)] as const))
      : requestSlots(selectedServiceSlug).then((data) => [[selectedServiceSlug, data] as const]);

    const request = isGroupFundedMode
      ? Promise.all([
          apiRequest<BookingSlotsResponse>(
            `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/group-funded-candidate-slots?date=${encodeURIComponent(formatDateInputValue(bookingDate))}&durationMinutes=${quantityForRequest * 60}`,
            { signal: controller.signal }
          ),
          serviceRequest
        ])
      : serviceRequest.then((entries) => [null, entries] as const);

    request
      .then(([candidateSlots, entries]) => {
        const byService = Object.fromEntries(entries.map(([slug, data]) => [slug, data.slots]));
        setGroupFundedSlotsByService(byService);
        if (!isGroupFundedMode) {
          setSlots(entries[0]?.[1].slots || []);
          return;
        }
        setSlots(candidateSlots?.slots || []);
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
  }, [booking, bookingDate, groupFundedEligibleServices, isGroupFundedMode, quantityForRequest, selectedLocationSlug, selectedServiceSlug, vendor]);

  useEffect(() => {
    if (!vendor || !selectedLocationSlug || (!isGroupFundedMode && !selectedServiceSlug) || booking) {
      setCalendarAvailability({});
      setCalendarMonth(null);
      setCalendarLoading(false);
      return;
    }

    const monthAnchor = calendarMonth || new Date(`${bookingDate}T00:00:00`);
    const controller = new AbortController();
    let active = true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    setCalendarLoading(true);

    const days = eachDayOfInterval({
      start: startOfMonth(monthAnchor),
      end: endOfMonth(monthAnchor)
    }).filter((day) => day >= today);

    Promise.all(
      days.map(async (day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const response = await apiRequest<BookingSlotsResponse>(
          isGroupFundedMode
            ? `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/group-funded-candidate-slots?date=${encodeURIComponent(dateKey)}&durationMinutes=${quantityForRequest * 60}`
            : `/public/vendors/${vendor.slug}/locations/${selectedLocationSlug}/services/${selectedServiceSlug}/slots?date=${encodeURIComponent(dateKey)}&bookingQuantity=${quantityForRequest}`,
          { signal: controller.signal }
        );
        return [dateKey, response.slots.some((slot) => slot.isAvailable)] as const;
      })
    )
      .then((entries) => {
        if (!active || controller.signal.aborted) {
          return;
        }

        setCalendarAvailability((current) => {
          const next = { ...current };
          for (const [dateKey, hasAvailability] of entries) {
            next[dateKey] = hasAvailability;
          }
          return next;
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setCalendarAvailability({});
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCalendarLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [booking, bookingDate, calendarMonth, isGroupFundedMode, quantityForRequest, selectedLocationSlug, selectedServiceSlug, vendor]);

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

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.startAt === selectedSlotStartAt) || null,
    [selectedSlotStartAt, slots]
  );

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

  const serviceOptions = useMemo(
    () => locationServices.map((service) => ({
      value: service.slug,
      label: isGroupFundedMode && !service.groupFunded?.enabled
        ? `${getServiceLabel(service)} - Group-funded unavailable`
        : getServiceLabel(service),
      disabled: isGroupFundedMode && !service.groupFunded?.enabled
    })) || [],
    [isGroupFundedMode, locationServices]
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
  const disabledBookingDates = useMemo(
    () => (date: string) => {
      if (booking) {
        return false;
      }

      const dateKey = date.slice(0, 10);
      const availability = calendarAvailability[dateKey];

      if (typeof availability === "boolean") {
        return !availability;
      }

      return false;
    },
    [booking, calendarAvailability]
  );
  const totalDurationMinutes = selectedService ? selectedService.durationMinutes * quantityForRequest : 0;
  const bundleVisitDurationMinutes = selectedBundleServices.reduce((max, service) => {
    return Math.max(max, service.durationMinutes * quantityForRequest);
  }, 0);
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
      bundleItems: selectedBundleServices.map((service) => ({
        serviceSlug: service.slug,
        bookingQuantity: quantityForRequest
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
          <Text className="finazze-section-label">Booking request</Text>
          <Title order={1}>{booking?.reference || vendor?.name || (isGroupFundedMode ? "Start group-funded booking" : "Book a service")}</Title>
          <Text c="dimmed">
            {booking
              ? "Continue the booking request on this page."
              : isGroupFundedMode
                ? "Choose the service, schedule, contributor count, and funding deadline. The slot is not reserved until the campaign is fully funded and vendor-approved."
                : "Choose a branch first, then pick a service and available slot. Some services can change by branch, so branch selection comes first."}
          </Text>
        </Stack>
      </Card>

      <div className="booking-flow-layout">
        <Card className="finazze-auth-card customer-account-card booking-flow-main" p="xl">
          <Stack gap="lg">
            <Stepper
              active={currentFlowStep}
              className={isGroupFundedMode ? "booking-flow-stepper booking-flow-stepper--group-funded" : "booking-flow-stepper"}
              color="orange"
              size="sm"
            >
              <Stepper.Step
                label={isGroupFundedMode ? "Set Up Campaign" : "Select Service"}
                description={isGroupFundedMode ? "Bundle, schedule, funding" : "Choose service and schedule"}
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

                      <Select
                        data={locationOptions}
                        disabled={!locationOptions.length || Boolean(otp)}
                        label="Branch"
                        leftSection={<IconMapPin size={16} />}
                        onChange={(value) => setSelectedLocationSlug(value || "")}
                        required
                        value={selectedLocationSlug}
                      />

                      {!isGroupFundedMode ? (
                        <>
                          <Select
                            data={serviceOptions}
                            disabled={!serviceOptions.length || Boolean(otp)}
                            label="Service"
                            leftSection={<IconCalendarCheck size={16} />}
                            onChange={(value) => {
                              setSelectedServiceSlug(value || "");
                              setSelectedBundleServiceSlugs(value ? [value] : []);
                            }}
                            required
                            value={selectedServiceSlug}
                          />
                          {selectedService ? (
                            <Alert color="teal" variant="light">
                              <Stack gap={4}>
                                <Text size="sm">
                                  {selectedService.description || `${selectedService.durationMinutes} minute service`}
                                </Text>
                                <Text size="sm">Branch capacity: {selectedService.capacity} slot(s)</Text>
                                {selectedService.manualPaymentRequired ? (
                                  <Text fw={700} size="sm">
                                    Payment proof will be required after OTP verification.
                                  </Text>
                                ) : null}
                              </Stack>
                            </Alert>
                          ) : null}
                        </>
                      ) : null}

                      {!isGroupFundedMode && selectedService && allowBookingQuantity ? (
                        <>
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
                          <Text c="dimmed" size="sm">
                            Total booking time: {formatDuration(totalDurationMinutes)}.
                          </Text>
                        </>
                      ) : null}

                      {isGroupFundedMode ? (
                        <Card className="booking-bundle-card booking-setup-section" withBorder radius="md" p="md">
                          <Stack gap="sm">
                            <Stack gap={2}>
                              <Text fw={800}>1. Plan your visit</Text>
                              <Text c="dimmed" size="sm">
                                Choose one service or bundle multiple services in the same visit.
                              </Text>
                            </Stack>
                            <Stack gap={6}>
                              <Group justify="space-between" gap="sm">
                                <Text fw={500} size="sm">{groupFundedQuantityLabel} <Text component="span" c="red">*</Text></Text>
                                <Badge color="orange" variant="light">{formatBookingQuantityValue(bookingQuantity, groupFundedQuantityLabel)}</Badge>
                              </Group>
                              <Slider
                                aria-label={groupFundedQuantityLabel}
                                className="booking-value-slider"
                                disabled={Boolean(otp)}
                                label={(value) => formatBookingQuantityValue(value, groupFundedQuantityLabel)}
                                max={maxGroupFundedBookingQuantity}
                                min={1}
                                onChange={(value) => {
                                  setSelectedSlotStartAt("");
                                  setBookingQuantity(value);
                                }}
                                step={1}
                                value={bookingQuantity}
                              />
                              <Group className="booking-slider-bounds" justify="space-between">
                                <Text c="dimmed" size="xs">1</Text>
                                <Text c="dimmed" size="xs">{maxGroupFundedBookingQuantity}</Text>
                              </Group>
                            </Stack>
                            <Text c="dimmed" size="sm">Set the visit length first. The maximum follows the selected date&apos;s store hours.</Text>
                            <Alert color="teal" variant="light">
                              Bundle total is {formatPaymentAmount(payableAmountCents, selectedBundleServices[0]?.currency || "PHP")} for a {formatDuration(bundleVisitDurationMinutes)} visit.
                            </Alert>
                          </Stack>
                        </Card>
                      ) : null}

                      <DatePickerInput
                        className={isGroupFundedMode ? "booking-schedule-field booking-schedule-field--date" : undefined}
                        clearable={false}
                        disabled={Boolean(otp)}
                        excludeDate={disabledBookingDates}
                        label={isGroupFundedMode ? "2. Choose a date" : "Date"}
                        leftSection={<IconCalendar size={16} />}
                        minDate={new Date()}
                        onChange={(value) => setBookingDate(value || "")}
                        date={calendarMonth || bookingDate}
                        onDateChange={(value: string) => setCalendarMonth(value ? new Date(value) : null)}
                        required
                        value={bookingDate}
                      />
                      {calendarLoading ? (
                        <Text c="dimmed" size="sm">
                          Checking which calendar days have open slots...
                        </Text>
                      ) : null}

                      <Select
                        className={isGroupFundedMode ? "booking-schedule-field booking-schedule-field--slot" : undefined}
                        data={slotOptions}
                        disabled={slotsLoading || !slotOptions.length || Boolean(otp)}
                        label={isGroupFundedMode ? "3. Choose a start time" : "Available slot"}
                        onChange={(value) => setSelectedSlotStartAt(value || "")}
                        placeholder={slotsLoading ? "Loading slots..." : "Select a time"}
                        required
                        value={selectedSlotStartAt}
                      />
                      {!slotsLoading && bookingDate && !slotOptions.length ? (
                        <Alert color="yellow">No available slots for this date.</Alert>
                      ) : null}

                      {isGroupFundedMode ? (
                        <Stack className="booking-service-picker" gap="xs">
                          <Text fw={800}>4. Pick available services</Text>
                          {selectedSlotStartAt ? (
                            <Checkbox.Group
                              onChange={setSelectedBundleServiceSlugs}
                              value={selectedBundleServiceSlugs}
                            >
                              <Stack gap="xs">
                                {groupFundedEligibleServices.map((service) => {
                                  const eligibility = groupFundedServiceEligibility.get(service.slug);
                                  return (
                                    <Checkbox
                                      className="booking-bundle-option"
                                      description={eligibility?.available
                                        ? `${formatDuration(service.durationMinutes * quantityForRequest)} · ${formatPaymentAmount(getServiceLineAmountCents(service, quantityForRequest), service.currency)}`
                                        : eligibility?.reason || "Choose a slot to check availability"}
                                      disabled={Boolean(otp) || !eligibility?.available}
                                      key={service.slug}
                                      label={service.name}
                                      value={service.slug}
                                    />
                                  );
                                })}
                              </Stack>
                            </Checkbox.Group>
                          ) : (
                            <Text c="dimmed" size="sm">Choose a start time to see the services available for that visit.</Text>
                          )}
                        </Stack>
                      ) : null}

                      {isGroupFundedMode ? (
                        <Stack className="booking-funding-section" gap="md">
                          <div>
                            <Text fw={800}>5. Set up funding</Text>
                            <Text c="dimmed" size="sm">Set the contribution goal and how people can discover this campaign.</Text>
                          </div>
                          <Alert color="yellow" icon={<IconAlertTriangle size={16} />} variant="light">
                            This funding-stage campaign does not reserve the slot. It moves to vendor review only after all required contributions are verified.
                          </Alert>
                          <Stack gap={6}>
                            <Group justify="space-between" gap="sm">
                              <Text fw={500} size="sm">Required contributors <Text component="span" c="red">*</Text></Text>
                              <Badge color="orange" variant="light">{requiredContributors} people</Badge>
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
                          {selectedSlot && !fundingDeadlineBounds.hasValidWindow ? (
                            <Alert color="yellow" icon={<IconAlertTriangle size={16} />} variant="light">
                              This slot is too soon for a group-funded campaign. Choose a later booking slot so funding can close before vendor review.
                            </Alert>
                          ) : null}
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
                        <>
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
                        </>
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
                                        <Text size="sm">{service.name} · {formatDuration(service.durationMinutes * quantityForRequest)}</Text>
                                        <Text fw={600} size="sm">{formatPaymentAmount(getServiceLineAmountCents(service, quantityForRequest), service.currency)}</Text>
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
                        ) : null}
                        <Group justify="space-between" align="flex-end">
                        <Text c="dimmed" size="sm">
                          {selectedService
                            ? isGroupFundedMode
                              ? "Review the campaign summary before you create it."
                              : allowBookingQuantity
                                ? `${getServiceLabel(selectedService)} - ${formatDuration(totalDurationMinutes)} total`
                                : getServiceLabel(selectedService)
                            : "Select a service to continue."}
                        </Text>
                        <Button
                          className={isGroupFundedMode ? "booking-campaign-submit customer-primary-action" : "customer-primary-action"}
                          color="dark"
                          disabled={
                            submitting ||
                            !vendor?.services.length ||
                            !selectedSlot ||
                            (isGroupFundedMode && (!groupFundedAvailable || !fundingDeadlineBounds.hasValidWindow))
                          }
                          h={isGroupFundedMode ? 56 : undefined}
                          size={isGroupFundedMode ? "lg" : "sm"}
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
              <Stepper.Step key="verify-otp" label="Verify OTP" description="Confirm your contact">
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
                      <Group className="customer-action-row" justify="space-between">
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
                <Stepper.Step key="payment-proof" label="Payment Proof" description="Upload receipt">
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
                        className="customer-primary-action"
                        color="dark"
                        disabled={!paymentReference.trim() || !paymentProofFile}
                        loading={proofSubmitting}
                        onClick={handleSubmitPaymentProof}
                        size="lg"
                      >
                        Submit payment proof
                      </Button>
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
                ]}
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
