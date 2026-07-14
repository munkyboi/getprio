import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Tooltip,
  Title
} from "@mantine/core";
import { IconArrowLeft, IconBuildingStore, IconCalendar, IconCopy, IconDownload, IconEdit, IconEye, IconFlag, IconInfoCircle, IconReceipt, IconUpload, IconUsersGroup } from "@tabler/icons-react";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { Link, useLocation, useParams } from "react-router-dom";
import type {
  BookingPaymentProofUploadResponse,
  GroupFundedBundleItemSummary,
  GroupFundedCampaignResponse,
  GroupFundedCampaignSummary,
  PublicBoardThemeSettings,
  PublicVendorProfile,
  PublicVendorProfileResponse
} from "@shared";
import { API_BASE_URL, ApiError, apiRequest } from "../api/client";
import CampaignDescriptionEditor from "../components/CampaignDescriptionEditor";
import RichCampaignDescription from "../components/RichCampaignDescription";
import ResourceErrorState from "../components/ResourceErrorState";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";
import {
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange
} from "../utils/dates";
import { getErrorMessage } from "../utils/errors";
import { showCustomerError, showCustomerSuccess } from "../utils/customerNotifications";
import { buildVendorThemeMediaStyle, buildVendorThemeStyle } from "../utils/vendorTheme";

