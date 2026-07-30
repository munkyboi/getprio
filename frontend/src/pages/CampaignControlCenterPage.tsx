import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Avatar, Badge, Box, Button, Card, Container, FileInput, Group, Image, Modal, Notification, NumberInput, Paper, Portal, ScrollArea, SimpleGrid, Slider, Stack, Text, Textarea, TextInput, Title } from "@mantine/core";
import { IconAlertCircle, IconBellRinging, IconCalendarTime, IconCircleCheck, IconClock, IconCopy, IconExternalLink, IconEye, IconRefresh, IconStar, IconUpload } from "@tabler/icons-react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { OrganizerCampaign, OrganizerContributionStatus } from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";
import FiveStarRatingInput from "../components/FiveStarRatingInput";
import CampaignDescriptionEditor from "../components/CampaignDescriptionEditor";
import RichCampaignDescription from "../components/RichCampaignDescription";
import CampaignDeadlinePicker, { formatCampaignDeadlineDate, resolveCampaignDeadline } from "../components/CampaignDeadlinePicker";
import CampaignHeroStats from "../components/CampaignHeroStats";
import CampaignFundingProgress from "../components/CampaignFundingProgress";
import { ConfirmActionModal } from "../components/ConfirmActionModal";
import { PromptActionModal } from "../components/PromptActionModal";
import { formatBookingScheduleDate, formatBookingScheduleTimeRange } from "../utils/dates";
import CampaignSummaryCard from "../components/CampaignSummaryCard";

function money(cents: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(cents / 100);
}

