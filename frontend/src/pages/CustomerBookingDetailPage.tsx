import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Container, FileInput, Group, Image, Modal, Paper, SimpleGrid, Stack, Text, Textarea, TextInput, ThemeIcon, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconBuildingBank, IconBuildingStore, IconCalendar, IconClock, IconExternalLink, IconReceipt, IconTicket, IconUpload, IconX } from "@tabler/icons-react";
import { Link, Navigate, useParams } from "react-router-dom";
import type {
  BookingPaymentProofAccessResponse,
  BookingPaymentProofUploadResponse,
  BookingStatus,
  CancelCustomerBookingResponse,
  CustomerBookingDetailResponse,
  CustomerBookingResponse,
  PublicBoardThemeSettings,
  PublicVendorProfileResponse,
  SubmitBookingPaymentProofRequest
} from "@shared";
import { API_BASE_URL, ApiError, apiRequest } from "../api/client";
import ResourceErrorState from "../components/ResourceErrorState";
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
      return undefined;
    }

    const controller = new AbortController();
    apiRequest<PublicVendorProfileResponse>(`/public/vendors/${booking.tenantSlug}`, { signal: controller.signal })
      .then((data) => {
        setVendorTheme(data.vendor.publicBoardTheme?.theme || null);
      })
      .catch((themeError) => {
        if (!controller.signal.aborted) {
          setVendorTheme(null);
          console.error(themeError);
        }
      });

    return () => controller.abort();
  }, [booking?.tenantSlug]);

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
  const checkInAvailable = Boolean(booking.linkedTicket);
  const paymentProofActionLabel = booking.paymentProof ? "View payment proof" : "Submit payment proof";
  const campaignProgress = groupFundedCampaign?.targetAmountCents
    ? Math.min(100, Math.round((groupFundedCampaign.fundedAmountCents / groupFundedCampaign.targetAmountCents) * 100))
    : 0;
  const campaignContributions = (groupFundedCampaign?.contributions || []).filter(
    (contribution) => contribution.contributionStatus === "verified"
  );
  const bookingBundleItems = groupFundedCampaign?.bundleItems?.length
    ? groupFundedCampaign.bundleItems
    : [];
  const bookingServiceItems = bookingBundleItems.length
    ? bookingBundleItems
    : [{
        serviceName: booking.serviceName,
        bookingQuantity: booking.bookingQuantity,
        scheduledStartAt: booking.scheduledStartAt,
        scheduledEndAt: booking.scheduledEndAt
      }];
  const bookingServiceNames = bookingServiceItems.map((item) => item.serviceName).filter(Boolean);
  const bookingServiceModeLabel = bookingServiceItems.length > 1 ? "Bundled services" : "Single service";
  const totalBookingUnits = bookingServiceItems.reduce((sum, item) => sum + Number(item.bookingQuantity || 0), 0);
  const bookingStartTimestamp = Math.min(...bookingServiceItems.map((item) => toTimestamp(item.scheduledStartAt)).filter(Number.isFinite));
  const bookingEndTimestamp = Math.max(...bookingServiceItems.map((item) => toTimestamp(item.scheduledEndAt)).filter(Number.isFinite));
  const bookingStart = Number.isFinite(bookingStartTimestamp) ? new Date(bookingStartTimestamp) : booking.scheduledStartAt;
  const bookingEnd = Number.isFinite(bookingEndTimestamp) ? new Date(bookingEndTimestamp) : booking.scheduledEndAt;
  const totalBookingHoursLabel = formatDurationLabel(bookingStart, bookingEnd);
  const bookingTotalFeeDisplay = groupFundedCampaign
    ? formatPaymentAmount(groupFundedCampaign.targetAmountCents, groupFundedCampaign.currency)
    : formatPaymentAmount(
      Number(booking.servicePriceAmountCents || 0) * Number(booking.bookingQuantity || 1),
      booking.serviceCurrency
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
            <Stack gap="lg" justify="flex-start">
              <div>
                <Group gap="sm" wrap="wrap">
                  <Badge className="vendor-theme-badge vendor-theme-badge-primary" size="lg" variant="light">
                    Booking detail
                  </Badge>
                  {isGroupFundedBooking ? (
                    <Badge className="vendor-theme-badge vendor-theme-badge-secondary" size="lg" variant="light">
                      Group-funded
                    </Badge>
                  ) : null}
                  <Badge color={getBookingBadgeColor(booking.status)} size="lg" variant="light">
                    {hasExpired ? "expired" : booking.status}
                  </Badge>
                </Group>
                <Stack gap={4} mt="md">
                  <Title className="vendor-hero-title ticket-page-title" order={1}>
                    {booking.reference}
                  </Title>
                  <Text className="vendor-hero-subtitle" fw={700} size="lg">
                    {bookingServiceModeLabel}
                  </Text>
                </Stack>
              </div>

              <Group gap="xs" wrap="wrap">
                {bookingServiceNames.map((serviceName, index) => (
                  <Badge className="vendor-theme-badge vendor-theme-badge-muted" key={`${serviceName}-${index}`} size="lg" variant="light">
                    {serviceName}
                  </Badge>
                ))}
              </Group>

              <Text className="vendor-hero-description">
                {booking.tenantName} at {booking.locationName}. Scheduled {formatBookingScheduleDate(booking.scheduledStartAt)} from{" "}
                {formatBookingScheduleTimeRange(booking.scheduledStartAt, booking.scheduledEndAt)}.
              </Text>

              <Stack gap="xs">
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconBuildingStore size={16} />
                  </ThemeIcon>
                  <Text>{booking.tenantName}</Text>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconCalendar size={16} />
                  </ThemeIcon>
                  <Text>{formatBookingScheduleDate(booking.scheduledStartAt)}</Text>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconReceipt size={16} />
                  </ThemeIcon>
                  <Text>Total fee: {bookingTotalFeeDisplay}</Text>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon" radius="xl" size={32} variant="light">
                    <IconClock size={16} />
                  </ThemeIcon>
                  <Text>{formatBookingScheduleTimeRange(booking.scheduledStartAt, booking.scheduledEndAt)}</Text>
                </Group>
              </Stack>

              <Group className="customer-action-row" gap="md">
                {checkInAvailable ? (
                  <Button className="vendor-theme-button" component={Link} leftSection={<IconTicket size={18} />} size="lg" to={linkedQueuePath}>
                    Check-in
                  </Button>
                ) : (
                  <Button disabled leftSection={<IconTicket size={18} />} size="lg" variant="default">
                    Check-in
                  </Button>
                )}
                {isGroupFundedBooking && groupFundedCampaign ? (
                  <Button
                    className="vendor-theme-button vendor-theme-button-ghost"
                    component={Link}
                    leftSection={<IconReceipt size={18} />}
                    size="lg"
                    to={`/group-funded/${groupFundedCampaign.publicToken}`}
                    variant="subtle"
                  >
                    View campaign
                  </Button>
                ) : null}
              </Group>
            </Stack>

            <Paper className="vendor-hero-visual" p="xl" style={themedMediaStyle}>
              <div className="vendor-hero-media-shell">
                <div className="vendor-hero-media-slide is-active">
                  {vendorTheme?.logoUrl ? (
                    <div className="vendor-profile-logo-frame">
                      <img alt={`${booking.tenantName} logo`} src={vendorTheme.logoUrl} />
                    </div>
                  ) : (
                    <div className="ticket-page-placeholder">
                      <IconReceipt size={56} stroke={1.5} />
                      <Text fw={800}>{booking.serviceName}</Text>
                    </div>
                  )}
                </div>
              </div>

              <Paper className="vendor-hero-status-card" p="lg">
                <Text fw={800}>{booking.tenantName}</Text>
                <Text c="dimmed" size="sm">{booking.locationName}</Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="sm">
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">{bookingServiceModeLabel}</Text>
                    <Text fw={800}>{totalBookingHoursLabel}</Text>
                    <Text c="dimmed" size="sm">
                      {totalBookingUnits} unit{totalBookingUnits === 1 ? "" : "s"}
                    </Text>
                  </div>
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">Booking schedule</Text>
                    <Text fw={800}>{formatBookingScheduleDate(bookingStart)}</Text>
                    <Text c="dimmed" size="sm">
                      {formatDisplayTime(bookingStart)} - {formatDisplayTime(bookingEnd)}
                    </Text>
                  </div>
                </SimpleGrid>
                {isGroupFundedBooking ? (
                  <Text c="dimmed" mt="md" size="sm">Covered by group-funded campaign</Text>
                ) : booking.paymentProof ? (
                  <Text c="dimmed" mt="md" size="sm">{paymentProofStatus.label}</Text>
                ) : null}
              </Paper>
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
                  <Text>{groupFundedCampaign.description}</Text>
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
                      {formatPaymentAmount(groupFundedCampaign.targetAmountCents, groupFundedCampaign.currency)}
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
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Text fw={800}>Contributors</Text>
                      <Badge color="teal" variant="light">
                        {campaignContributions.length} verified
                      </Badge>
                    </Group>
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
                  </Stack>
                ) : null}
              </Stack>
            </Paper>
          ) : null}

          {booking.status === "confirmed" || booking.status === "rescheduled" ? (
            <Alert color="blue" variant="light">
              Arrive near your scheduled time. A queue ticket appears here only after vendor check-in.
            </Alert>
          ) : null}

          <Paper withBorder radius="lg" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text fw={800}>Actions</Text>
                  <Text c="dimmed" size="sm">
                    Check in once the vendor creates your queue ticket, or wait for vendor check-in.
                  </Text>
                </Stack>
                {booking.checkedInAt ? (
                  <Badge color="teal" variant="light">
                    Checked in {formatDateTime(booking.checkedInAt)}
                  </Badge>
                ) : (
                  <Badge color={checkInAvailable ? "blue" : "gray"} variant="light">
                    {checkInAvailable ? "Queue ticket ready" : "Check-in not available"}
                  </Badge>
                )}
              </Group>
              <Group className="customer-action-row" gap="sm">
                {checkInAvailable ? (
                  <Button component={Link} leftSection={<IconTicket size={16} />} to={linkedQueuePath}>
                    Check-in
                  </Button>
                ) : (
                  <Button disabled leftSection={<IconTicket size={16} />} variant="default">
                    Check-in
                  </Button>
                )}
                {isGroupFundedBooking && groupFundedCampaign ? (
                  <Button
                    component={Link}
                    leftSection={<IconReceipt size={16} />}
                    to={`/group-funded/${groupFundedCampaign.publicToken}`}
                    variant="light"
                  >
                    View campaign
                  </Button>
                ) : booking.paymentProof ? (
                  <Button
                    leftSection={<IconReceipt size={16} />}
                    loading={proofViewBusy}
                    onClick={handleViewPaymentProof}
                    variant="light"
                  >
                    {paymentProofActionLabel}
                  </Button>
                ) : proofSubmissionAllowed ? (
                  <Button
                    leftSection={<IconUpload size={16} />}
                    onClick={() => {
                      document.getElementById("payment-proof-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    variant="light"
                  >
                    {paymentProofActionLabel}
                  </Button>
                ) : (
                  <Button disabled leftSection={<IconReceipt size={16} />} variant="light">
                    {paymentProofActionLabel}
                  </Button>
                )}
                <Button
                  color="red"
                  disabled={!cancellationAllowed}
                  leftSection={<IconX size={16} />}
                  onClick={() => setCancelModalOpen(true)}
                  variant="subtle"
                >
                  Cancel booking
                </Button>
              </Group>
            </Stack>
          </Paper>

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

      {!booking.paymentProof && proofSubmissionAllowed ? (
        <Card className="finazze-auth-card customer-account-card" id="payment-proof-section" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">Payment proof</Text>
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
        onClose={() => setProofModalOpen(false)}
        opened={proofModalOpen}
        size="lg"
        title="Payment proof"
      >
        {booking.paymentProof ? (
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
            {proofAccessUrl ? (
              <Button
                component="a"
                href={proofAccessUrl}
                leftSection={<IconExternalLink size={16} />}
                rel="noopener noreferrer"
                target="_blank"
                variant="light"
                w="fit-content"
              >
                Open image in new tab
              </Button>
            ) : null}
          </Stack>
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
