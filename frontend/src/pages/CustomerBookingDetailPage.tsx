import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Accordion, Alert, Badge, Button, Card, Container, FileInput, Group, Image, Modal, Paper, ScrollArea, SimpleGrid, Spoiler, Stack, Text, Textarea, TextInput, ThemeIcon, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconArrowLeft, IconBuildingBank, IconBuildingStore, IconCalendar, IconCircleCheck, IconExternalLink, IconEye, IconReceipt, IconTicket, IconUpload, IconX } from "@tabler/icons-react";
import { Link, Navigate, useParams } from "react-router-dom";
import type {
  BookingPaymentProofAccessResponse,
  BookingPaymentProofUploadResponse,
  BookingStatus,
  CancelCustomerBookingResponse,
  CustomerBookingDetailResponse,
  CustomerBookingResponse,
  PublicBoardThemeSettings,
  PublicVendorProfile,
  PublicVendorProfileResponse,
  SubmitBookingPaymentProofRequest
} from "@shared";
import { API_BASE_URL, ApiError, apiRequest } from "../api/client";
import ResourceErrorState from "../components/ResourceErrorState";
import RichCampaignDescription from "../components/RichCampaignDescription";
import { useAuth } from "../context/AuthContext";
import { buildJoinedQueuePathWithTicket } from "../queuePaths";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
  formatDateTime,
  formatDisplayTime,
  toTimestamp
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";
import { showCustomerError } from "../utils/customerNotifications";
import { buildVendorThemeMediaStyle, buildVendorThemeStyle } from "../utils/vendorTheme";

function getBookingBadgeColor(status: BookingStatus): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "pending":
      return "yellow";
    case "confirmed":
      return "teal";
    case "rescheduled":
      return "blue";
    case "completed":
    case "reviewed":
      return "gray";
    case "canceled":
      return "red";
    case "disputed":
      return "orange";
    default:
      return "gray";
  }
}

function canCancel(status: BookingStatus, checkedInAt: string | Date | null, linkedTicket: unknown) {
  return ["pending", "confirmed", "rescheduled"].includes(status) && !checkedInAt && !linkedTicket;
}

function canSubmitPaymentProof(
  status: BookingStatus,
  checkedInAt: string | Date | null,
  linkedTicket: unknown,
  hasProof: boolean,
  serviceManualPaymentRequired: boolean
) {
  return serviceManualPaymentRequired && ["pending", "confirmed", "rescheduled"].includes(status) && !checkedInAt && !linkedTicket && !hasProof;
}

function formatBytes(sizeBytes: number | null) {
  if (!sizeBytes) {
    return "Unknown size";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatPaymentAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

function getContributionBadgeColor(status: string): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "verified":
      return "teal";
    case "submitted":
    case "pending_proof":
      return "yellow";
    case "rejected":
      return "red";
    case "refund_pending":
      return "orange";
    case "refunded":
      return "blue";
    case "policy_review_required":
      return "orange";
    default:
      return "gray";
  }
}

function formatCampaignStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function formatDurationLabel(startValue: string | Date, endValue: string | Date) {
  const start = toTimestamp(startValue);
  const end = toTimestamp(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "Schedule set";
  }

  const totalMinutes = Math.round((end - start) / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = totalMinutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr${hours === 1 ? "" : "s"}`;
}

function formatPhilippineMobileNumber(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  const local = digits.startsWith("63")
    ? `0${digits.slice(2)}`
    : digits.length === 10 && digits.startsWith("9")
      ? `0${digits}`
      : digits;

  if (/^09\d{9}$/.test(local)) {
    return `(${local.slice(0, 4)}) ${local.slice(4, 7)}-${local.slice(7)}`;
  }

  return value || "Mobile number unavailable";
}

function formatCheckInCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (seconds >= 86400) {
    const days = Math.ceil(seconds / 86400);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return `${hours}h`;
  }
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

export default function CustomerBookingDetailPage() {
  const { bookingId = "" } = useParams<{ bookingId: string }>();
  const { token, user, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState<CustomerBookingDetailResponse["booking"] | null>(null);
  const [reason, setReason] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofViewBusy, setProofViewBusy] = useState(false);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofAccessUrl, setProofAccessUrl] = useState("");
  const [error, setError] = useState("");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [vendorTheme, setVendorTheme] = useState<PublicBoardThemeSettings | null>(null);
  const [vendorProfile, setVendorProfile] = useState<PublicVendorProfile | null>(null);
  const [serviceImagePreview, setServiceImagePreview] = useState<{ name: string; imageUrl: string } | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const loadBooking = useCallback(async (options: { showLoading?: boolean } = {}) => {
    if (!token || !bookingId) {
      return;
    }

    if (options.showLoading) {
      setLoading(true);
    }

    try {
      const data = await apiRequest<CustomerBookingDetailResponse>(`/account/bookings/${bookingId}`, { token });
      setBooking(data.booking);
      setError("");
      setResponseStatus(null);
    } catch (loadError) {
      setResponseStatus(loadError instanceof ApiError ? loadError.status : null);
      setError(getErrorMessage(loadError));
    } finally {
      if (options.showLoading) {
        setLoading(false);
      }
    }
  }, [bookingId, token]);

  useEffect(() => {
    let active = true;

    if (!token || !bookingId) {
      return undefined;
    }

    setLoading(true);
    loadBooking({ showLoading: false }).finally(() => {
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [bookingId, loadBooking, token]);

  useEffect(() => {
    if (!token || !booking?.tenantSlug || !booking.locationSlug) {
      return undefined;
    }

    const streamUrl = `${API_BASE_URL}/public/tenant/${booking.tenantSlug}/location/${booking.locationSlug}/stream`;
    const eventSource = new EventSource(streamUrl);
    eventSource.onmessage = () => {
      void loadBooking();
    };
    eventSource.onerror = () => {
      eventSource.close();
    };

    const intervalId = window.setInterval(() => {
      void loadBooking();
    }, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadBooking();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      eventSource.close();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [booking?.locationSlug, booking?.tenantSlug, loadBooking, token]);

  useEffect(() => {
    if (!booking?.tenantSlug) {
      setVendorTheme(null);
      setVendorProfile(null);
      return undefined;
    }

    const controller = new AbortController();
    apiRequest<PublicVendorProfileResponse>(`/public/vendors/${booking.tenantSlug}`, { signal: controller.signal })
      .then((data) => {
        setVendorTheme(data.vendor.publicBoardTheme?.theme || null);
        setVendorProfile(data.vendor);
      })
      .catch((themeError) => {
        if (!controller.signal.aborted) {
          setVendorTheme(null);
          setVendorProfile(null);
          console.error(themeError);
        }
      });

    return () => controller.abort();
  }, [booking?.tenantSlug]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  if (authLoading || loading) {
    return <Card className="finazze-auth-card">Loading booking...</Card>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function handleCancel(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!token || !booking) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = await apiRequest<CancelCustomerBookingResponse, { reason?: string }>(
        `/account/bookings/${booking.id}`,
        {
          method: "DELETE",
          token,
          body: { reason }
        }
      );
      setBooking(data.booking);
      setReason("");
      setCancelModalOpen(false);
      notifications.show({
        color: "teal",
        title: "Booking cancelled",
        message: `${data.booking.reference} was cancelled.`
      });
    } catch (cancelError) {
      showCustomerError(getErrorMessage(cancelError), "Could not cancel booking");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitPaymentProof() {
    if (!token || !booking) {
      return;
    }

    const trimmedReference = paymentReference.trim();
    if (!trimmedReference) {
      showCustomerError("Payment reference is required.", "Payment reference needed");
      return;
    }

    if (!paymentProofFile) {
      showCustomerError("Payment proof image is required.", "Payment proof needed");
      return;
    }

    setProofBusy(true);
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
      notifications.show({
        color: "teal",
        title: "Payment proof submitted",
        message: `${data.booking.reference} is waiting for vendor verification.`
      });
    } catch (proofError) {
      showCustomerError(getErrorMessage(proofError), "Could not submit payment proof");
    } finally {
      setProofBusy(false);
    }
  }

  async function handleViewPaymentProof() {
    if (!token || !booking?.paymentProof) {
      return;
    }

    setProofViewBusy(true);
    setError("");
    try {
      const data = await apiRequest<BookingPaymentProofAccessResponse>(
        `/account/bookings/${booking.id}/payment-proof`,
        { token }
      );
      setProofAccessUrl(data.access.url);
      setProofModalOpen(true);
    } catch (viewError) {
      showCustomerError(getErrorMessage(viewError), "Could not open payment proof");
    } finally {
      setProofViewBusy(false);
    }
  }

  if (!booking) {
    return (
      <ResourceErrorState
        backLabel="Back to booking list"
        backTo="/account/bookings"
        error={error}
        onRetry={() => void loadBooking({ showLoading: true })}
        resourceName="booking"
        status={responseStatus}
      />
    );
  }

  const groupFundedCampaign = booking.groupFundedCampaign;
  const isGroupFundedBooking = booking.bookingPaymentSource === "group_funded" || Boolean(booking.groupFundedBookingId || groupFundedCampaign);
  const campaignTitle = groupFundedCampaign?.campaignTitle || "Group-funded campaign";
  const campaignPath = groupFundedCampaign?.publicToken ? `/group-funded/${groupFundedCampaign.publicToken}` : "";
  const cancellationAllowed = canCancel(booking.status, booking.checkedInAt, booking.linkedTicket);
  const proofSubmissionAllowed = canSubmitPaymentProof(
    booking.status,
    booking.checkedInAt,
    booking.linkedTicket,
    Boolean(booking.paymentProof),
    booking.serviceManualPaymentRequired && !isGroupFundedBooking
  );
  const paymentProofStatus =
    booking.paymentVerifiedAt
      ? { color: "teal" as const, label: "Payment verified" }
      : booking.paymentRejectedAt
        ? { color: "red" as const, label: "Payment rejected" }
        : { color: "yellow" as const, label: "Awaiting vendor verification" };
  const hasExpired = Boolean(booking.expiredAt);
  const manualPaymentDestination = booking.manualPaymentDestination;
  const linkedQueuePath = booking.linkedTicket
    ? buildJoinedQueuePathWithTicket(
      booking.tenantSlug,
      booking.linkedTicket.lookupCode,
      booking.locationSlug
    )
    : "";
  const fundingAdjustmentCents = Math.max(0, Number(groupFundedCampaign?.roundingAdjustmentCents || 0));
  const fundingTargetAmountCents = Number(groupFundedCampaign?.targetAmountCents || 0) + fundingAdjustmentCents;
  const campaignProgress = fundingTargetAmountCents
    ? Math.min(100, Math.round(((groupFundedCampaign?.fundedAmountCents || 0) / fundingTargetAmountCents) * 100))
    : 0;
  const campaignContributions = (groupFundedCampaign?.contributions || []).filter(
    (contribution) => contribution.contributionStatus === "verified"
  );
  const bookingBundleItems = groupFundedCampaign?.bundleItems?.length
    ? groupFundedCampaign.bundleItems
    : booking.bundleItems?.length
      ? booking.bundleItems
      : [];
  const bookingServiceItems = bookingBundleItems.length
    ? bookingBundleItems
    : [{
        serviceName: booking.serviceName,
        bookingQuantity: booking.bookingQuantity,
        scheduledStartAt: booking.scheduledStartAt,
        scheduledEndAt: booking.scheduledEndAt,
        serviceSlug: booking.serviceSlug,
        priceAmountCents: Number(booking.servicePriceAmountCents || 0) * Number(booking.bookingQuantity || 1),
        currency: booking.serviceCurrency
      }];
  const bookingServiceItemsWithImages = bookingServiceItems.map((item) => ({
    ...item,
    imageUrl: vendorProfile?.services.find((service) => service.slug === item.serviceSlug)?.imageUrl || ""
  }));
  const bookingServiceModeLabel = "Bundled services";
  const bookingStartTimestamp = Math.min(...bookingServiceItems.map((item) => toTimestamp(item.scheduledStartAt)).filter(Number.isFinite));
  const bookingEndTimestamp = Math.max(...bookingServiceItems.map((item) => toTimestamp(item.scheduledEndAt)).filter(Number.isFinite));
  const bookingStart = Number.isFinite(bookingStartTimestamp) ? new Date(bookingStartTimestamp) : booking.scheduledStartAt;
  const bookingEnd = Number.isFinite(bookingEndTimestamp) ? new Date(bookingEndTimestamp) : booking.scheduledEndAt;
  const checkInWindowStartsAt = Number.isFinite(bookingStartTimestamp) ? bookingStartTimestamp - (15 * 60 * 1000) : Number.NaN;
  const checkInWindowEndsAt = Number.isFinite(bookingStartTimestamp) ? bookingStartTimestamp + (15 * 60 * 1000) : Number.NaN;
  const isBeforeCheckInWindow = Number.isFinite(checkInWindowStartsAt) && currentTime < checkInWindowStartsAt;
  const isInsideCheckInWindow = Number.isFinite(checkInWindowStartsAt) && currentTime >= checkInWindowStartsAt && currentTime <= checkInWindowEndsAt;
  const checkInAvailable = Boolean(booking.linkedTicket) && isInsideCheckInWindow;
  const checkInActionLabel = isBeforeCheckInWindow
    ? `Check-in available in ${formatCheckInCountdown(checkInWindowStartsAt - currentTime)}`
    : isInsideCheckInWindow
      ? "Check-in"
      : "Check-in unavailable";
  const totalBookingHoursLabel = formatDurationLabel(bookingStart, bookingEnd);
  const bookingTotalFeeCents = groupFundedCampaign
    ? fundingTargetAmountCents
    : bookingServiceItems.reduce((total, item) => total + Number(item.priceAmountCents || 0), 0);
  const bookingTotalFeeDisplay = formatPaymentAmount(
    bookingTotalFeeCents,
    groupFundedCampaign?.currency || booking.serviceCurrency
  );
  const bookingTicketLabel = booking.reference;
  const bookingTicketStatus = hasExpired ? "expired" : booking.status;
  const primaryCheckInAction = checkInAvailable ? (
    <Button className="vendor-theme-button booking-detail-primary-action" component={Link} leftSection={<IconTicket size={18} />} size="lg" to={linkedQueuePath}>
      {checkInActionLabel}
    </Button>
  ) : (
    <Button className="booking-detail-primary-action" disabled leftSection={<IconTicket size={18} />} size="lg" variant="filled">
      {checkInActionLabel}
    </Button>
  );
  const themeStyle = buildVendorThemeStyle(vendorTheme);
  const themedMediaStyle = buildVendorThemeMediaStyle(vendorTheme);

  return (
    <Stack className="vendor-profile-page" gap="xl" style={themeStyle}>
      <Container size="xl" w="100%">
        <Button className="ticket-page-back-button" component={Link} leftSection={<IconArrowLeft size={18} />} mb="md" to="/account/bookings" variant="subtle" w="fit-content">
          Back to booking list
        </Button>

          {hasExpired ? (
            <Alert color="orange" variant="light">
              {booking.expirationReason || "This pending booking expired before vendor confirmation or payment evidence submission."}
            </Alert>
          ) : null}

        <Paper className="vendor-hero-shell ticket-page-hero booking-detail-page-hero" p={{ base: "lg", md: "xl" }}>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: "xl", lg: 48 }}>
            <Stack className="booking-detail-info-panel" gap="lg" justify="flex-start">
              <div>
                <Title className="vendor-hero-title ticket-page-title" order={1}>
                  {booking.reference}
                </Title>
                <Group gap="sm" wrap="wrap">
                  <Badge className="vendor-theme-badge vendor-theme-badge-primary" size="lg" variant="light">
                    BOOKING DETAIL
                  </Badge>
                  {isGroupFundedBooking ? (
                    <Badge className="vendor-theme-badge vendor-theme-badge-secondary" size="lg" variant="light">
                      GROUP-FUNDED
                    </Badge>
                  ) : null}
                  <Badge color={getBookingBadgeColor(hasExpired ? "canceled" : booking.status)} size="lg" variant="light">
                    {(hasExpired ? "expired" : booking.status).toUpperCase()}
                  </Badge>
                </Group>
              </div>

              <Paper className="booking-detail-services-card" p="md">
                <Stack gap="sm">
                  <Text className="finazze-section-label">{bookingServiceModeLabel}</Text>
                  {bookingServiceItemsWithImages.map((item, index) => (
                    <Paper className="group-funded-bundle-item" key={`${item.serviceName}-${index}`} p="sm">
                      <Group align="center" gap="sm" wrap="nowrap">
                        {item.imageUrl ? (
                          <button
                            aria-label={`Preview ${item.serviceName} image`}
                            className="group-funded-bundle-thumbnail"
                            onClick={() => setServiceImagePreview({ name: item.serviceName, imageUrl: item.imageUrl })}
                            type="button"
                          >
                            <img alt="" src={item.imageUrl} />
                            <span aria-hidden="true"><IconEye size={16} /></span>
                          </button>
                        ) : null}
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Group justify="space-between" gap="sm" wrap="nowrap">
                            <Text fw={800}>{item.serviceName}</Text>
                            <Badge variant="light">x{item.bookingQuantity}</Badge>
                          </Group>
                          <Text c="dimmed" size="sm">
                            {formatBookingScheduleTimeRange(item.scheduledStartAt, item.scheduledEndAt)} · {formatPaymentAmount(item.priceAmountCents, item.currency)}
                          </Text>
                        </Stack>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </Paper>

              {booking.status === "confirmed" || booking.status === "rescheduled" ? (
                <Alert className="booking-detail-checkin-notice" color="blue" icon={<IconAlertCircle size={18} />} variant="light">
                  Arrive near your scheduled time. A queue ticket appears here only after vendor check-in.
                </Alert>
              ) : null}

              <Stack className="booking-detail-meta" gap="sm">
                <Group gap={8} wrap="wrap">
                  <IconBuildingStore className="booking-detail-meta-icon" size={18} />
                  <Text component={Link} fw={700} to={`/vendors/${booking.tenantSlug}?location=${encodeURIComponent(booking.locationSlug)}`} td="underline">
                    {booking.tenantName}
                  </Text>
                  <Text c="dimmed">•</Text>
                  <Text>{booking.locationName}</Text>
                </Group>
                <Group gap={8} wrap="wrap">
                  <IconCalendar className="booking-detail-meta-icon" size={18} />
                  <Text>{formatBookingScheduleDate(bookingStart)} · {formatDisplayTime(bookingStart).toLowerCase()} - {formatDisplayTime(bookingEnd).toLowerCase()} · {totalBookingHoursLabel}</Text>
                </Group>
                <Group gap={8} wrap="nowrap">
                  <IconReceipt className="booking-detail-meta-icon" size={18} />
                  <Text>Total fee <Text component="span" fw={800}>{bookingTotalFeeDisplay}</Text></Text>
                </Group>
              </Stack>

            </Stack>

            <Paper className="booking-detail-visual-card" style={themedMediaStyle}>
              {vendorTheme?.logoUrl ? (
                <div className="booking-detail-logo-frame">
                  <img alt={`${booking.tenantName} logo`} src={vendorTheme.logoUrl} />
                </div>
              ) : (
                <div className="booking-detail-logo-frame booking-detail-logo-placeholder">
                  <IconReceipt size={56} stroke={1.5} />
                </div>
              )}

              <div className="booking-detail-visual-content">
                <Stack align="center" gap={6}>
                  <Title className="booking-detail-ticket-number" order={2}>{bookingTicketLabel}</Title>
                  <Group gap="xs" justify="center" wrap="wrap">
                    <Badge color={getBookingBadgeColor(hasExpired ? "canceled" : booking.status)} size="lg" variant="light">
                      {bookingTicketStatus.toUpperCase()}
                    </Badge>
                    {campaignPath ? (
                      <Badge
                        className="booking-detail-campaign-chip"
                        color="gray"
                        size="lg"
                        title={`CAMPAIGN: ${campaignTitle}`}
                        variant="light"
                      >
                        CAMPAIGN: {campaignTitle}
                      </Badge>
                    ) : null}
                  </Group>
                </Stack>
                <SimpleGrid cols={{ base: 1, sm: 3 }} mt="lg" spacing="sm">
                  <div className="booking-detail-visual-tile">
                    <Text size="xs">Bundled services</Text>
                    <Text><strong>{totalBookingHoursLabel}</strong> · {bookingServiceItems.length} service{bookingServiceItems.length === 1 ? "" : "s"}</Text>
                    <Text size="sm">Total fee <strong>{bookingTotalFeeDisplay}</strong></Text>
                  </div>
                  <div className="booking-detail-visual-tile">
                    <Text size="xs">Booking schedule</Text>
                    <Text fw={800}>{formatBookingScheduleDate(bookingStart)}</Text>
                    <Text size="sm">{formatDisplayTime(bookingStart)} - {formatDisplayTime(bookingEnd)}</Text>
                  </div>
                  <div className="booking-detail-visual-tile">
                    <Text size="xs">Customer</Text>
                    <Text fw={800}>{user.displayName || user.name}</Text>
                    <Text size="sm">{formatPhilippineMobileNumber(user.phone)}</Text>
                  </div>
                </SimpleGrid>
                <Stack className="booking-detail-visual-action" gap="sm">
                  {primaryCheckInAction}
                  {campaignPath ? (
                    <Button
                      className="vendor-theme-button booking-detail-campaign-action"
                      component={Link}
                      leftSection={<IconExternalLink size={18} />}
                      size="lg"
                      to={campaignPath}
                      variant="filled"
                    >
                      View campaign
                    </Button>
                  ) : null}
                  <Button
                    className="booking-detail-cancel-action"
                    color="red"
                    disabled={!cancellationAllowed}
                    leftSection={<IconX size={16} />}
                    onClick={() => setCancelModalOpen(true)}
                    size="lg"
                    variant="subtle"
                  >
                    Cancel booking
                  </Button>
                </Stack>
              </div>
            </Paper>
          </SimpleGrid>
        </Paper>

        <Card className="finazze-auth-card customer-account-card booking-detail-section-card" mt="xl" p="xl">
          <Stack gap="md">

          {groupFundedCampaign ? (
            <Paper className="customer-booking-campaign-card" withBorder radius="lg" p="lg">
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={4}>
                    <Text className="finazze-section-label">Group-funded campaign</Text>
                    <Title order={3}>{groupFundedCampaign.campaignTitle || booking.serviceName}</Title>
                    <Text c="dimmed" size="sm">
                      Organized by {groupFundedCampaign.organizerDisplayName || "the campaign organizer"}
                    </Text>
                  </Stack>
                  <Button
                    component={Link}
                    rightSection={<IconExternalLink size={16} />}
                    to={`/group-funded/${groupFundedCampaign.publicToken}`}
                    variant="light"
                  >
                    View campaign
                  </Button>
                </Group>

                {groupFundedCampaign.description ? (
                  <Spoiler hideLabel="Show less" maxHeight={72} showLabel="Show more">
                    <RichCampaignDescription
                      className="rich-campaign-description"
                      content={groupFundedCampaign.description}
                    />
                  </Spoiler>
                ) : null}

                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                  <Paper className="customer-booking-campaign-stat" radius="md" p="md">
                    <Text c="dimmed" size="sm">Campaign status</Text>
                    <Badge color="blue" mt={6} variant="light">
                      {formatCampaignStatusLabel(groupFundedCampaign.campaignStatus)}
                    </Badge>
                    <Text c="dimmed" mt="xs" size="sm">
                      Confirmed {groupFundedCampaign.confirmedAt ? formatDateTime(groupFundedCampaign.confirmedAt) : "by vendor"}
                    </Text>
                  </Paper>
                  <Paper className="customer-booking-campaign-stat" radius="md" p="md">
                    <Text c="dimmed" size="sm">Funding</Text>
                    <Text fw={800}>
                      {formatPaymentAmount(groupFundedCampaign.fundedAmountCents, groupFundedCampaign.currency)} /{" "}
                      {formatPaymentAmount(fundingTargetAmountCents, groupFundedCampaign.currency)}
                    </Text>
                    <Text c="dimmed" size="sm">{campaignProgress}% funded</Text>
                  </Paper>
                  <Paper className="customer-booking-campaign-stat" radius="md" p="md">
                    <Text c="dimmed" size="sm">Contributors</Text>
                    <Text fw={800}>
                      {groupFundedCampaign.paidParticipantCount} of {groupFundedCampaign.requiredContributors}
                    </Text>
                    <Text c="dimmed" size="sm">
                      {formatPaymentAmount(groupFundedCampaign.requiredContributionAmountCents, groupFundedCampaign.currency)} each
                    </Text>
                  </Paper>
                </SimpleGrid>
                {campaignContributions.length ? (
                  <Accordion className="customer-booking-contributors" variant="contained">
                    <Accordion.Item value="contributors">
                      <Accordion.Control>
                        <Group justify="space-between" pr="sm">
                          <Text fw={800}>Contributors</Text>
                          <Badge color="teal" variant="light">
                            {campaignContributions.length} verified
                          </Badge>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                          {campaignContributions.map((contribution) => (
                            <Paper className="customer-booking-campaign-stat" key={contribution.id} radius="md" p="md">
                              <Stack gap={4}>
                                <Group justify="space-between" gap="sm" wrap="nowrap">
                                  <Text fw={800}>{contribution.contributorDisplayName || "Contributor"}</Text>
                                  <Badge color={getContributionBadgeColor(contribution.contributionStatus)} variant="light">
                                    {contribution.contributionStatus.replace(/_/g, " ")}
                                  </Badge>
                                </Group>
                                <Text c="dimmed" size="sm">
                                  {formatPaymentAmount(contribution.amountCents, contribution.currency)}
                                </Text>
                                <Text c="dimmed" size="xs">
                                  {contribution.verifiedAt
                                    ? `Verified ${formatDateTime(contribution.verifiedAt)}`
                                    : contribution.submittedAt
                                      ? `Submitted ${formatDateTime(contribution.submittedAt)}`
                                      : "Contribution recorded"}
                                </Text>
                              </Stack>
                            </Paper>
                          ))}
                        </SimpleGrid>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                ) : null}
              </Stack>
            </Paper>
          ) : null}

          {!isGroupFundedBooking ? <div className="customer-booking-payment-section">
            <Stack gap="md">
              <div>
                <Text className="finazze-section-label">YOUR PAYMENT</Text>
                <Title order={2}>Payment proof</Title>
              </div>
              {booking.paymentProof ? (
                <Stack className="customer-booking-payment-summary" gap="sm">
                  <>
                    <Group align="flex-start" gap="sm" wrap="nowrap">
                      <ThemeIcon color={paymentProofStatus.color} radius="xl" size={48} variant="filled">
                        <IconCircleCheck size={24} />
                      </ThemeIcon>
                      <Stack gap={2} style={{ flex: 1 }}>
                        <Text fw={800}>{paymentProofStatus.label}</Text>
                        <Text c="dimmed" size="sm">Your payment proof is private and available only to you and authorized vendor users.</Text>
                      </Stack>
                    </Group>
                    <Badge color={paymentProofStatus.color} variant="light" w="fit-content">
                      {paymentProofStatus.label}
                    </Badge>
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Payment reference</Text>
                      <Text fw={700}>{booking.paymentReference || "Not provided"}</Text>
                    </Stack>
                    <Stack gap={2}>
                      <Text c="dimmed" size="xs">Uploaded proof</Text>
                      <Text fw={700}>{booking.paymentProof.fileName}</Text>
                    </Stack>
                    <Button
                      leftSection={<IconEye size={16} />}
                      loading={proofViewBusy}
                      onClick={handleViewPaymentProof}
                      size="lg"
                      className="customer-booking-payment-view-button"
                      variant="light"
                      w="100%"
                    >
                      View payment proof
                    </Button>
                  </>
                </Stack>
              ) : (
                <Stack gap="sm">
                  <Alert color="blue" variant="light">Submit your vendor payment receipt once the transfer is complete.</Alert>
                  <Button
                    disabled={!proofSubmissionAllowed}
                    leftSection={<IconUpload size={16} />}
                    onClick={() => document.getElementById("payment-proof-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    size="lg"
                    variant="light"
                    w="100%"
                  >
                    Submit payment proof
                  </Button>
                </Stack>
              )}
            </Stack>
          </div> : null}

          {booking.linkedTicket ? (
            <Card withBorder radius="md" p="md">
              <Group justify="space-between" align="center">
                <Stack gap={2}>
                  <Text fw={700}>Linked queue ticket</Text>
                  <Text c="dimmed">{booking.linkedTicket.ticketNumber}</Text>
                </Stack>
                <Button
                  component={Link}
                  leftSection={<IconTicket size={16} />}
                  to={linkedQueuePath}
                  variant="light"
                >
                  Open live queue status
                </Button>
              </Group>
            </Card>
          ) : null}
        </Stack>
      </Card>

      {!isGroupFundedBooking && !booking.paymentProof && proofSubmissionAllowed ? (
        <Card className="finazze-auth-card customer-account-card" id="payment-proof-section" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">YOUR PAYMENT</Text>
            <Title order={2}>Submit manual payment evidence</Title>
          </div>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" verticalSpacing="lg">
              <Card withBorder radius="md" p="md">
                {manualPaymentDestination ? (
                  <Stack gap="md">
                    {manualPaymentDestination.methodLabel === "Bank Transfer" ? (
                      <Stack align="center" gap="sm" justify="center" mih={220}>
                        <ThemeIcon color="blue" radius="xl" size={84} variant="light"><IconBuildingBank size={44} /></ThemeIcon>
                        <Text fw={700}>Bank transfer</Text>
                      </Stack>
                    ) : <Image alt={`${manualPaymentDestination.methodLabel} payment QR`} fit="contain" mah={320} radius="sm" src={manualPaymentDestination.qrImageUrl} w="100%" />}
                    <Stack gap={4}>
                      <Badge color="yellow" variant="light" w="fit-content">{manualPaymentDestination.methodLabel === "Bank Transfer" ? "Vendor bank details" : "Vendor payment QR"}</Badge>
                      <Text fw={700}>Pay vendor through {manualPaymentDestination.methodLabel}</Text>
                      {manualPaymentDestination.bankName ? <Text c="dimmed" size="sm">{manualPaymentDestination.bankName}</Text> : null}
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
                  </Stack>
                ) : (
                  <Alert color="yellow" variant="light">
                    The vendor payment QR is not available for this booking yet. Contact the vendor before sending payment.
                  </Alert>
                )}
              </Card>

              <Stack gap="sm">
                <Alert color="blue" variant="light">
                  Upload a screenshot or photo of your vendor payment receipt. The proof stays private and is only available to you and authorized vendor users.
                </Alert>
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
                  disabled={!paymentReference.trim() || !paymentProofFile}
                  loading={proofBusy}
                  onClick={handleSubmitPaymentProof}
                  size="lg"
                >
                  Submit payment proof
                </Button>
              </Stack>
            </SimpleGrid>
        </Stack>
        </Card>
      ) : null}

      <Modal
        centered
        className="customer-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
        onClose={() => setServiceImagePreview(null)}
        opened={Boolean(serviceImagePreview)}
        radius="lg"
        size="xl"
        title={serviceImagePreview?.name || "Service image"}
      >
        {serviceImagePreview ? <div className="service-image-preview-shell"><img alt={serviceImagePreview.name} src={serviceImagePreview.imageUrl} /></div> : null}
      </Modal>

      <Modal
        centered
        className="customer-modal payment-proof-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
        onClose={() => setProofModalOpen(false)}
        opened={proofModalOpen}
        size="lg"
        title="Payment proof"
      >
        {booking.paymentProof ? (
          <div className="payment-proof-modal-shell">
          <ScrollArea
            className="payment-proof-modal-main"
            scrollbarSize={8}
            styles={{ root: { flex: 1, minHeight: 0 }, viewport: { height: "100%" } }}
            type="hover"
          >
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Paper withBorder radius="md" p="md">
                <Text className="finazze-section-label">File</Text>
                <Text fw={700}>{booking.paymentProof.fileName}</Text>
                <Text c="dimmed" size="sm">{formatBytes(booking.paymentProof.sizeBytes)}</Text>
                <Text c="dimmed" size="sm">
                  {booking.paymentProof.uploadedAt ? formatDateTime(booking.paymentProof.uploadedAt) : "Upload time unavailable"}
                </Text>
              </Paper>
              <Paper withBorder radius="md" p="md">
                <Text className="finazze-section-label">Status</Text>
                <Badge color={paymentProofStatus.color} variant="light" w="fit-content">
                  {paymentProofStatus.label}
                </Badge>
                <Text c="dimmed" mt="xs" size="sm">
                  Reference: {booking.paymentReference || "No reference"}
                </Text>
              </Paper>
            </SimpleGrid>
            {booking.paymentRejectedAt && booking.paymentRejectionReason ? (
              <Alert color="red" variant="light">
                {booking.paymentRejectionReason}
              </Alert>
            ) : null}
            {proofAccessUrl ? (
              <Image alt="Uploaded payment proof" fit="contain" mah={520} radius="md" src={proofAccessUrl} />
            ) : (
              <Alert color="gray" variant="light">Open the proof again to refresh the private image link.</Alert>
            )}
          </Stack>
          </ScrollArea>
          {proofAccessUrl ? (
            <Group className="customer-modal-actions payment-proof-modal-actions" justify="flex-end">
              <Button
                component="a"
                href={proofAccessUrl}
                leftSection={<IconExternalLink size={16} />}
                rel="noopener noreferrer"
                size="lg"
                target="_blank"
                variant="light"
              >
                Open image in new tab
              </Button>
            </Group>
          ) : null}
          </div>
        ) : (
          <Alert color="gray" variant="light">No payment proof has been uploaded for this booking.</Alert>
        )}
      </Modal>

      <Modal
        centered
        className="customer-modal"
        transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}
        onClose={() => setCancelModalOpen(false)}
        opened={cancelModalOpen}
        size="md"
        title="Cancel booking"
      >
        <form onSubmit={handleCancel}>
          <Stack gap="md">
            <Alert color="red" variant="light">
              This will cancel the booking immediately. You will need to make a new booking if you still want the service.
            </Alert>
            <Textarea
              label="Cancellation reason"
              minRows={4}
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Tell the vendor why you are cancelling"
              value={reason}
            />
            <Group className="customer-modal-actions" justify="flex-end">
              <Button color="red" loading={busy} size="lg" type="submit">
                Cancel booking
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      </Container>
    </Stack>
  );
}