function formatPaymentAmount(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
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

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback": () => void;
        "error-callback": () => void;
      }) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export default function GroupFundedCampaignPage() {
  const { publicToken = "" } = useParams<{ publicToken: string }>();
  const location = useLocation();
  const { token, user, loading: authLoading } = useAuth();
  const [campaign, setCampaign] = useState<GroupFundedCampaignResponse["campaign"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [savingPaymentQr, setSavingPaymentQr] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [reportingAbuse, setReportingAbuse] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [customReportReason, setCustomReportReason] = useState("");
  const [reportAttachment, setReportAttachment] = useState<File | null>(null);
  const [reportTurnstileToken, setReportTurnstileToken] = useState("");
  const [reportTurnstileReady, setReportTurnstileReady] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    campaignTitle: "",
    description: "",
    visibility: "private_link" as "private_link" | "public"
  });
  const [vendorTheme, setVendorTheme] = useState<PublicBoardThemeSettings | null>(null);
  const [vendorProfile, setVendorProfile] = useState<PublicVendorProfile | null>(null);
  const [imagePreview, setImagePreview] = useState<{ name: string; imageUrl: string } | null>(null);
  const paymentProofSectionRef = useRef<HTMLDivElement | null>(null);
  const reportTurnstileContainerRef = useRef<HTMLDivElement | null>(null);
  const reportTurnstileWidgetIdRef = useRef<string | null>(null);
  const shareCopiedTimeoutRef = useRef<number | null>(null);
  const pendingActionKeysRef = useRef(new Set<string>());

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const reportTurnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const shouldUseReportTurnstile = Boolean(reportTurnstileSiteKey);

  const updateCampaign = useCallback((nextCampaign: GroupFundedCampaignResponse["campaign"]) => {
    setCampaign((currentCampaign) => {
      if (!currentCampaign || nextCampaign.tenantSlug) {
        return nextCampaign;
      }

      return {
        ...nextCampaign,
        tenantSlug: currentCampaign.tenantSlug
      };
    });
  }, []);

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
    setResponseStatus(null);
    try {
      if (token) {
        const data = await customerAccountApi.getGroupFundedCampaignSelf(token, publicToken);
        updateCampaign(data.campaign);
      } else {
        const data = await apiRequest<GroupFundedCampaignResponse>(
          `/public/group-funded-campaigns/${encodeURIComponent(publicToken)}`
        );
        updateCampaign(data.campaign);
      }
    } catch (loadError) {
      if (token) {
        try {
          const data = await apiRequest<GroupFundedCampaignResponse>(
            `/public/group-funded-campaigns/${encodeURIComponent(publicToken)}`
          );
          updateCampaign(data.campaign);
        } catch (fallbackError) {
          setResponseStatus(fallbackError instanceof ApiError ? fallbackError.status : null);
          setError(getErrorMessage(fallbackError));
        }
      } else {
        setResponseStatus(loadError instanceof ApiError ? loadError.status : null);
        setError(getErrorMessage(loadError));
      }
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }, [publicToken, token, updateCampaign]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  useEffect(() => {
    setReportTurnstileToken("");
    if (!reportModalOpen || !shouldUseReportTurnstile) {
      setReportTurnstileReady(!shouldUseReportTurnstile);
      return undefined;
    }

    let active = true;
    setReportTurnstileReady(false);
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );
    const renderTurnstile = () => {
      if (!active || !reportTurnstileContainerRef.current || !window.turnstile || reportTurnstileWidgetIdRef.current) {
        return;
      }
      reportTurnstileWidgetIdRef.current = window.turnstile.render(reportTurnstileContainerRef.current, {
        sitekey: reportTurnstileSiteKey,
        callback: (nextToken) => {
          setReportTurnstileToken(nextToken);
          setReportTurnstileReady(true);
        },
        "expired-callback": () => {
          setReportTurnstileToken("");
          setReportTurnstileReady(false);
        },
        "error-callback": () => {
          setReportTurnstileToken("");
          setReportTurnstileReady(false);
          showCustomerError("Verification could not load. Please refresh and try again.", "Security check unavailable");
        }
      });
    };

    if (window.turnstile) {
      renderTurnstile();
    } else if (existingScript) {
      existingScript.addEventListener("load", renderTurnstile, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", renderTurnstile, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      active = false;
      existingScript?.removeEventListener("load", renderTurnstile);
      if (reportTurnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(reportTurnstileWidgetIdRef.current);
        reportTurnstileWidgetIdRef.current = null;
      }
    };
  }, [reportModalOpen, reportTurnstileSiteKey, shouldUseReportTurnstile]);

  useEffect(() => {
    if (!campaign?.tenantSlug) {
      setVendorTheme(null);
      setVendorProfile(null);
      return undefined;
    }

    const controller = new AbortController();
    apiRequest<PublicVendorProfileResponse>(`/public/vendors/${campaign.tenantSlug}`, { signal: controller.signal })
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
  const fundingDeadline = useMemo(() => {
    if (!campaign) {
      return { relativeLabel: "", tooltipLabel: "" };
    }
    const deadline = new Date(campaign.fundingDeadlineAt);
    const daysFromNow = Math.max(0, differenceInCalendarDays(startOfDay(deadline), startOfDay(new Date())));
    return {
      relativeLabel: daysFromNow === 0
        ? "Deadline: today"
        : `Deadline: ${daysFromNow} ${daysFromNow === 1 ? "day" : "days"} from now`,
      tooltipLabel: format(deadline, "d MMMM yyyy @ h:mm a").toLowerCase()
    };
  }, [campaign]);

  useEffect(() => () => {
    if (shareCopiedTimeoutRef.current !== null) {
      window.clearTimeout(shareCopiedTimeoutRef.current);
    }
  }, []);
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
  const bundleItemsWithImages = useMemo(() => bundleItems.map((item) => ({
    ...item,
    imageUrl: vendorProfile?.services.find((service) => service.slug === item.serviceSlug)?.imageUrl || ""
  })), [bundleItems, vendorProfile]);
  const isOrganizer = Boolean(user && campaign?.isOrganizer);
  const canShareCampaign = !isOrganizer || campaign?.contribution?.contributionStatus === "verified";
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
  const hasFilledContributions = Boolean(contributorReservationSummary?.filledContributorCount);
  const canEditCampaign = isOrganizer && campaign?.campaignStatus === "funding" && !isCampaignFullyFunded && !hasFilledContributions;

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
    setShareCopied(true);
    if (shareCopiedTimeoutRef.current !== null) {
      window.clearTimeout(shareCopiedTimeoutRef.current);
    }
    shareCopiedTimeoutRef.current = window.setTimeout(() => setShareCopied(false), 2600);
  }

  function scrollToPaymentProof() {
    paymentProofSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function claimPendingAction(actionKey: string) {
    if (pendingActionKeysRef.current.has(actionKey)) {
      return false;
    }
    pendingActionKeysRef.current.add(actionKey);
    return true;
  }

  function releasePendingAction(actionKey: string) {
    pendingActionKeysRef.current.delete(actionKey);
  }

  async function savePaymentQr() {
    if (!token || !campaign?.paymentDestination?.qrImageUrl) {
      return;
    }
    const actionKey = `save-payment-qr:${campaign.publicToken}`;
    if (!claimPendingAction(actionKey)) {
      return;
    }

    setError("");
    setSavingPaymentQr(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/account/group-funded-campaigns/${encodeURIComponent(campaign.publicToken)}/payment-qr`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) {
        throw new Error("The QR image could not be saved. Please try again.");
      }

      const qrImage = await response.blob();
      const downloadUrl = URL.createObjectURL(qrImage);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${campaign.publicToken}-payment-qr.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      showCustomerSuccess("QR code download started", "Your QR image is being saved to this device.");
    } catch (downloadError) {
      showCustomerError(getErrorMessage(downloadError), "Could not save QR code");
    } finally {
      setSavingPaymentQr(false);
      releasePendingAction(actionKey);
    }
  }

  async function submitContribution() {
    if (!token || !campaign || !paymentProofFile || !paymentReference.trim()) {
      return;
    }
    const actionKey = `submit-contribution:${campaign.publicToken}:${paymentReference.trim()}:${paymentProofFile.name}:${paymentProofFile.lastModified}`;
    if (!claimPendingAction(actionKey)) {
      return;
    }

    setSubmitting(true);
    setError("");
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
      updateCampaign(data.campaign);
      setPaymentReference("");
      setPaymentProofFile(null);
      showCustomerSuccess("Contribution proof submitted", "The vendor will review your payment proof.");
    } catch (submitError) {
      showCustomerError(getErrorMessage(submitError), "Could not submit contribution proof");
    } finally {
      setSubmitting(false);
      releasePendingAction(actionKey);
    }
  }

  async function cancelCampaign() {
    if (!token || !campaign) {
      return;
    }
    const actionKey = `cancel-campaign:${campaign.publicToken}`;
    if (!claimPendingAction(actionKey)) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const data = await customerAccountApi.cancelGroupFundedCampaign(token, campaign.publicToken, {
        reason: "organizer_canceled"
      });
      updateCampaign(data.campaign);
      setShowCancelConfirm(false);
      showCustomerSuccess("Campaign canceled", "Verified contributions are now eligible for a refund.");
    } catch (cancelError) {
      showCustomerError(getErrorMessage(cancelError), "Could not cancel campaign");
    } finally {
      setSubmitting(false);
      releasePendingAction(actionKey);
    }
  }

  async function saveCampaignDetails() {
    if (!token || !campaign) {
      return;
    }
    const actionKey = `save-campaign:${campaign.publicToken}:${editForm.campaignTitle}:${editForm.description}:${editForm.visibility}`;
    if (!claimPendingAction(actionKey)) {
      return;
    }

    setEditSubmitting(true);
    setError("");
    try {
      const data = await customerAccountApi.updateGroupFundedCampaign(token, campaign.publicToken, {
        campaignTitle: editForm.campaignTitle.trim(),
        description: editForm.description.trim(),
        visibility: editForm.visibility
      });
      updateCampaign(data.campaign);
      setEditModalOpen(false);
      showCustomerSuccess("Campaign details updated", "Your campaign changes are now live.");
    } catch (saveError) {
      showCustomerError(getErrorMessage(saveError), "Could not update campaign");
    } finally {
      setEditSubmitting(false);
      releasePendingAction(actionKey);
    }
  }

  async function reportCampaign() {
    if (!campaign || !reportReason) {
      return;
    }
    if (shouldUseReportTurnstile && !reportTurnstileToken) {
      showCustomerError("Complete the security check before submitting your report.", "Verification required");
      return;
    }
    const actionKey = `report-campaign:${campaign.publicToken}:${reportReason}:${customReportReason.trim()}:${reportAttachment?.name || ""}`;
    if (!claimPendingAction(actionKey)) {
      return;
    }

    setReportingAbuse(true);
    setError("");
    try {
      let attachmentObjectKey = "";
      if (reportAttachment) {
        const uploadResponse = await fetch(
          `${API_BASE_URL}/public/group-funded-campaigns/${encodeURIComponent(campaign.publicToken)}/report-attachments/direct?fileName=${encodeURIComponent(reportAttachment.name)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": reportAttachment.type,
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: reportAttachment
          }
        );
        const uploadData = await uploadResponse.json().catch(() => ({})) as {
          attachment?: { objectKey?: string };
          message?: string;
        };
        if (!uploadResponse.ok || !uploadData.attachment?.objectKey) {
          throw new Error(uploadData.message || "Could not upload the screenshot.");
        }
        attachmentObjectKey = uploadData.attachment.objectKey;
      }
      await apiRequest(`/public/group-funded-campaigns/${encodeURIComponent(campaign.publicToken)}/report-abuse`, {
        method: "POST",
        token: token || undefined,
        body: {
          reason: reportReason === "other" ? customReportReason.trim() : reportReason,
          category: reportReason,
          attachmentFileName: reportAttachment?.name || "",
          attachmentObjectKey,
          turnstileToken: reportTurnstileToken || undefined
        }
      });
      setReportModalOpen(false);
      setReportReason(null);
      setCustomReportReason("");
      setReportAttachment(null);
      setReportTurnstileToken("");
      showCustomerSuccess("Campaign report sent", "The vendor has been notified of your report.");
    } catch (reportError) {
      showCustomerError(getErrorMessage(reportError), "Could not send campaign report");
    } finally {
      setReportingAbuse(false);
      releasePendingAction(actionKey);
    }
  }

  if (authLoading || loading) {
    return <Card className="finazze-auth-card">Loading group-funded campaign...</Card>;
  }

  if (!campaign) {
    return (
      <ResourceErrorState
        backLabel={user ? "Back to my campaigns" : "Browse vendors"}
        backTo={user ? "/account/group-funded" : "/vendors"}
        error={error}
        onRetry={() => void loadCampaign()}
        resourceName="group-funded campaign"
        status={responseStatus}
      />
    );
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
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            <Stack align="center" gap="sm">
              <Image
                alt={`${campaign.paymentDestination.methodLabel} payment QR`}
                fit="contain"
                h={156}
                radius="sm"
                src={campaign.paymentDestination.qrImageUrl}
                w={156}
              />
              <Button
                className="group-funded-save-qr-button"
                leftSection={<IconDownload size={18} />}
                loading={savingPaymentQr}
                onClick={() => void savePaymentQr()}
                variant="light"
              >
                Save QR
              </Button>
            </Stack>
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
          </SimpleGrid>
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
        className="group-funded-submit-button"
        color="dark"
        disabled={!paymentReference.trim() || !paymentProofFile}
        loading={submitting}
        onClick={submitContribution}
        size="lg"
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
                  <Badge className="group-funded-hero-badge" size="lg">
                    {campaign.vendorCategory || "Business"}
                  </Badge>
                  <Badge className="group-funded-hero-badge group-funded-hero-status-badge" size="lg">
                    {getCampaignStatusLabel(campaign.campaignStatus)}
                  </Badge>
                </Group>
                <Stack gap={4} mt="md">
                  <Title className="vendor-hero-title ticket-page-title" order={1}>
                    {campaign.campaignTitle || campaign.serviceName}
                  </Title>
                  <Text className="vendor-hero-subtitle" fw={700} size="lg">
                    Organized by {campaign.organizerDisplayName}
                  </Text>
                </Stack>
              </div>

              <RichCampaignDescription
                className="vendor-hero-description group-funded-campaign-description rich-campaign-description"
                content={campaign.description || `${campaign.vendorName || "Vendor"} group-funded booking organized by ${campaign.organizerDisplayName}.`}
              />

              <Stack gap="xs">
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon booking-detail-hero-icon-solid" radius="xl" size={32} variant="light">
                    <IconBuildingStore size={16} />
                  </ThemeIcon>
                  <Group gap={4} wrap="wrap">
                    {campaign.vendorName ? (
                      campaign.tenantSlug ? (
                        <Text className="group-funded-vendor-link" component={Link} to={`/vendors/${campaign.tenantSlug}`}>
                          {campaign.vendorName}
                        </Text>
                      ) : <Text>{campaign.vendorName}</Text>
                    ) : null}
                    {campaign.locationName ? <Text>· {campaign.locationName}</Text> : null}
                  </Group>
                </Group>
                <Group c="dimmed" gap={8} wrap="nowrap">
                  <ThemeIcon className="vendor-theme-icon booking-detail-hero-icon-solid" radius="xl" size={32} variant="light">
                    <IconCalendar size={16} />
                  </ThemeIcon>
                  <Text>
                    {formatBookingScheduleDate(campaign.scheduledStartAt)} · {formatBookingScheduleTimeRange(campaign.scheduledStartAt, campaign.scheduledEndAt)}
                  </Text>
                </Group>
              </Stack>

              <Group className="group-funded-hero-actions" gap="md">
                {canShareCampaign ? (
                  <div className="group-funded-share-action">
                    {shareCopied ? <div className="group-funded-share-toast">Share link copied to clipboard</div> : null}
                    <Button className="vendor-theme-button" leftSection={<IconCopy size={18} />} onClick={copyShareLink} size="lg">
                      Copy share link
                    </Button>
                  </div>
                ) : null}
                <Button
                  className="vendor-theme-button vendor-theme-button-ghost"
                  leftSection={<IconUsersGroup size={18} />}
                  onClick={scrollToPaymentProof}
                  size="lg"
                  variant="subtle"
                >
                  Join campaign
                </Button>
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
                <Text fw={800}>
                  Funding {formatPaymentAmount(campaign.fundedAmountCents, campaign.currency)} / {formatPaymentAmount(campaign.targetAmountCents, campaign.currency)}
                </Text>
                <Progress mt={6} value={progressValue} color="teal" />
                <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md" spacing="sm">
                  <div className="prio-dashboard-tile">
                    <Text c="dimmed" size="xs">Join fee</Text>
                    <Text fw={800}>{formatPaymentAmount(campaign.requiredContributionAmountCents, campaign.currency)}</Text>
                    <Group c="dimmed" gap={4} mt={2} wrap="nowrap">
                      <Text size="xs">{fundingDeadline.relativeLabel}</Text>
                      <Tooltip label={fundingDeadline.tooltipLabel} withArrow>
                        <IconInfoCircle aria-label={`Funding deadline: ${fundingDeadline.tooltipLabel}`} size={14} />
                      </Tooltip>
                    </Group>
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
                </SimpleGrid>
              </Paper>
            </Paper>
          </SimpleGrid>
        </Paper>

        <Card className="finazze-auth-card customer-account-card booking-detail-section-card" mt="xl" p="xl">
          <Stack gap="md">
            <div>
              <Text className="finazze-section-label">Bundled services</Text>
              <Title order={2}>What&apos;s in this campaign</Title>
            </div>
            <Stack gap="sm">
              {bundleItemsWithImages.map((item) => (
                <Paper className="group-funded-bundle-item" key={item.id || item.serviceSlug} p="sm">
                  <Group align="center" gap="sm" wrap="nowrap">
                    {item.imageUrl ? (
                      <button
                        aria-label={`Preview ${item.serviceName} image`}
                        className="group-funded-bundle-thumbnail"
                        onClick={() => setImagePreview({ name: item.serviceName, imageUrl: item.imageUrl })}
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

            <Group justify="flex-end">
              <Button color="red" leftSection={<IconFlag size={16} />} onClick={() => setReportModalOpen(true)} variant="subtle">
                Report
              </Button>
            </Group>
          </Stack>
        </Card>

      <Card className="finazze-auth-card customer-account-card" mt="xl" p="xl" ref={paymentProofSectionRef}>
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
                className="group-funded-organizer-action"
                disabled={!canEditCampaign}
                leftSection={<IconEdit size={16} />}
                onClick={openEditModal}
                size="lg"
                variant="light"
              >
                Edit campaign details
              </Button>
            ) : null}
            {hasFilledContributions ? (
              <Text c="dimmed" size="sm">
                Campaign details are locked once a contribution has been submitted.
              </Text>
            ) : null}
            {canCancel ? (
              <Button className="group-funded-organizer-action" color="red" onClick={() => setShowCancelConfirm(true)} size="lg" variant="light">
                Cancel campaign
              </Button>
            ) : null}
          </Stack>
        </Card>
      ) : null}
      </Container>

      <Modal
        centered
        className="customer-modal group-funded-cancel-modal"
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        onClose={() => setShowCancelConfirm(false)}
        opened={showCancelConfirm}
        radius="lg"
        size="sm"
        title="Cancel this campaign?"
      >
        <Stack gap="md">
          <Text>
            Canceling closes this campaign permanently. Any verified contributions become refund-eligible and the campaign cannot be reopened.
          </Text>
          <Alert color="yellow" variant="light">
            Only cancel if you no longer plan to run this group booking.
          </Alert>
          <Stack className="customer-modal-actions" gap="sm">
            <Button color="dark" disabled={submitting} onClick={() => setShowCancelConfirm(false)} size="lg" w="100%">
              Keep campaign open
            </Button>
            <Button color="red" loading={submitting} onClick={cancelCampaign} size="lg" variant="outline" w="100%">
              Cancel campaign and start refunds
            </Button>
          </Stack>
        </Stack>
      </Modal>

      <Modal
        centered
        className="customer-modal"
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
          <Stack gap={4}>
            <Text fw={500} size="sm">Campaign description</Text>
            <CampaignDescriptionEditor
              onChange={(description) => setEditForm((current) => ({ ...current, description }))}
              value={editForm.description}
            />
          </Stack>
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
          <Group className="customer-modal-actions" justify="flex-end">
            <Button onClick={() => setEditModalOpen(false)} size="lg" variant="light">
              Cancel
            </Button>
            <Button
              color="dark"
              disabled={!editForm.campaignTitle.trim()}
              loading={editSubmitting}
              onClick={saveCampaignDetails}
              size="lg"
            >
              Save changes
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        centered
        className="customer-modal group-funded-report-modal"
        onClose={() => setReportModalOpen(false)}
        opened={reportModalOpen}
        radius="lg"
        size="md"
        title="Report campaign"
      >
        <Stack gap="md">
          <div>
            <Text fw={800}>You’re about to submit a report</Text>
            <Text c="dimmed" size="sm">
              We only remove content that goes against our Acceptable Use Policy.
            </Text>
          </div>
          <Text className="finazze-section-label">Report details</Text>
          <Select
            data={[
              { label: "Misleading or fraudulent campaign", value: "misleading_or_fraudulent" },
              { label: "Inappropriate or offensive content", value: "inappropriate_content" },
              { label: "Harassment or hate speech", value: "harassment_or_hate_speech" },
              { label: "Spam", value: "spam" },
              { label: "Others", value: "other" }
            ]}
            label="Why are you reporting this campaign?"
            onChange={setReportReason}
            placeholder="Select a reason"
            value={reportReason}
          />
          {reportReason === "other" ? (
            <Textarea
              label="Tell us more"
              maxLength={500}
              minRows={4}
              onChange={(event) => setCustomReportReason(event.currentTarget.value)}
              placeholder="Describe the issue"
              required
              value={customReportReason}
            />
          ) : null}
          <FileInput
            accept="image/jpeg,image/png,image/webp"
            clearable
            label="Attachment (optional)"
            onChange={setReportAttachment}
            placeholder="Upload a screenshot"
            value={reportAttachment}
          />
          {shouldUseReportTurnstile ? (
            <Paper className="finazze-soft-panel" p="sm">
              <Text fw={700} size="sm">Security check</Text>
              <Text c="dimmed" mb="xs" size="xs">Complete this check to send your report.</Text>
              <div ref={reportTurnstileContainerRef} />
            </Paper>
          ) : null}
          <Text c="dimmed" size="xs">Your report will be sent to the vendor’s email.</Text>
          <Group className="group-funded-report-actions" justify="flex-end">
            <Button onClick={() => setReportModalOpen(false)} size="lg" variant="light">Cancel</Button>
            <Button
              color="red"
              disabled={!reportReason || (reportReason === "other" && !customReportReason.trim()) || (shouldUseReportTurnstile && !reportTurnstileReady)}
              loading={reportingAbuse}
              onClick={reportCampaign}
              size="lg"
            >
              Submit report
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        centered
        className="customer-modal"
        onClose={() => setImagePreview(null)}
        opened={Boolean(imagePreview)}
        radius="lg"
        size="xl"
        title={imagePreview?.name || "Service image"}
      >
        {imagePreview ? <div className="service-image-preview-shell"><img alt={imagePreview.name} src={imagePreview.imageUrl} /></div> : null}
      </Modal>
    </Stack>
  );
}
