import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  FileInput,
  Group,
  Modal,
  Progress,
  RingProgress,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title
} from "@mantine/core";
import { IconArrowLeft, IconCopy, IconEdit, IconFlag, IconUpload } from "@tabler/icons-react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { BookingPaymentProofUploadResponse, GroupFundedCampaignResponse, GroupFundedCampaignSummary } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";

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
  const contributorProgressValue = useMemo(() => {
    if (!campaign?.requiredContributors) {
      return 0;
    }
    return Math.min(100, Math.round((campaign.paidParticipantCount / campaign.requiredContributors) * 100));
  }, [campaign]);

  const isOrganizer = Boolean(user && campaign?.organizerUserId && String(user.id) === String(campaign.organizerUserId));
  const canContribute = campaign?.campaignStatus === "funding" && !campaign.contribution;
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

  return (
    <Stack className="customer-account-page" gap="lg">
      <Button component={Link} leftSection={<IconArrowLeft size={16} />} to={backLink} variant="subtle" w="fit-content">
        Back
      </Button>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
          <Group align="flex-start" justify="space-between">
            <Stack gap={6}>
              <Text className="finazze-section-label">Group-funded booking</Text>
              <Title order={1}>{campaign.campaignTitle || campaign.serviceName}</Title>
              <Group align="center" gap="xs">
                <Text c="dimmed">
                  {[campaign.vendorName, campaign.serviceName, campaign.locationName].filter(Boolean).join(" · ")}
                </Text>
                {campaign.tenantSlug ? (
                  <Button
                    color="orange"
                    component={Link}
                    size="xs"
                    to={`/vendors/${campaign.tenantSlug}`}
                    variant="light"
                  >
                    Vendor details
                  </Button>
                ) : null}
              </Group>
              <Text c="dimmed" size="sm">
                Organized by {campaign.organizerDisplayName}
              </Text>
            </Stack>
            <Badge color={getCampaignBadgeColor(campaign.campaignStatus)} size="lg" variant="light">
              {getCampaignStatusLabel(campaign.campaignStatus)}
            </Badge>
          </Group>

          {error ? <Alert color="red">{error}</Alert> : null}
          {message ? <Alert color="teal">{message}</Alert> : null}
          {campaign.contribution?.contributionStatus === "rejected" ? (
            <Alert color="red" variant="light">
              Your contribution proof was rejected and is not counted in the verified funding total.
            </Alert>
          ) : null}
          {campaign.description ? <Text>{campaign.description}</Text> : null}

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
            <Stack className="group-funded-campaign-summary-panel" gap={4}>
              <Text c="dimmed" size="xs">Booking details</Text>
              <Text fw={800}>{formatBookingScheduleDate(campaign.scheduledStartAt)}</Text>
              <Text size="sm">
                {formatBookingScheduleTimeRange(campaign.scheduledStartAt, campaign.scheduledEndAt)}
              </Text>
              <Text c="dimmed" size="sm">
                Quantity {campaign.bookingQuantity} · {campaign.locationName}
              </Text>
            </Stack>
            <Stack className="group-funded-campaign-summary-panel" gap={4}>
              <Text c="dimmed" size="xs">Campaign status</Text>
              <Badge color={getCampaignBadgeColor(campaign.campaignStatus)} variant="light" w="fit-content">
                {getCampaignStatusLabel(campaign.campaignStatus)}
              </Badge>
              <Text c="dimmed" size="sm">
                Deadline {formatBookingScheduleDate(campaign.fundingDeadlineAt)}
              </Text>
              <Text c="dimmed" size="sm">
                Visibility {campaign.visibility === "public" ? "Public on vendor profile" : "Private link only"}
              </Text>
              <Text fw={700}>
                {formatPaymentAmount(campaign.fundedAmountCents, campaign.currency)} / {formatPaymentAmount(campaign.targetAmountCents, campaign.currency)}
              </Text>
            </Stack>
            <Stack className="group-funded-campaign-summary-panel" gap={4}>
              <Text c="dimmed" size="xs">Contributor count</Text>
              <Group align="center" gap="md" wrap="nowrap">
                <RingProgress
                  sections={[{ value: contributorProgressValue, color: "teal" }]}
                  size={72}
                  thickness={8}
                  roundCaps
                  label={
                    <Text fw={800} size="sm" ta="center">
                      {campaign.paidParticipantCount}/{campaign.requiredContributors}
                    </Text>
                  }
                />
                <Stack gap={2}>
                  <Text fw={800}>{campaign.paidParticipantCount} of {campaign.requiredContributors}</Text>
                  <Text c="dimmed" size="sm">
                    {formatPaymentAmount(campaign.requiredContributionAmountCents, campaign.currency)} each
                  </Text>
                </Stack>
              </Group>
            </Stack>
          </SimpleGrid>

          <Alert color="yellow" variant="light">
            This slot is not reserved until the campaign is fully funded and approved by the vendor.
          </Alert>

          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>Verified funding</Text>
              <Text fw={700}>
                {formatPaymentAmount(campaign.fundedAmountCents, campaign.currency)} /{" "}
                {formatPaymentAmount(campaign.targetAmountCents, campaign.currency)}
              </Text>
            </Group>
            <Progress value={progressValue} color="teal" />
            <Text c="dimmed" size="sm">
              {campaign.paidParticipantCount} of {campaign.requiredContributors} verified contributors. Required contribution is exactly{" "}
              {formatPaymentAmount(campaign.requiredContributionAmountCents, campaign.currency)}.
            </Text>
          </Stack>

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

      <Card className="finazze-auth-card customer-account-card" p="xl">
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
                <Alert color="red" variant="light">
                  <Stack gap={4}>
                    <Text fw={700}>Your contribution proof was rejected and is not counted toward this campaign.</Text>
                    <Text>
                      Reason: {campaign.contribution.rejectionReason || "The vendor did not provide a rejection reason."}
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
            <Stack gap="md">
              <Alert color="teal" variant="light">
                Pay exactly {formatPaymentAmount(campaign.requiredContributionAmountCents, campaign.currency)}. Partial, extra, or uneven payments are not supported in v1.
              </Alert>
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
                Submit contribution proof
              </Button>
            </Stack>
          ) : (
            <Text c="dimmed">This campaign is no longer accepting contributions.</Text>
          )}
        </Stack>
      </Card>

      {isOrganizer && (canEditCampaign || canCancel || isCampaignFullyFunded) ? (
        <Card className="finazze-auth-card customer-account-card" p="xl">
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