function formatBytes(sizeBytes = 0) {
  if (!sizeBytes) return "Size unavailable";
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(value = "") {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "U";
}

type CampaignFilters = { search: string; date: string };

function formatCampaignFilterDate(value: string | Date, timeZone = "Asia/Manila") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function campaignMatchesFilters(campaign: OrganizerCampaign, filters: CampaignFilters) {
  const search = filters.search.trim().toLocaleLowerCase();
  if (search) {
    const searchableText = [
      campaign.title,
      campaign.organizerDisplayName,
      campaign.vendor?.name,
      campaign.location?.name,
      campaign.location?.city,
      campaign.location?.province,
      campaign.booking?.locationAddress
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    if (!searchableText.includes(search)) return false;
  }

  if (!filters.date) return true;
  const scheduledStartAt = campaign.scheduledStartAt || campaign.booking?.scheduledStartAt;
  return Boolean(
    scheduledStartAt
      && formatCampaignFilterDate(scheduledStartAt, campaign.location?.timezone || campaign.booking?.locationTimezone) === filters.date
  );
}

function contributionStatus(status: OrganizerContributionStatus) {
  const labels: Record<string, { color: string; label: string }> = {
    pending_proof: { color: "orange", label: "Payment proof needed" },
    submitted: { color: "blue", label: "Proof submitted" },
    review_overdue: { color: "yellow", label: "Review overdue" },
    accepted: { color: "teal", label: "Payment accepted" },
    rejected: { color: "red", label: "Proof needs correction" },
    expired: { color: "gray", label: "Reservation expired" },
    withdrawn: { color: "gray", label: "Reservation left" },
    refund_pending: { color: "orange", label: "Refund pending" },
    refund_sent: { color: "blue", label: "Refund sent" },
    refund_confirmed: { color: "teal", label: "Refund confirmed" },
    refund_disputed: { color: "red", label: "Refund disputed" }
  };
  return labels[String(status)] || { color: "gray", label: String(status).replaceAll("_", " ") };
}

function participationPresentation(contribution: NonNullable<OrganizerCampaign["contribution"]>) {
  if (contribution.status === "withdrawn") {
    return {
      flavor: "attention",
      badgeColor: "gray",
      icon: IconClock,
      title: "You left this campaign",
      description: "Your unpaid slot was released. You may retry once after the short cooldown if space remains."
    };
  }
  if (contribution.status === "expired") {
    return {
      flavor: "attention",
      badgeColor: "gray",
      icon: IconClock,
      title: "Reservation expired",
      description: "Your unpaid slot was released. You may retry once after the short cooldown if space remains."
    };
  }
  if (contribution.status === "rejected" && !contribution.paymentProof) {
    return {
      flavor: "attention",
      badgeColor: "red",
      icon: IconAlertCircle,
      title: "Campaign slot released",
      description: contribution.rejectionReason || "The organizer released this campaign reservation."
    };
  }
  if (!contribution.paymentProof) {
    return {
      flavor: "awaiting-proof",
      badgeColor: "orange",
      icon: IconClock,
      title: "Your slot is reserved",
      description: "Submit the funding fee and payment proof to complete your contribution."
    };
  }
  if (contribution.status === "rejected" || contribution.status === "refund_disputed") {
    return {
      flavor: "attention",
      badgeColor: "red",
      icon: IconAlertCircle,
      title: "Payment proof needs attention",
      description: contribution.rejectionReason || "Review the payment status and submit corrected evidence when available."
    };
  }
  if (["submitted", "review_overdue"].includes(contribution.status)) {
    return {
      flavor: "under-review",
      badgeColor: contribution.status === "review_overdue" ? "yellow" : "blue",
      icon: IconClock,
      title: "Payment proof submitted",
      description: "Your slot is reserved while the organizer reviews your payment evidence."
    };
  }
  if (["refund_pending", "refund_sent"].includes(contribution.status)) {
    return {
      flavor: "under-review",
      badgeColor: "orange",
      icon: IconClock,
      title: "Reimbursement in progress",
      description: "Follow the reimbursement status and confirm only after the funds reach you."
    };
  }
  if (contribution.status === "refund_confirmed") {
    return {
      flavor: "accepted",
      badgeColor: "teal",
      icon: IconCircleCheck,
      title: "Reimbursement confirmed",
      description: "You confirmed that the campaign reimbursement reached you."
    };
  }
  return {
    flavor: "accepted",
    badgeColor: "teal",
    icon: IconCircleCheck,
    title: "Your contribution is confirmed",
    description: "The organizer has accepted your campaign contribution."
  };
}

function CampaignRatingForm({ token, campaignId, contributionId, onSaved, actionLabel, subjectLabel }: { token: string; campaignId: string; contributionId: string; onSaved: () => void; actionLabel: string; subjectLabel: string }) {
  const [stars, setStars] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [opened, setOpened] = useState(false);
  const [reasonCategory, setReasonCategory] = useState("");
  async function saveRating() {
    if (!stars) return;
    const reason = reasonCategory.trim();
    if (stars <= 2 && !reason) {
      setError("A low-rating reason is required for one or two stars.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/account/campaigns/${campaignId}/contributions/${contributionId}/rating`, { method: "POST", token, body: { stars, reasonCategory: reason, privateNote: "" } });
      setOpened(false);
      setReasonCategory("");
      setSubmitted(true);
      onSaved();
    } catch (next) {
      setError(getErrorMessage(next));
    } finally {
      setBusy(false);
    }
  }
  if (submitted) return <Text c="teal" fw={700} size="sm">Rating submitted</Text>;
  return <><Button leftSection={<IconStar size={16}/>} onClick={() => { setError(""); setOpened(true); }} size="xs" variant="light">{actionLabel}</Button><Modal centered className="customer-modal campaign-rating-modal" onClose={() => { if (!busy) setOpened(false); }} opened={opened} size="md" title={<Stack className="getprio-modal-title" gap={2}><Text className="getprio-modal-eyebrow">PRIVATE TRUST</Text><Text className="getprio-modal-heading">Rate {subjectLabel}</Text></Stack>} transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}><div className="campaign-rating-modal-shell"><ScrollArea className="campaign-rating-modal-main" scrollbars="y" scrollbarSize={8} styles={{ root: { flex: 1, minHeight: 0 }, viewport: { height: "100%" } }} type="hover"><Stack gap="md"><Text c="dimmed" size="sm">This rating is private and helps GetPrio support safer campaign interactions.</Text><FiveStarRatingInput label={`Private trust rating for ${subjectLabel}`} onChange={(value) => { setStars(value); setError(""); if (value > 2) setReasonCategory(""); }} value={stars}/>{stars > 0 && stars <= 2 ? <Textarea autosize label="Low-rating reason" maxLength={500} minRows={3} onChange={(event) => setReasonCategory(event.currentTarget.value)} placeholder="For example: communication, payment, or conduct" required value={reasonCategory}/> : null}{error ? <Alert color="red">{error}</Alert> : null}</Stack></ScrollArea><Group className="customer-modal-actions campaign-rating-modal-actions" justify="flex-end"><Button disabled={!stars || (stars <= 2 && !reasonCategory.trim())} loading={busy} onClick={() => void saveRating()} size="lg">Submit rating</Button></Group></div></Modal></>;
}

function DraftCampaignEditor({ campaign, token, onSaved }: { campaign: OrganizerCampaign; token: string; onSaved: () => void }) {
  const initialDeadlineDate = campaign.deadlineAt ? formatCampaignDeadlineDate(campaign.deadlineAt) : "";
  const [form, setForm] = useState({ title: campaign.title, description: campaign.description, deadlineAt: initialDeadlineDate ? resolveCampaignDeadline(initialDeadlineDate) : "", contributionFeePhp: campaign.contributionFeeCents / 100, requiredContributors: campaign.requiredContributors, paymentInstructions: campaign.paymentInstructions });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save() { setBusy(true); try { await customerAccountApi.updateCampaign(token, campaign.id, { title: form.title, description: form.description, deadlineAt: form.deadlineAt, contributionFeeCents: Math.round(form.contributionFeePhp * 100), requiredContributors: form.requiredContributors, paymentInstructions: form.paymentInstructions }); onSaved(); } catch (next) { setError(getErrorMessage(next)); } finally { setBusy(false); } }
  return <Card p="lg"><Stack><Title order={3}>Campaign setup</Title><TextInput label="Title" maxLength={120} value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.currentTarget.value }))}/><Stack gap={4}><Text fw={500} size="sm">Description</Text><CampaignDescriptionEditor disabled={busy} value={form.description} onChange={(description) => setForm((v) => ({ ...v, description }))}/></Stack><CampaignDeadlinePicker disabled={busy} onChange={(deadlineAt) => setForm((v) => ({ ...v, deadlineAt }))} scheduledStartAt={campaign.scheduledStartAt} value={form.deadlineAt}/><NumberInput label="Contribution fee per person (PHP)" min={1} value={form.contributionFeePhp} onChange={(value) => setForm((v) => ({ ...v, contributionFeePhp: Number(value) || 0 }))}/><Stack gap={6}><Group justify="space-between"><Text size="sm">Contributor slots</Text><Badge>{form.requiredContributors} people</Badge></Group><Slider aria-label="Contributor slots" max={100} min={1} onChange={(value) => setForm((v) => ({ ...v, requiredContributors: value }))} value={form.requiredContributors}/></Stack><Stack gap={4}><Text fw={500} size="sm">Private payment instructions</Text><Text c="dimmed" size="xs">Shown only to joined, signed-in contributors.</Text><CampaignDescriptionEditor disabled={busy} maxCharacters={2000} value={form.paymentInstructions} onChange={(paymentInstructions) => setForm((v) => ({ ...v, paymentInstructions }))}/></Stack>{error ? <Alert color="red">{error}</Alert> : null}<Button loading={busy} onClick={save}>Save draft</Button></Stack></Card>;
}

