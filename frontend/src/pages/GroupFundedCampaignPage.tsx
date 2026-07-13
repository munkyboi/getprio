import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  FileInput,
  Group,
  Image,
  Modal,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core";
import { IconArrowLeft, IconBuildingStore, IconCalendar, IconClock, IconCopy, IconEdit, IconFlag, IconReceipt, IconUpload, IconUsersGroup } from "@tabler/icons-react";
import { Link, useLocation, useParams } from "react-router-dom";
import type {
  BookingPaymentProofUploadResponse,
  GroupFundedBundleItemSummary,
  GroupFundedCampaignResponse,
  GroupFundedCampaignSummary,
  PublicBoardThemeSettings,
  PublicVendorProfileResponse
} from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";
import { buildVendorThemeMediaStyle, buildVendorThemeStyle } from "../utils/vendorTheme";

function formatPaymentAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

function getCampaignBadgeColor(status: GroupFundedCampaignSummary["campaignStatus"]) {
  switch (status) {
    case "funding":
      return "yellow";
    case "funded":
    case "vendor_review":
    case "replacement_proposed":
      return "blue";
    case "confirmed":
      return "teal";
    case "organizer_canceled":
    case "funding_failed":
    case "vendor_rejected":
    case "vendor_review_expired":
    case "vendor_canceled":
      return "red";
    default:
      return "gray";
  }
}

function getCampaignStatusLabel(status: GroupFundedCampaignSummary["campaignStatus"]) {
  switch (status) {
    case "funding":
      return "Funding";
    case "funded":
      return "Fully funded";
    case "vendor_review":
      return "Waiting for vendor verification";
    case "replacement_proposed":
      return "Replacement slot proposed";
    case "confirmed":
      return "Confirmed booking";
    case "organizer_canceled":
      return "Canceled by organizer";
    case "funding_failed":
      return "Funding failed";
    case "vendor_rejected":
      return "Rejected by vendor";
    case "vendor_review_expired":
      return "Vendor review expired";
    case "vendor_canceled":
      return "Canceled by vendor";
    default:
      return status.replace(/_/g, " ");
  }
}

function getContributionBadgeColor(status: NonNullable<GroupFundedCampaignResponse["campaign"]["contribution"]>["contributionStatus"]) {
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

function getContributionStatusLabel(status: NonNullable<GroupFundedCampaignResponse["campaign"]["contribution"]>["contributionStatus"]) {
  switch (status) {
    case "verified":
      return "Verified";
    case "submitted":
      return "Submitted for review";
    case "pending_proof":
      return "Payment proof needed";
    case "rejected":
      return "Rejected by vendor";
    case "refund_pending":
      return "Refund pending";
    case "refunded":
      return "Refunded";
    case "policy_review_required":
      return "Policy review";
    default:
      return "Contribution update";
  }
}

function getSafeBackPath(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return "";
  }

  return value;
}

type RawBundleItem = GroupFundedBundleItemSummary & {
  _id?: string | null;
  serviceNameSnapshot?: string;
  serviceSlugSnapshot?: string;
};

