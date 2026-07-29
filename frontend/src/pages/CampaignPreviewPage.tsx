import { useEffect, useState } from "react";
import { Alert, Avatar, Badge, Button, Card, Container, Group, Paper, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCalendarTime, IconCircleCheck, IconStarFilled } from "@tabler/icons-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PublicOrganizerCampaign } from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";
import RichCampaignDescription from "../components/RichCampaignDescription";
import { PromptActionModal } from "../components/PromptActionModal";
import { formatBookingScheduleDate, formatBookingScheduleTimeRange } from "../utils/dates";

function getInitials(value = "") {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "U";
}

export default function CampaignPreviewPage() {
  const { publicToken = "" } = useParams(); const navigate = useNavigate();
  const { token, user, loading } = useAuth(); const [campaign, setCampaign] = useState<PublicOrganizerCampaign | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportDetails, setReportDetails] = useState("");
  useEffect(() => { apiRequest<{ campaign: PublicOrganizerCampaign }>(`/public/campaigns/${encodeURIComponent(publicToken)}`).then((data) => setCampaign(data.campaign)).catch((next) => setError(getErrorMessage(next))); }, [publicToken]);
  if (loading) return null;
  async function join() { if (!campaign) return; if (!user || !token) { navigate(`/login?returnTo=${encodeURIComponent(`/campaign/${publicToken}`)}`); return; } setBusy(true); try { await apiRequest(`/account/campaigns/${campaign.id}/join`, { method: "POST", token, body: { website: "" } }); navigate(`/account/campaigns/${campaign.id}/manage`); } catch (next) { setError(getErrorMessage(next)); } finally { setBusy(false); } }
  function report() {
    if (!campaign) return;
    if (!user || !token) {
      navigate(`/login?returnTo=${encodeURIComponent(`/campaign/${publicToken}`)}`);
      return;
    }
    setError("");
    setReportDetails("");
    setReportModalOpen(true);
  }
  async function submitReport() {
    const details = reportDetails.trim();
    if (!campaign || !token || !details) return;
    setBusy(true);
    try {
      await apiRequest(`/account/campaigns/${campaign.id}/report`, { method: "POST", token, body: { category: "other", details, website: "" } });
      setError("");
      setReportModalOpen(false);
      setReportDetails("");
      notifications.show({
        className: "getprio-notification getprio-notification--success",
        color: "teal",
        icon: <IconCircleCheck size={20} />,
        title: "Report submitted",
        message: "Platform Admin will review this campaign."
      });
    } catch (next) {
      setError(getErrorMessage(next));
    } finally {
      setBusy(false);
    }
  }
  if (!campaign) return <Container py="xl">{error ? <Alert color="red">{error}</Alert> : <Text>Loading campaign…</Text>}</Container>;
  const progress = Math.min(100, campaign.acceptedContributors / campaign.requiredContributors * 100);
  const booking = campaign.booking;
  return <><Container size="md" py="xl"><Stack gap="lg"><Card className="campaign-control-hero" p="xl"><Stack gap="lg"><Group align="flex-start" justify="space-between"><Group align="center" gap="sm" wrap="nowrap"><Avatar alt={`${campaign.organizerDisplayName} profile photo`} color="orange" radius="xl" size={48} src={campaign.organizerAvatarUrl || undefined}>{getInitials(campaign.organizerDisplayName)}</Avatar><Stack gap={4}><Badge>{campaign.vendor.name}</Badge><Text className="campaign-hero-secondary" size="sm">Organized by <Text component="span" fw={800}>{campaign.organizerDisplayName}</Text></Text></Stack></Group><Stack align="flex-end" gap={4}>{campaign.organizerTrustRating?.count ? <Group gap={6}><IconStarFilled color="#ffd000" fill="#ffd000" size={20}/><Text fw={900}>{campaign.organizerTrustRating.average.toFixed(1)}</Text><Text className="campaign-hero-secondary" size="xs">({campaign.organizerTrustRating.count})</Text></Group> : null}<Text className="campaign-hero-secondary" size="sm">{campaign.location.name}</Text></Stack></Group><Title order={2}>{campaign.title}</Title>{campaign.description ? <RichCampaignDescription content={campaign.description}/> : null}<Progress color="orange" size="md" value={progress}/><SimpleGrid cols={{ base: 1, xs: 3 }}><Card className="campaign-hero-stat"><Text size="xs">Join fee</Text><Text fw={900}>{new Intl.NumberFormat("en-PH", { style: "currency", currency: campaign.currency }).format(campaign.contributionFeeCents / 100)}</Text></Card><Card className="campaign-hero-stat"><Text size="xs">Schedule</Text><Text fw={900}>{new Date(campaign.scheduledStartAt).toLocaleDateString()}</Text></Card><Card className="campaign-hero-stat"><Text size="xs">Contributors</Text><Text fw={900}>{campaign.filledContributors}/{campaign.requiredContributors}</Text></Card></SimpleGrid>{error ? <Alert className="campaign-preview-alert" color="red" icon={<IconAlertCircle size={20} />}>{error}</Alert> : null}<Button loading={busy} onClick={join} size="lg">{user ? "Join campaign" : "Sign in to join"}</Button>{user ? <Button color="red" disabled={busy} onClick={report} variant="subtle">Report campaign</Button> : null}<Text c="dimmed" size="xs">GetPrio records campaign activity but does not collect, hold, transfer, or refund contributor funds.</Text></Stack></Card>{booking ? <Card className="booking-detail-services-card" p="lg"><Stack gap="md"><Group justify="space-between"><div><Text className="finazze-section-label">BOOKING DETAILS</Text><Title order={3}>Booked items</Title></div><Badge variant="light">Confirmed booking</Badge></Group><Stack gap="sm">{booking.bundleItems.map((item) => <Paper className="group-funded-bundle-item" key={item.id || item.serviceSlug} p="sm"><Group align="center" gap="sm" wrap="nowrap">{item.imageUrl ? <div className="group-funded-bundle-thumbnail"><img alt="" src={item.imageUrl}/></div> : <div aria-hidden="true" className="group-funded-bundle-thumbnail group-funded-bundle-thumbnail--placeholder"><span>{item.serviceName.slice(0, 2).toUpperCase()}</span></div>}<Stack gap={2} style={{ flex: 1, minWidth: 0 }}><Group gap="sm" justify="space-between" wrap="nowrap"><Text fw={800}>{item.serviceName}</Text><Badge variant="light">x{item.bookingQuantity}</Badge></Group><Text c="dimmed" size="sm">{formatBookingScheduleTimeRange(item.scheduledStartAt, item.scheduledEndAt, booking.locationTimezone)}</Text></Stack></Group></Paper>)}</Stack><Paper className="campaign-booking-schedule" p="md" withBorder><Group align="flex-start" gap="sm" wrap="nowrap"><IconCalendarTime aria-hidden="true" size={22}/><Stack gap={2}><Text className="finazze-section-label">BOOKING SCHEDULE</Text><Text fw={800}>{formatBookingScheduleDate(booking.scheduledStartAt, booking.locationTimezone)}</Text><Text c="dimmed" size="sm">{formatBookingScheduleTimeRange(booking.scheduledStartAt, booking.scheduledEndAt, booking.locationTimezone)}</Text><Text c="dimmed" size="sm"><Text component={Link} fw={700} to={`/vendors/${booking.vendorSlug}`} td="underline">{booking.vendorName}</Text> · {booking.locationName}</Text>{booking.locationAddress ? <Text c="dimmed" size="xs">{booking.locationAddress}</Text> : null}</Stack></Group></Paper></Stack></Card> : null}</Stack></Container><PromptActionModal confirmColor="red" confirmLabel="Submit report" description="Your report is private and will be reviewed by Platform Admin." error={error} eyebrow="CAMPAIGN SAFETY" label="Why are you reporting this campaign?" loading={busy} maxLength={1000} onChange={setReportDetails} onClose={() => { setReportModalOpen(false); setReportDetails(""); }} onConfirm={() => void submitReport()} opened={reportModalOpen} placeholder="Briefly describe the issue" title="Report campaign" value={reportDetails}/></>;
}