export default function CampaignControlCenterPage() {
  const { campaignId } = useParams();
  const { token, user, loading } = useAuth();
  const [campaigns, setCampaigns] = useState<OrganizerCampaign[]>([]);
  const [campaign, setCampaign] = useState<OrganizerCampaign | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [cancelReasonModalOpen, setCancelReasonModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [rejectionContributionId, setRejectionContributionId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [serviceImagePreview, setServiceImagePreview] = useState<{ name: string; imageUrl: string } | null>(null);
  const [proofPreview, setProofPreview] = useState<{
    url: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    paymentReference?: string;
    submittedAt?: string | Date | null;
  } | null>(null);
  const [overlayNotices, setOverlayNotices] = useState<NonNullable<OrganizerCampaign["notices"]>>([]);
  const [reservationClock, setReservationClock] = useState(Date.now());
  const [campaignFilters, setCampaignFilters] = useState<CampaignFilters>({ search: "", date: "" });
  const [appliedCampaignFilters, setAppliedCampaignFilters] = useState<CampaignFilters>({ search: "", date: "" });
  const dismissedNoticeIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      if (campaignId) setCampaign((await customerAccountApi.getCampaign(token, campaignId)).campaign);
      else setCampaigns((await customerAccountApi.getCampaigns(token)).campaigns);
    } catch (nextError) { setError(getErrorMessage(nextError)); }
  }, [campaignId, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (campaign?.contribution?.status !== "pending_proof" || !campaign.contribution.reservationExpiresAt) return undefined;
    const timer = window.setInterval(() => setReservationClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [campaign?.contribution?.reservationExpiresAt, campaign?.contribution?.status]);
  useEffect(() => {
    if (campaign?.contribution?.status !== "pending_proof" || !campaign.contribution.reservationExpiresAt) return undefined;
    const remainingMs = new Date(campaign.contribution.reservationExpiresAt).getTime() - Date.now();
    const timer = window.setTimeout(() => void load(), Math.max(0, remainingMs) + 250);
    return () => window.clearTimeout(timer);
  }, [campaign?.contribution?.reservationExpiresAt, campaign?.contribution?.status, load]);
  useEffect(() => {
    if (!campaign?.publicToken || campaign.status === "draft") return undefined;
    const eventSource = new EventSource(
      `${API_BASE_URL}/public/campaigns/${encodeURIComponent(campaign.publicToken)}/stream`
    );
    const handleCampaignChange = () => {
      void load();
    };
    eventSource.addEventListener("campaign-change", handleCampaignChange);
    eventSource.onerror = () => {
      // EventSource reconnects automatically after transient network or server interruptions.
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      eventSource.removeEventListener("campaign-change", handleCampaignChange);
      eventSource.close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [campaign?.publicToken, campaign?.status, load]);
  useEffect(() => {
    if (!campaignId || !campaign?.notices) {
      setOverlayNotices([]);
      return;
    }

    const storageKey = `getprio:campaign-notices:${user?.id || "customer"}:${campaignId}`;
    let dismissedIds = new Set<string>();
    try {
      const storedIds = JSON.parse(window.sessionStorage.getItem(storageKey) || "[]");
      if (Array.isArray(storedIds)) dismissedIds = new Set(storedIds.map(String));
    } catch {
      dismissedIds = new Set();
    }
    dismissedNoticeIdsRef.current = dismissedIds;
    setOverlayNotices(campaign.notices.filter((notice) => !dismissedIds.has(notice.id)));
  }, [campaign?.notices, campaignId, user?.id]);
  const contributions = campaign?.contributions || (campaign?.contribution ? [campaign.contribution] : []);
  const acceptedContributors = campaign?.acceptedContributors
    ?? contributions.filter((item) => item.status === "accepted").length;
  const reservedContributors = campaign?.reservedContributors
    ?? contributions.filter((item) => item.status === "pending_proof" && (!item.reservationExpiresAt || new Date(item.reservationExpiresAt).getTime() > reservationClock)).length;
  const underReviewContributors = campaign?.underReviewContributors
    ?? contributions.filter((item) => ["submitted", "review_overdue"].includes(item.status)).length;
  const joinedContributors = campaign?.joinedContributors
    ?? reservedContributors + underReviewContributors + acceptedContributors;
  const acceptedAmountCents = campaign?.acceptedAmountCents
    ?? acceptedContributors * (campaign?.contributionFeeCents || 0);
  const fundingTargetCents = campaign
    ? campaign.requiredContributors * campaign.contributionFeeCents
    : 0;
  const isOrganizer = Boolean(campaign && user && campaign.organizerUserId === user.id);
  const ownContribution = campaign?.contribution;
  const participation = ownContribution ? participationPresentation(ownContribution) : null;
  const rejectionContribution = contributions.find((item) => item.id === rejectionContributionId);
  const ownReimbursement = campaign?.reimbursement;
  const shareUrl = useMemo(() => campaign ? `${window.location.origin}/campaign/${campaign.publicToken}` : "", [campaign]);
  const booking = campaign?.booking;
  const reservationRemainingSeconds = ownContribution?.status === "pending_proof" && ownContribution.reservationExpiresAt
    ? Math.max(0, Math.ceil((new Date(ownContribution.reservationExpiresAt).getTime() - reservationClock) / 1000))
    : null;
  const retryAvailable = !ownContribution?.retryAvailableAt
    || new Date(ownContribution.retryAvailableAt).getTime() <= reservationClock;
  const filteredCampaigns = useMemo(
    () => campaigns.filter((item) => campaignMatchesFilters(item, appliedCampaignFilters)),
    [appliedCampaignFilters, campaigns]
  );

  function dismissNotice(noticeId: string) {
    dismissedNoticeIdsRef.current.add(noticeId);
    setOverlayNotices((current) => current.filter((notice) => notice.id !== noticeId));
    if (!campaignId) return;
    try {
      window.sessionStorage.setItem(
        `getprio:campaign-notices:${user?.id || "customer"}:${campaignId}`,
        JSON.stringify(Array.from(dismissedNoticeIdsRef.current))
      );
    } catch {
      // The notification can still be dismissed for the current page session.
    }
  }

  if (loading) return <Container py="xl"><Text>Loading campaigns…</Text></Container>;
  if (!user || !token) return <Navigate replace to="/login" />;

  async function publish(visibility: "private_link" | "public") {
    if (!campaign) return;
    setBusy(true);
    try { await customerAccountApi.publishCampaign(token, campaign.id, visibility); await load(); }
    catch (nextError) { setError(getErrorMessage(nextError)); }
    finally { setBusy(false); }
  }

  async function unpublish() { if (!campaign) return; setBusy(true); try { await customerAccountApi.unpublishCampaign(token, campaign.id); await load(); } catch (next) { setError(getErrorMessage(next)); } finally { setBusy(false); } }
  function cancel() { if (!campaign) return; setError(""); setCancelReason(""); setCancelReasonModalOpen(true); }
  async function submitCancellation() { const reason = cancelReason.trim(); if (!campaign || !reason) return; setBusy(true); try { await apiRequest(`/account/campaigns/${campaign.id}/cancel`, { method: "PATCH", token, body: { reason } }); setCancelReasonModalOpen(false); setCancelReason(""); await load(); } catch (next) { setError(getErrorMessage(next)); } finally { setBusy(false); } }
  async function leaveCampaign() {
    if (!campaign || ownContribution?.status !== "pending_proof") return;
    setBusy(true);
    setError("");
    try {
      await customerAccountApi.leaveCampaign(token, campaign.id);
      setLeaveModalOpen(false);
      await load();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function retryReservation() {
    if (!campaign || !["expired", "withdrawn"].includes(ownContribution?.status || "") || !retryAvailable) return;
    setBusy(true);
    setError("");
    try {
      await customerAccountApi.joinCampaign(token, campaign.id);
      await load();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function uploadProof() {
    if (!campaign || !proof || !paymentReference.trim() || (ownContribution?.status === "rejected" && !retryAvailable)) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/account/campaigns/${campaign.id}/contributions/proof?fileName=${encodeURIComponent(proof.name)}&paymentReference=${encodeURIComponent(paymentReference.trim())}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": proof.type }, body: proof });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Proof upload failed.");
      await load(); setProof(null); setPaymentReference("");
    } catch (nextError) { setError(getErrorMessage(nextError)); }
    finally { setBusy(false); }
  }

  async function resolveReimbursement(action: "confirm" | "dispute") {
    if (!campaign || !ownContribution) return;
    setBusy(true);
    try {
      await apiRequest(`/account/campaigns/${campaign.id}/contributions/${ownContribution.id}/reimbursement/${action}`, { method: "PATCH", token, body: action === "dispute" ? { reason: "Refund has not been received or does not match the expected amount." } : undefined });
      await load();
    } catch (nextError) { setError(getErrorMessage(nextError)); }
    finally { setBusy(false); }
  }

  async function reviewContribution(contributionId: string, decision: "accept" | "reject") {
    if (!campaign) return;
    if (decision === "reject") {
      setError("");
      setRejectionContributionId(contributionId);
      setRejectionReason("");
      return;
    }
    setBusy(true);
    try { await apiRequest(`/account/campaigns/${campaign.id}/contributions/${contributionId}/review`, { method: "PATCH", token, body: { decision, rejectionReason: "" } }); await load(); }
    catch (nextError) { setError(getErrorMessage(nextError)); } finally { setBusy(false); }
  }

  async function submitContributionRejection() {
    const reason = rejectionReason.trim();
    if (!campaign || !rejectionContributionId || !reason) return;
    setBusy(true);
    try {
      await apiRequest(`/account/campaigns/${campaign.id}/contributions/${rejectionContributionId}/review`, { method: "PATCH", token, body: { decision: "reject", rejectionReason: reason } });
      setRejectionContributionId(null);
      setRejectionReason("");
      await load();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function uploadReimbursementEvidence(contributionId: string, file: File) {
    if (!campaign) return;
    setBusy(true);
    try { const response = await fetch(`${API_BASE_URL}/account/campaigns/${campaign.id}/contributions/${contributionId}/reimbursement/evidence?fileName=${encodeURIComponent(file.name)}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type }, body: file }); if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || "Evidence upload failed."); await load(); }
    catch (nextError) { setError(getErrorMessage(nextError)); } finally { setBusy(false); }
  }

  async function viewEvidence(contributionId: string, kind: "contribution" | "reimbursement" = "contribution") {
    if (!campaign) return;
    setBusy(true);
    try {
      const result = await apiRequest<{
        proof: { fileName: string; contentType: string; sizeBytes: number };
        access: { url: string };
      }>(`/account/campaigns/${campaign.id}/contributions/${contributionId}/evidence?kind=${kind}`, { token });
      if (kind === "contribution") {
        const contribution = contributions.find((item) => item.id === contributionId);
        setProofPreview({
          url: result.access.url,
          ...result.proof,
          paymentReference: contribution?.paymentReference,
          submittedAt: contribution?.submittedAt
        });
      } else {
        window.open(result.access.url, "_blank", "noopener,noreferrer");
      }
    } catch (next) {
      setError(getErrorMessage(next));
    } finally {
      setBusy(false);
    }
  }

  if (!campaignId) {
    return <Stack gap="lg">
      <Group align="flex-end" className="customer-section-header" justify="space-between">
        <div>
          <Text className="finazze-section-label">Campaigns</Text>
          <Title order={1}>Your campaigns</Title>
          <Text c="dimmed">Manage the campaigns you organize and contributions you support.</Text>
        </div>
        <Button component={Link} to="/account/campaigns/discover" variant="light">Discover campaigns</Button>
      </Group>
      <Card className="finazze-auth-card customer-account-card campaign-control-page" p="xl">
        <Stack gap="lg">
          <Card className="campaign-discovery-filters" component="form" onSubmit={(event) => {
            event.preventDefault();
            setAppliedCampaignFilters({
              search: campaignFilters.search.trim(),
              date: campaignFilters.date
            });
          }} p="md">
            <SimpleGrid cols={{ base: 1, md: 3 }}>
              <TextInput label="Search campaigns" maxLength={120} onChange={(event) => {
                const search = event.currentTarget.value;
                setCampaignFilters((current) => ({ ...current, search }));
              }} placeholder="Campaign title, organizer, vendor, or address" type="search" value={campaignFilters.search}/>
              <TextInput label="Booking date" onChange={(event) => {
                const date = event.currentTarget.value;
                setCampaignFilters((current) => ({ ...current, date }));
              }} type="date" value={campaignFilters.date}/>
              <Button mt={{ base: 0, md: 25 }} type="submit">Apply filters</Button>
            </SimpleGrid>
          </Card>
          {error ? <Alert color="red">{error}</Alert> : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>{filteredCampaigns.map((item) => <CampaignSummaryCard campaign={item} key={item.id} to={`/account/campaigns/${item.id}/manage`}/>)}</SimpleGrid>
          {campaigns.length > 0 && !filteredCampaigns.length && !error ? <Alert color="gray">No campaigns match the selected filters.</Alert> : null}
          {!campaigns.length && !error ? <Alert color="gray">Confirmed bookings selected for campaigns will appear here.</Alert> : null}
        </Stack>
      </Card>
    </Stack>;
  }

  if (!campaign) return <Container py="xl">{error ? <Alert color="red">{error}</Alert> : <Text>Loading campaign…</Text>}</Container>;
  return <><Container className="campaign-control-page" p={0} size="lg"><Stack gap="lg">
    <Card className="campaign-control-hero" p="xl"><Stack gap="md">
      <Group align="flex-start" justify="space-between"><Group align="center" gap="sm" wrap="nowrap"><Avatar alt={`${campaign.organizerDisplayName || "Organizer"} profile photo`} color="orange" radius="xl" size={48} src={campaign.organizerAvatarUrl || undefined}>{getInitials(campaign.organizerDisplayName || "Organizer")}</Avatar><Stack gap={4}><Badge color="cyan">{campaign.status}</Badge><Text className="campaign-hero-secondary" size="sm">Organized by <Text component="span" fw={800}>{campaign.organizerDisplayName || "Organizer"}</Text></Text></Stack></Group>{campaign.organizerTrustRating?.count ? <Group gap={6}><IconStar color="#ffd000" fill="#ffd000" size={20}/><Text fw={900}>{campaign.organizerTrustRating.average.toFixed(1)}</Text><Text className="campaign-hero-secondary" size="xs">({campaign.organizerTrustRating.count})</Text></Group> : null}</Group>
      <Title order={2}>{campaign.title}</Title>{campaign.description ? <RichCampaignDescription content={campaign.description}/> : null}
      <CampaignFundingProgress fundedAmountCents={acceptedAmountCents} targetAmountCents={fundingTargetCents}/>
      <CampaignHeroStats acceptedContributors={acceptedContributors} currency={campaign.currency} deadlineAt={campaign.deadlineAt} joinFeeCents={campaign.contributionFeeCents} requiredContributors={campaign.requiredContributors} reservedContributors={reservedContributors} scheduledEndAt={campaign.scheduledEndAt} scheduledStartAt={campaign.scheduledStartAt} timeZone={campaign.location?.timezone} underReviewContributors={underReviewContributors}/>
      <Button leftSection={<IconCopy size={18}/>} onClick={() => navigator.clipboard.writeText(shareUrl)} variant="subtle">Copy share link</Button>
    </Stack></Card>
    {booking ? <Card className="booking-detail-services-card" p="lg"><Stack gap="md"><Group justify="space-between"><div><Text className="finazze-section-label">BOOKING DETAILS</Text><Title order={3}>Booked items</Title></div><Badge variant="light">{booking.reference}</Badge></Group><Stack gap="sm">{booking.bundleItems.map((item) => <Paper className="group-funded-bundle-item" key={item.id || item.serviceSlug} p="sm"><Group align="center" gap="sm" wrap="nowrap">{item.imageUrl ? <button aria-label={`Preview ${item.serviceName} image`} className="group-funded-bundle-thumbnail" onClick={() => setServiceImagePreview({ name: item.serviceName, imageUrl: item.imageUrl || "" })} type="button"><img alt="" src={item.imageUrl}/><span aria-hidden="true"><IconEye size={16}/></span></button> : <div aria-hidden="true" className="group-funded-bundle-thumbnail group-funded-bundle-thumbnail--placeholder"><span>{item.serviceName.slice(0, 2).toUpperCase()}</span></div>}<Stack gap={2} style={{ flex: 1, minWidth: 0 }}><Group gap="sm" justify="space-between" wrap="nowrap"><Text fw={800}>{item.serviceName}</Text><Badge variant="light">x{item.bookingQuantity}</Badge></Group><Text c="dimmed" size="sm">{formatBookingScheduleTimeRange(item.scheduledStartAt, item.scheduledEndAt, booking.locationTimezone)}</Text></Stack></Group></Paper>)}</Stack><Paper className="campaign-booking-schedule" p="md" withBorder><Group align="flex-start" gap="sm" wrap="nowrap"><IconCalendarTime aria-hidden="true" size={22}/><Stack gap={2}><Text className="finazze-section-label">BOOKING SCHEDULE</Text><Text fw={800}>{formatBookingScheduleDate(booking.scheduledStartAt, booking.locationTimezone)}</Text><Text c="dimmed" size="sm">{formatBookingScheduleTimeRange(booking.scheduledStartAt, booking.scheduledEndAt, booking.locationTimezone)}</Text><Text c="dimmed" size="sm"><Text component={Link} fw={700} to={`/vendors/${booking.vendorSlug}`} td="underline">{booking.vendorName}</Text> · {booking.locationName}</Text>{booking.locationAddress ? <Text c="dimmed" size="xs">{booking.locationAddress}</Text> : null}</Stack></Group></Paper></Stack></Card> : null}
    {error ? <Alert color="red">{error}</Alert> : null}
    {!isOrganizer && ownContribution && participation ? <Card className={`campaign-participation-card campaign-participation-card--${participation.flavor}`} p="lg"><Stack gap="md">
      <Group align="flex-start" className="campaign-participation-header" justify="space-between" wrap="nowrap">
        <Group align="flex-start" gap="sm" wrap="nowrap"><participation.icon aria-hidden="true" className="campaign-participation-icon" size={28}/><Stack gap={2}><Text className="finazze-section-label">YOUR CAMPAIGN SLOT</Text><Title order={3}>{participation.title}</Title><Text c="dimmed" size="sm">{participation.description}</Text></Stack></Group>
        <Badge className="campaign-participation-slot" color={participation.badgeColor} size="lg" variant="filled">Slot #{ownContribution.slotNumber || "—"}</Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        <Paper p="md" radius="md" withBorder><Stack gap={5}><Text className="finazze-section-label">CONTRIBUTION</Text><Text fw={800}>{money(ownContribution.amountCents, ownContribution.currency)}</Text><Badge color={contributionStatus(ownContribution.status).color} variant="light" w="fit-content">{contributionStatus(ownContribution.status).label}</Badge></Stack></Paper>
        <Paper p="md" radius="md" withBorder><Stack gap={5}><Text className="finazze-section-label">PAYMENT PROOF</Text>{ownContribution.paymentProof ? <><Text fw={700} style={{ overflowWrap: "anywhere" }}>{ownContribution.paymentProof.fileName}</Text><Text c="dimmed" size="sm">{formatBytes(ownContribution.paymentProof.sizeBytes)}{ownContribution.submittedAt ? ` · ${new Date(ownContribution.submittedAt).toLocaleString()}` : ""}</Text>{ownContribution.paymentReference ? <Text c="dimmed" size="sm">Reference: {ownContribution.paymentReference}</Text> : null}<Button disabled={busy} leftSection={<IconEye size={16}/>} onClick={() => void viewEvidence(ownContribution.id)} variant="light">View payment proof</Button></> : <Text c="dimmed" size="sm">No payment proof submitted yet.</Text>}{reservationRemainingSeconds !== null ? <Text c={reservationRemainingSeconds ? "orange" : "red"} fw={700} size="sm">Proof due in {Math.floor(reservationRemainingSeconds / 60)}:{String(reservationRemainingSeconds % 60).padStart(2, "0")}</Text> : null}</Stack></Paper>
      </SimpleGrid>
      {ownContribution.status === "pending_proof" ? <Group justify="flex-end"><Button color="red" disabled={busy} onClick={() => setLeaveModalOpen(true)} variant="light">Leave campaign</Button></Group> : null}
      {["expired", "withdrawn"].includes(ownContribution.status) ? <Group justify="flex-end"><Button disabled={busy || !retryAvailable || ownContribution.reservationAttemptCount >= 2} loading={busy} onClick={() => void retryReservation()} variant="light">{retryAvailable ? "Retry reservation" : `Retry after ${new Date(ownContribution.retryAvailableAt!).toLocaleTimeString()}`}</Button></Group> : null}
    </Stack></Card> : null}
    {isOrganizer && campaign.status === "draft" ? <><DraftCampaignEditor campaign={campaign} token={token} onSaved={() => void load()}/><Card p="lg"><Stack><Title order={3}>Publish campaign</Title><Text c="dimmed">Share-link visibility is the default. Public discovery also requires vendor consent.</Text><Group><Button loading={busy} onClick={() => publish("private_link")}>Publish privately</Button><Button loading={busy} onClick={() => publish("public")} variant="light">Publish publicly</Button></Group></Stack></Card></> : null}
    {isOrganizer && campaign.status === "collecting" ? <Group><Button disabled={busy} onClick={unpublish} variant="light">Unpublish</Button><Button color="red" disabled={busy} onClick={cancel} variant="light">Cancel campaign</Button></Group> : null}
    {isOrganizer && campaign.status === "collected" ? <Button color="red" disabled={busy} onClick={cancel} variant="light">Cancel and reimburse contributors</Button> : null}
    {isOrganizer ? <Card p="lg"><Stack><Group justify="space-between"><Title order={3}>Contributors</Title><Badge>{joinedContributors} active</Badge></Group>{contributions.map((item, index) => <Card className="campaign-contributor-row" key={item.id} p="sm"><Stack gap="xs"><Group justify="space-between"><Group align="center" gap="sm" wrap="nowrap"><Avatar alt={`${item.contributorDisplayName || `Contributor ${index + 1}`} profile photo`} color="orange" radius="xl" size={44} src={item.contributorAvatarUrl || undefined}>{getInitials(item.contributorDisplayName || `Contributor ${index + 1}`)}</Avatar><div><Text fw={700}>{item.contributorDisplayName || `Contributor ${index + 1}`}</Text><Text c="dimmed" size="sm">{item.status.replaceAll("_", " ")}</Text>{item.trustRating?.count ? <Group gap={4}><IconStar color="#ffd000" fill="#ffd000" size={14}/><Text size="xs">{item.trustRating.average.toFixed(1)} ({item.trustRating.count})</Text></Group> : null}</div></Group><Group><Badge>{money(item.amountCents, item.currency)}</Badge>{["submitted", "review_overdue", "accepted", "rejected"].includes(item.status) ? <Button disabled={busy} onClick={() => viewEvidence(item.id)} size="xs" variant="subtle">View proof</Button> : null}{["submitted", "review_overdue"].includes(item.status) ? <Button disabled={busy} onClick={() => reviewContribution(item.id, "accept")} size="xs">Accept</Button> : null}{["pending_proof", "submitted", "review_overdue"].includes(item.status) ? <Button color="red" disabled={busy} onClick={() => reviewContribution(item.id, "reject")} size="xs" variant="light">Reject</Button> : null}{item.status === "refund_pending" ? <Button component="label" disabled={busy} size="xs" variant="light">Record reimbursement<input accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadReimbursementEvidence(item.id, file); }} type="file" /></Button> : null}{["refund_sent", "refund_confirmed", "refund_disputed"].includes(item.status) ? <Button disabled={busy} onClick={() => viewEvidence(item.id, "reimbursement")} size="xs" variant="subtle">View reimbursement</Button> : null}{["accepted", "rejected", "refund_pending", "refund_sent", "refund_confirmed", "refund_disputed"].includes(item.status) ? <CampaignRatingForm actionLabel="Rate contributor" campaignId={campaign.id} contributionId={item.id} onSaved={() => void load()} subjectLabel={item.contributorDisplayName || `Contributor ${index + 1}`} token={token}/> : null}</Group></Group></Stack></Card>)}</Stack></Card> : null}
    {!isOrganizer && ownContribution && (ownContribution.status === "pending_proof" || (ownContribution.status === "rejected" && ownContribution.resubmissionCount < 1)) ? <Card p="lg"><Stack><Title order={3}>Submit contribution proof</Title><Alert color="blue" title="Pay the organizer directly"><RichCampaignDescription content={campaign.paymentInstructions}/></Alert>{ownContribution.status === "rejected" && !retryAvailable ? <Alert color="orange">Corrected proof can be submitted after {new Date(ownContribution.retryAvailableAt!).toLocaleTimeString()}.</Alert> : null}<TextInput label="Payment reference" value={paymentReference} onChange={(event) => setPaymentReference(event.currentTarget.value)}/><FileInput accept="image/jpeg,image/png,image/webp,application/pdf" label="Proof file" leftSection={<IconUpload size={16}/>} value={proof} onChange={setProof}/><Button disabled={!proof || !paymentReference.trim() || (ownContribution.status === "rejected" && !retryAvailable)} loading={busy} onClick={uploadProof}>Submit proof</Button></Stack></Card> : null}
    {!isOrganizer && ownContribution && ownReimbursement?.status === "sent" ? <Card p="lg"><Stack><Title order={3}>Confirm your reimbursement</Title><Text>The organizer marked {money(ownReimbursement.amountCents, campaign.currency)} as sent. Review the evidence and confirm only after it reaches you.</Text><Group><Button disabled={busy} onClick={() => viewEvidence(ownContribution.id, "reimbursement")} variant="subtle">View reimbursement evidence</Button><Button loading={busy} onClick={() => resolveReimbursement("confirm")}>I received it</Button><Button color="red" loading={busy} onClick={() => resolveReimbursement("dispute")} variant="light">Not received / dispute</Button></Group></Stack></Card> : null}
    {!isOrganizer && ownContribution && ["collected", "cancelled"].includes(campaign.status) ? <Card p="lg"><Group justify="space-between"><Stack gap={2}><Text fw={700}>Rate the organizer</Text><Text c="dimmed" size="sm">Share a private trust rating after the campaign closes.</Text></Stack><CampaignRatingForm actionLabel="Rate organizer" campaignId={campaign.id} contributionId={ownContribution.id} onSaved={() => void load()} subjectLabel={campaign.organizerDisplayName || "organizer"} token={token}/></Group></Card> : null}
    {isOrganizer && campaign.events?.length ? <Card p="lg"><Stack gap="xs"><Title order={3}>Campaign history</Title>{campaign.events.map((event) => <Group align="flex-start" justify="space-between" key={event.id} wrap="nowrap"><Stack gap={0} style={{ minWidth: 0 }}><Text size="sm">{event.eventType.replaceAll("_", " ")}</Text><Text c="dimmed" size="xs">{event.actorDisplayName || "System"}</Text></Stack><Text c="dimmed" size="xs" ta="right">{new Date(event.createdAt).toLocaleString()}</Text></Group>)}</Stack></Card> : null}
    <Button leftSection={<IconRefresh size={16}/>} onClick={() => void load()} variant="subtle">Refresh</Button>
  </Stack></Container><Portal>{overlayNotices.length ? <Box className="dashboard-notification-stack" style={{ bottom: 24, left: "50%", maxWidth: "min(692px, calc(100vw - 32px))", position: "fixed", transform: "translateX(-50%)", pointerEvents: "none", zIndex: 1200 }}><Stack gap="sm" style={{ pointerEvents: "none" }}>{overlayNotices.slice(0, 3).map((notice) => <Notification color="blue" icon={<IconBellRinging size={20}/>} key={notice.id} onClose={() => dismissNotice(notice.id)} radius="md" style={{ boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)", pointerEvents: "auto" }} withBorder><Stack gap={2}><Text fw={800}>{notice.title}</Text><Text style={{ overflowWrap: "anywhere" }}>{notice.body}</Text></Stack></Notification>)}</Stack></Box> : null}</Portal><ConfirmActionModal cancelLabel="Keep my slot" confirmLabel="Leave campaign" description="This releases your slot immediately. You can join again later only if a slot is still available." loading={busy} onClose={() => setLeaveModalOpen(false)} onConfirm={() => void leaveCampaign()} opened={leaveModalOpen} title="Leave campaign"/><PromptActionModal confirmColor="red" confirmLabel={campaign.status === "collected" ? "Cancel and reimburse" : "Cancel campaign"} description="This reason is recorded in the campaign history and may be shown to affected contributors." error={error} eyebrow="CAMPAIGN MANAGEMENT" label="Cancellation reason" loading={busy} maxLength={500} onChange={setCancelReason} onClose={() => { setCancelReasonModalOpen(false); setCancelReason(""); }} onConfirm={() => void submitCancellation()} opened={cancelReasonModalOpen} placeholder="Explain why the campaign is being cancelled" title="Cancel campaign" value={cancelReason}/><PromptActionModal confirmColor="red" confirmLabel="Reject contributor" description={rejectionContribution?.status === "pending_proof" ? "This releases the slot immediately. The contributor will not be able to submit payment proof for this reservation." : "The contributor will see this reason and may submit corrected payment proof."} error={error} eyebrow="CONTRIBUTION REVIEW" label="Rejection reason" loading={busy} maxLength={500} onChange={setRejectionReason} onClose={() => { setRejectionContributionId(null); setRejectionReason(""); }} onConfirm={() => void submitContributionRejection()} opened={Boolean(rejectionContributionId)} placeholder="Explain why this contributor is being rejected" title="Reject contributor" value={rejectionReason}/><Modal centered className="customer-modal" onClose={() => setServiceImagePreview(null)} opened={Boolean(serviceImagePreview)} radius="lg" size="xl" title={serviceImagePreview?.name || "Service image"}>{serviceImagePreview ? <div className="service-image-preview-shell"><img alt={serviceImagePreview.name} src={serviceImagePreview.imageUrl}/></div> : null}</Modal><Modal centered className="customer-modal payment-proof-modal" onClose={() => setProofPreview(null)} opened={Boolean(proofPreview)} size="lg" title={<Stack className="getprio-modal-title" gap={2}><Text className="getprio-modal-eyebrow">CONTRIBUTION EVIDENCE</Text><Text className="getprio-modal-heading">Payment proof</Text></Stack>} transitionProps={{ transition: "slide-up", duration: 240, timingFunction: "ease-out" }}>{proofPreview ? <div className="payment-proof-modal-shell"><ScrollArea className="payment-proof-modal-main" scrollbars="y" scrollbarSize={8} styles={{ root: { flex: 1, minHeight: 0 }, viewport: { height: "100%" } }} type="hover"><Stack gap="md"><Paper p="md" radius="md" withBorder><Text className="finazze-section-label">FILE</Text><Text fw={700} style={{ overflowWrap: "anywhere" }}>{proofPreview.fileName}</Text><Text c="dimmed" size="sm">{formatBytes(proofPreview.sizeBytes)}{proofPreview.submittedAt ? ` · ${new Date(proofPreview.submittedAt).toLocaleString()}` : ""}</Text>{proofPreview.paymentReference ? <Text c="dimmed" size="sm">Reference: {proofPreview.paymentReference}</Text> : null}</Paper>{proofPreview.contentType.startsWith("image/") ? <Image alt={`Payment proof ${proofPreview.fileName}`} fit="contain" mah={520} radius="md" src={proofPreview.url}/> : <iframe className="campaign-proof-document" src={proofPreview.url} title={`Payment proof ${proofPreview.fileName}`}/>}</Stack></ScrollArea><Group className="customer-modal-actions payment-proof-modal-actions" justify="flex-end"><Button component="a" href={proofPreview.url} leftSection={<IconExternalLink size={16}/>} rel="noopener noreferrer" size="lg" target="_blank" variant="light">Open proof in new tab</Button></Group></div> : null}</Modal></>;
}