export default function GroupFundedCampaignPage() {
  const { publicToken = "" } = useParams<{ publicToken: string }>();
  const location = useLocation();
  const { token, user, loading: authLoading } = useAuth();
  const [campaign, setCampaign] = useState<GroupFundedCampaignResponse["campaign"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reportingAbuse, setReportingAbuse] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    campaignTitle: "",
    description: "",
    visibility: "private_link" as "private_link" | "public"
  });
  const [vendorTheme, setVendorTheme] = useState<PublicBoardThemeSettings | null>(null);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const loadCampaign = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!publicToken) {
      setError("Campaign not found.");
      setLoading(false);
      return;
    }

    if (!options.silent) {
      setLoading(true);
    }
    setError("");
    try {
      if (token) {
        const data = await customerAccountApi.getGroupFundedCampaignSelf(token, publicToken);
        setCampaign(data.campaign);
      } else {
        const data = await apiRequest<GroupFundedCampaignResponse>(
          `/public/group-funded-campaigns/${encodeURIComponent(publicToken)}`
        );
        setCampaign(data.campaign);
      }
    } catch (loadError) {
      if (token) {
        const data = await apiRequest<GroupFundedCampaignResponse>(
          `/public/group-funded-campaigns/${encodeURIComponent(publicToken)}`
        );
        setCampaign(data.campaign);
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }, [publicToken, token]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  useEffect(() => {
    if (!campaign?.tenantSlug) {
      setVendorTheme(null);
      return undefined;
    }

    const controller = new AbortController();
    apiRequest<PublicVendorProfileResponse>(`/public/vendors/${campaign.tenantSlug}`, { signal: controller.signal })
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
  }, [campaign?.tenantSlug]);

  useEffect(() => {
    if (!publicToken) {
      return undefined;
    }

    const eventSource = new EventSource(
      `${API_BASE_URL}/public/group-funded-campaigns/${encodeURIComponent(publicToken)}/stream`
    );
    eventSource.onmessage = () => {
      if (!submitting) {
        void loadCampaign({ silent: true });
      }
    };
    eventSource.onerror = () => {
      // EventSource reconnects automatically after transient network/server hiccups.
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !submitting) {
        void loadCampaign({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      eventSource.close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadCampaign, publicToken, submitting]);

  const progressValue = useMemo(() => {
    if (!campaign?.targetAmountCents) {
      return 0;
    }
    return Math.min(100, Math.round((campaign.fundedAmountCents / campaign.targetAmountCents) * 100));
  }, [campaign]);
  const contributorReservationSummary = useMemo(() => {
    if (!campaign) {
      return null;
    }
    const verifiedContributorCount = campaign.contributorReservationSummary?.verifiedContributorCount ?? campaign.paidParticipantCount;
    const pendingVerificationContributorCount = campaign.contributorReservationSummary?.pendingVerificationContributorCount ?? 0;
    const filledContributorCount = campaign.contributorReservationSummary?.filledContributorCount
      ?? verifiedContributorCount + pendingVerificationContributorCount;
    return {
      verifiedContributorCount,
      pendingVerificationContributorCount,
      filledContributorCount,
      vacantContributorCount: campaign.contributorReservationSummary?.vacantContributorCount
        ?? Math.max(campaign.requiredContributors - filledContributorCount, 0)
    };
  }, [campaign]);
  const contributorMeterSegments = useMemo(() => {
    if (!campaign || !contributorReservationSummary || campaign.requiredContributors <= 0) {
      return [];
    }
    const circumference = 2 * Math.PI * 42;
    const gapLength = 3;
    const segmentLength = (circumference - gapLength * campaign.requiredContributors) / campaign.requiredContributors;
    const colors = [
      ...Array.from({ length: contributorReservationSummary.verifiedContributorCount }, () => "var(--mantine-color-teal-6)"),
      ...Array.from({ length: contributorReservationSummary.pendingVerificationContributorCount }, () => "var(--mantine-color-blue-6)"),
      ...Array.from({ length: contributorReservationSummary.vacantContributorCount }, () => "var(--mantine-color-gray-5)")
    ];
    return [
      ...colors.map((color, index) => ({
        color,
        dasharray: `${segmentLength} ${circumference - segmentLength}`,
        dashoffset: -index * (segmentLength + gapLength)
      }))
    ];
  }, [campaign, contributorReservationSummary]);
  const bundleItems = useMemo(() => {
    if (!campaign) {
      return [];
    }

    if (campaign.bundleItems?.length) {
      return campaign.bundleItems.map((item) => {
        const rawItem = item as RawBundleItem;
        return {
          id: rawItem.id || rawItem._id || null,
          serviceId: rawItem.serviceId,
          serviceName: rawItem.serviceName || rawItem.serviceNameSnapshot || campaign.serviceName,
          serviceSlug: rawItem.serviceSlug || rawItem.serviceSlugSnapshot || campaign.serviceSlug,
          bookingQuantity: rawItem.bookingQuantity,
          priceAmountCents: rawItem.priceAmountCents,
          currency: rawItem.currency,
          executionMode: rawItem.executionMode,
          scheduledStartAt: rawItem.scheduledStartAt,
          scheduledEndAt: rawItem.scheduledEndAt,
          sortOrder: rawItem.sortOrder
        };
      });
    }

    return [{
      id: null,
      serviceId: campaign.serviceId,
      serviceName: campaign.serviceName,
      serviceSlug: campaign.serviceSlug,
      bookingQuantity: campaign.bookingQuantity,
      priceAmountCents: campaign.targetAmountCents,
      currency: campaign.currency,
      executionMode: "parallel" as const,
      scheduledStartAt: campaign.scheduledStartAt,
      scheduledEndAt: campaign.scheduledEndAt,
      sortOrder: 0
    }];
  }, [campaign]);
  const hasServiceBundle = bundleItems.length > 1;

  const isOrganizer = Boolean(user && campaign?.isOrganizer);
  const contributionCanRetry = campaign?.contribution?.contributionStatus === "rejected";
  const canContribute = campaign?.campaignStatus === "funding" && (!campaign.contribution || contributionCanRetry) && Boolean(contributorReservationSummary?.vacantContributorCount);
  const canCancel = isOrganizer && campaign?.campaignStatus === "funding" && campaign.fundedAmountCents < campaign.targetAmountCents;
  const isCampaignFullyFunded = Boolean(
    campaign &&
    (
      campaign.fundedAmountCents >= campaign.targetAmountCents ||
      campaign.paidParticipantCount >= campaign.requiredContributors ||
      campaign.campaignStatus !== "funding"
    )
  );
  const canEditCampaign = isOrganizer && campaign?.campaignStatus === "funding" && !isCampaignFullyFunded;

  useEffect(() => {
    if (editModalOpen && !canEditCampaign) {
      setEditModalOpen(false);
    }
  }, [canEditCampaign, editModalOpen]);

  function openEditModal() {
    if (!campaign || !canEditCampaign) {
      return;
    }
    setEditForm({
      campaignTitle: campaign.campaignTitle || campaign.serviceName,
      description: campaign.description || "",
      visibility: campaign.visibility
    });
    setEditModalOpen(true);
  }

  async function copyShareLink() {
    if (!shareUrl) {
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    setMessage("Share link copied.");
  }

  async function submitContribution() {
    if (!token || !campaign || !paymentProofFile || !paymentReference.trim()) {
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const uploadResponse = await fetch(
        `${API_BASE_URL}/account/group-funded-campaigns/${encodeURIComponent(campaign.publicToken)}/contributions/payment-proof/uploads/direct?fileName=${encodeURIComponent(paymentProofFile.name)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": paymentProofFile.type || "image/jpeg"
          },
          body: paymentProofFile
        }
      );
      if (!uploadResponse.ok) {
        throw new Error("Contribution proof upload failed. Please try again.");
      }
      const uploadData = await uploadResponse.json() as BookingPaymentProofUploadResponse;

      const data = await customerAccountApi.submitGroupFundedContributionProof(token, campaign.publicToken, {
        paymentReference: paymentReference.trim(),
        paymentProofObjectKey: uploadData.proof.objectKey,
        paymentProofFileName: uploadData.proof.fileName,
        paymentProofContentType: uploadData.proof.contentType,
        paymentProofSizeBytes: uploadData.proof.sizeBytes
      });
      setCampaign(data.campaign);
      setPaymentReference("");
      setPaymentProofFile(null);
      setMessage("Contribution proof submitted for vendor review.");
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelCampaign() {
    if (!token || !campaign) {
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const data = await customerAccountApi.cancelGroupFundedCampaign(token, campaign.publicToken, {
        reason: "organizer_canceled"
      });
      setCampaign(data.campaign);
      setShowCancelConfirm(false);
      setMessage("Campaign canceled. Verified contributions are now refund-eligible.");
    } catch (cancelError) {
      setError(getErrorMessage(cancelError));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveCampaignDetails() {
    if (!token || !campaign) {
      return;
    }

    setEditSubmitting(true);
    setError("");
    setMessage("");
    try {
      const data = await customerAccountApi.updateGroupFundedCampaign(token, campaign.publicToken, {
        campaignTitle: editForm.campaignTitle.trim(),
        description: editForm.description.trim(),
        visibility: editForm.visibility
      });
      setCampaign(data.campaign);
      setEditModalOpen(false);
      setMessage("Campaign details updated.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setEditSubmitting(false);
    }
  }

  async function reportCampaign() {
    if (!campaign) {
      return;
    }

    setReportingAbuse(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/public/group-funded-campaigns/${encodeURIComponent(campaign.publicToken)}/report-abuse`, {
        method: "POST",
        token: token || undefined,
        body: { reason: "reported_from_public_campaign_page" }
      });
      setMessage("Campaign report received.");
    } catch (reportError) {
      setError(getErrorMessage(reportError));
    } finally {
      setReportingAbuse(false);
    }
  }

  if (authLoading || loading) {
    return <Card className="finazze-auth-card">Loading group-funded campaign...</Card>;
  }

  if (!campaign) {
    return <Alert color="red">{error || "Campaign not found."}</Alert>;
  }

  const locationState = location.state as { from?: unknown } | null;
  const backLink = getSafeBackPath(locationState?.from) || (user ? "/account/group-funded" : "/vendors");
  const themeStyle = buildVendorThemeStyle(vendorTheme);
  const themedMediaStyle = buildVendorThemeMediaStyle(vendorTheme);
  const paymentProofForm = canContribute ? (
    <Stack gap="md">
      <Alert color={contributionCanRetry ? "yellow" : "teal"} variant="light">
        {contributionCanRetry
          ? `Upload a replacement proof for exactly ${formatPaymentAmount(campaign.requiredContributionAmountCents, campaign.currency)}. The vendor will review the new proof.`
          : `Please send exactly ${formatPaymentAmount(campaign.requiredContributionAmountCents, campaign.currency)}. For this group booking, we can only accept one payment for the full amount.`}
      </Alert>
      {campaign.paymentDestination ? (
        <Card withBorder padding="md" radius="md">
          <Group align="flex-start" gap="lg" wrap="nowrap">
            <Image
              alt={`${campaign.paymentDestination.methodLabel} payment QR`}
              fit="contain"
              h={156}
              radius="sm"
              src={campaign.paymentDestination.qrImageUrl}
              w={156}
            />
            <Stack gap={4}>
              <Text c="dimmed" size="xs">Payment destination</Text>
              <Text fw={800}>{campaign.paymentDestination.methodLabel}</Text>
              {campaign.paymentDestination.accountDisplayName ? (
                <Text>{campaign.paymentDestination.accountDisplayName}</Text>
              ) : null}
              {campaign.paymentDestination.accountIdentifierDisplay ? (
                <Text c="dimmed" size="sm">{campaign.paymentDestination.accountIdentifierDisplay}</Text>
              ) : null}
              <Text c="dimmed" size="sm">Scan the QR, pay the exact contribution amount, then upload your proof below.</Text>
            </Stack>
          </Group>
        </Card>
      ) : (
        <Alert color="yellow" variant="light">
          Payment instructions are temporarily unavailable. Please contact the vendor before sending payment.
        </Alert>
      )}
      <TextInput
        label="Payment reference"
        onChange={(event) => setPaymentReference(event.currentTarget.value)}
        placeholder="Reference number from your bank or wallet"
        value={paymentReference}
      />
      <FileInput
        accept="image/jpeg,image/png,image/webp,application/pdf"
        clearable
        label="Proof file"
        leftSection={<IconUpload size={16} />}
        onChange={setPaymentProofFile}
        placeholder="Choose JPEG, PNG, WebP, or PDF"
        value={paymentProofFile}
      />
      <Button
        color="dark"
        disabled={!paymentReference.trim() || !paymentProofFile}
        loading={submitting}
        onClick={submitContribution}
        w="fit-content"
      >
        {contributionCanRetry ? "Submit replacement proof" : "Submit contribution proof"}
      </Button>
    </Stack>
  ) : null;

  return (
    <Stack className="vendor-profile-page" gap="xl" style={themeStyle}>
      <Container size="xl" w="100%">
        <Button className="ticket-page-back-button" component={Link} leftSection={<IconArrowLeft size={18} />} mb="md" to={backLink} variant="subtle" w="fit-content">
          Back
        </Button>

          {error ? <Alert color="red">{error}</Alert> : null}
          {message ? <Alert color="teal">{message}</Alert> : null}
          {campaign.contribution?.contributionStatus === "rejected" ? (
            <Alert color="red" variant="light">
              Your contribution proof was rejected and is not counted in the verified funding total.
            </Alert>
          ) : null}

        <Paper className="vendor-hero-shell ticket-page-hero booking-detail-page-hero" p={{ base: "lg", md: "xl" }}>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={{ base: "xl", lg: 48 }}>
            <Stack gap="lg" justify="flex-start">
              <div>
                <Group gap="sm" wrap="wrap">
                  <Badge className="vendor-theme-badge vendor-theme-badge-primary" size="lg" variant="light">
                    Group-funded booking
                  </Badge>
                  <Badge color={getCampaignBadgeColor(campaign.campaignStatus)} size="lg" variant="light">
                    {getCampaignStatusLabel(campaign.campaignStatus)}
                  </Badge>
                </Group>
                <Stack gap={4} mt="md">
                  <Title className="vendor-hero-title ticket-page-title" order={1}>
                    {campaign.campaignTitle || campaign.serviceName}
                  </Title>
                  <Text className="vendor-hero-subtitle" fw={700} size="lg">
                    {hasServiceBundle ? `${bundleItems.length} bundled services` : campaign.serviceName}
                  </Text>
                </Stack>
              </div>

              <Text className="vendor-hero-description">
                {campaign.description ||
                  `${campaign.vendorName || "Vendor"} group-funded booking organized by ${campaign.organizerDisplayName}.`}
              </Text>

              <Stack gap="xs">
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon booking-detail-hero-icon-solid" radius="xl" size={32} variant="light">
                    <IconBuildingStore size={16} />
                  </ThemeIcon>
                  <Text>{[campaign.vendorName, campaign.locationName].filter(Boolean).join(" · ")}</Text>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon booking-detail-hero-icon-solid" radius="xl" size={32} variant="light">
                    <IconCalendar size={16} />
                  </ThemeIcon>
                  <Text>{formatBookingScheduleDate(campaign.scheduledStartAt)}</Text>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon booking-detail-hero-icon-solid" radius="xl" size={32} variant="light">
                    <IconClock size={16} />
                  </ThemeIcon>
                  <Text>{formatBookingScheduleTimeRange(campaign.scheduledStartAt, campaign.scheduledEndAt)}</Text>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon booking-detail-hero-icon-solid" radius="xl" size={32} variant="light">
                    <IconUsersGroup size={16} />
                  </ThemeIcon>
                  <Text>Organized by {campaign.organizerDisplayName}</Text>
                </Group>
              </Stack>

              <Group gap="md">
                <Button className="vendor-theme-button" leftSection={<IconCopy size={18} />} onClick={copyShareLink} size="lg">
                  Copy share link
                </Button>
                {campaign.tenantSlug ? (
                  <Button
                    className="vendor-theme-button vendor-theme-button-ghost"
                    component={Link}
                    leftSection={<IconBuildingStore size={18} />}
                    size="lg"
                    to={`/vendors/${campaign.tenantSlug}`}
                    variant="subtle"
                  >
                    Vendor details
                  </Button>
                ) : null}
              </Group>
            </Stack>

            <Paper className="vendor-hero-visual" p="xl" style={themedMediaStyle}>
              <div className="vendor-hero-media-shell">
                <div className="vendor-hero-media-slide is-active">
                  {vendorTheme?.logoUrl ? (
                    <div className="vendor-profile-logo-frame">
                      <img alt={`${campaign.vendorName || "Vendor"} logo`} src={vendorTheme.logoUrl} />
                    </div>
                  ) : (
                    <div className="ticket-page-placeholder">
                      <IconReceipt size={56} stroke={1.5} />
                      <Text fw={800}>{campaign.serviceName}</Text>
                    </div>
                  )}
                </div>
              </div>

              <Paper className="vendor-hero-status-card" p="lg">
                <Text fw={800}>{getCampaignStatusLabel(campaign.campaignStatus)}</Text>
                <Text c="dimmed" size="sm">
                  Deadline {formatBookingScheduleDate(campaign.fundingDeadlineAt)} · {campaign.visibility === "public" ? "Public on vendor profile" : "Private link only"}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="sm">
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">Funding</Text>
                    <Text fw={800}>{progressValue}%</Text>
                  </div>
                  <div className="prio-dashboard-tile">
                    <Group align="center" gap="sm" wrap="nowrap">
                      <div
                        aria-label={`${contributorReservationSummary?.filledContributorCount} of ${campaign.requiredContributors} contributor positions filled`}
                        className="group-funded-contributor-meter group-funded-contributor-meter--hero"
                        role="img"
                      >
                        <svg aria-hidden="true" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            fill="none"
                            r="42"
                            stroke="var(--mantine-color-gray-3)"
                            strokeWidth="11"
                          />
                          {contributorMeterSegments.map((segment, index) => (
                            <circle
                              cx="50"
                              cy="50"
                              fill="none"
                              key={`${segment.color}-${index}`}
                              r="42"
                              stroke={segment.color}
                              strokeDasharray={segment.dasharray}
                              strokeDashoffset={segment.dashoffset}
                              strokeWidth="11"
                            />
                          ))}
                        </svg>
                        <Text className="group-funded-contributor-meter__label" fw={800} size="xs" ta="center">
                          {contributorReservationSummary?.filledContributorCount}/{campaign.requiredContributors}
                        </Text>
                      </div>
                      <Stack gap={0}>
                        <Text c="dimmed" size="xs">Contributors</Text>
                        <Text fw={800}>{contributorReservationSummary?.filledContributorCount} filled</Text>
                      </Stack>
                    </Group>
                  </div>
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">Target</Text>
                    <Text fw={800}>{formatPaymentAmount(campaign.targetAmountCents, campaign.currency)}</Text>
                  </div>
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">Each</Text>
                    <Text fw={800}>{formatPaymentAmount(campaign.requiredContributionAmountCents, campaign.currency)}</Text>
                  </div>
                </SimpleGrid>
                <Stack gap="xs" mt="md">
                  <Progress value={progressValue} color="teal" />
                  <Text c="dimmed" size="sm">
                    {formatPaymentAmount(campaign.fundedAmountCents, campaign.currency)} / {formatPaymentAmount(campaign.targetAmountCents, campaign.currency)} verified.
                  </Text>
                </Stack>
              </Paper>
            </Paper>
          </SimpleGrid>
        </Paper>

        <Card className="finazze-auth-card customer-account-card booking-detail-section-card" mt="xl" p="xl">
          <Stack gap="md">
            <Card withBorder radius="md" p="md">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Text c="dimmed" size="xs">{hasServiceBundle ? "Bundled services" : "Selected service"}</Text>
                    <Text fw={800}>
                      {hasServiceBundle
                        ? `${bundleItems.length} services in this group booking`
                        : bundleItems[0]?.serviceName || campaign.serviceName}
                    </Text>
                  </Stack>
                  <Badge color="teal" variant="light">
                    {hasServiceBundle ? "Service bundle" : "Single service"}
                  </Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: hasServiceBundle ? 2 : 1 }} spacing="sm">
                  {bundleItems.map((item) => (
                    <Stack className="group-funded-campaign-summary-panel" gap={4} key={item.id || item.serviceSlug}>
                      <Group justify="space-between" gap="sm" wrap="nowrap">
                        <Text fw={800}>{item.serviceName}</Text>
                        <Badge variant="light">
                          x{item.bookingQuantity}
                        </Badge>
                      </Group>
                      <Text c="dimmed" size="sm">
                        {formatBookingScheduleTimeRange(item.scheduledStartAt, item.scheduledEndAt)}
                      </Text>
                      <Text c="dimmed" size="sm">
                        {formatPaymentAmount(item.priceAmountCents, item.currency)}
                      </Text>
                    </Stack>
                  ))}
                </SimpleGrid>
              </Stack>
            </Card>

            <Alert color="yellow" variant="light">
              This slot is not reserved until the campaign is fully funded and approved by the vendor.
            </Alert>

            <Group gap="sm">
              <Button leftSection={<IconCopy size={16} />} onClick={copyShareLink} variant="light">
                Copy share link
              </Button>
              <Button color="red" leftSection={<IconFlag size={16} />} loading={reportingAbuse} onClick={reportCampaign} variant="subtle">
                Report
              </Button>
              {isOrganizer && campaign.linkedBookingId ? (
                <Button component={Link} color="dark" to={`/account/bookings/${campaign.linkedBookingId}`}>
                  View confirmed booking
                </Button>
              ) : null}
            </Group>
          </Stack>
        </Card>

      <Card className="finazze-auth-card customer-account-card" mt="xl" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">Your contribution</Text>
            <Title order={2}>Payment proof</Title>
          </div>
          {!token ? (
            <Alert color="blue" variant="light">
              Guests can view this private-link campaign, but login or customer registration is required before submitting a contribution.
            </Alert>
          ) : campaign.contribution ? (
            <Stack gap="sm">
              <Badge color={getContributionBadgeColor(campaign.contribution.contributionStatus)} variant="light" w="fit-content">
                {getContributionStatusLabel(campaign.contribution.contributionStatus)}
              </Badge>
              {campaign.contribution.contributionStatus === "rejected" ? (
                <>
                  <Alert color="red" variant="light">
                    <Stack gap={4}>
                      <Text fw={700}>Your contribution proof was rejected and is not counted toward this campaign.</Text>
                      <Text>
                        Reason: {campaign.contribution.rejectionReason || "The vendor did not provide a rejection reason."}
                      </Text>
                    </Stack>
                  </Alert>
                  {paymentProofForm}
                </>
              ) : null}
              {campaign.contribution.contributionStatus === "refund_pending" ? (
                <Alert color="orange" variant="light">
                  <Stack gap={4}>
                    <Text fw={700}>Your contribution cannot be accepted. A refund is pending.</Text>
                    <Text>
                      Reason: {campaign.contribution.rejectionReason || "The vendor is preparing your refund."}
                    </Text>
                  </Stack>
                </Alert>
              ) : null}
              <Text c="dimmed" size="sm">
                Reference {campaign.contribution.paymentReference || "not set"} · Your proof is visible only to you and authorized vendor reviewers.
              </Text>
              {campaign.refunds?.length ? (
                <Alert color="yellow" variant="light">
                  Refund state: {campaign.refunds.map((refund) => refund.refundStatus.replace(/_/g, " ")).join(", ")}
                </Alert>
              ) : null}
            </Stack>
          ) : canContribute ? (
            paymentProofForm
          ) : campaign.campaignStatus === "funding" && contributorReservationSummary?.vacantContributorCount === 0 ? (
            <Alert color="blue" variant="light">
              All contributor positions are temporarily reserved. Please check back if the vendor rejects a pending proof.
            </Alert>
          ) : (
            <Text c="dimmed">This campaign is no longer accepting contributions.</Text>
          )}
        </Stack>
      </Card>

      {isOrganizer && (canEditCampaign || canCancel || isCampaignFullyFunded) ? (
        <Card className="finazze-auth-card customer-account-card" mt="xl" p="xl">
          <Stack gap="md">
            <div>
              <Text className="finazze-section-label">Organizer controls</Text>
              <Title order={2}>Manage campaign</Title>
            </div>
            {isOrganizer ? (
              <Button
                disabled={!canEditCampaign}
                leftSection={<IconEdit size={16} />}
                onClick={openEditModal}
                variant="light"
                w="fit-content"
              >
                Edit campaign details
              </Button>
            ) : null}
            {isCampaignFullyFunded ? (
              <Text c="dimmed" size="sm">
                Campaign details are locked once funding is complete.
              </Text>
            ) : null}
            {showCancelConfirm ? (
              <Alert color="red" variant="light">
                <Stack gap="sm">
                  <Text>
                    Canceling closes this campaign permanently. Any verified contributions become refund-eligible and the campaign cannot be reopened.
                  </Text>
                  <Group>
                    <Button onClick={() => setShowCancelConfirm(false)} variant="light">
                      Keep campaign open
                    </Button>
                    <Button color="red" loading={submitting} onClick={cancelCampaign}>
                      Cancel and start refunds
                    </Button>
                  </Group>
                </Stack>
              </Alert>
            ) : (
              canCancel ? (
                <Button color="red" onClick={() => setShowCancelConfirm(true)} variant="light" w="fit-content">
                  Cancel campaign
                </Button>
              ) : null
            )}
          </Stack>
        </Card>
      ) : null}
      </Container>

      <Modal
        centered
        onClose={() => setEditModalOpen(false)}
        opened={editModalOpen}
        radius="lg"
        size="lg"
        title="Edit campaign details"
      >
        <Stack gap="md">
          <TextInput
            label="Campaign title"
            maxLength={90}
            onChange={(event) => setEditForm((current) => ({ ...current, campaignTitle: event.currentTarget.value }))}
            required
            value={editForm.campaignTitle}
          />
          <Textarea
            label="Campaign description"
            maxLength={280}
            minRows={4}
            onChange={(event) => setEditForm((current) => ({ ...current, description: event.currentTarget.value }))}
            value={editForm.description}
          />
          <Select
            data={[
              { label: "Private link only", value: "private_link" },
              { label: "Public on vendor profile", value: "public" }
            ]}
            label="Visibility"
            onChange={(value) =>
              setEditForm((current) => ({
                ...current,
                visibility: (value || "private_link") as "private_link" | "public"
              }))
            }
            value={editForm.visibility}
          />
          <Group justify="flex-end">
            <Button onClick={() => setEditModalOpen(false)} variant="light">
              Cancel
            </Button>
            <Button
              color="dark"
              disabled={!editForm.campaignTitle.trim()}
              loading={editSubmitting}
              onClick={saveCampaignDetails}
            >
              Save changes
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
