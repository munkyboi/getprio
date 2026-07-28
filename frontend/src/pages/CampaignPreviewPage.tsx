import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Container, Group, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useNavigate, useParams } from "react-router-dom";
import type { PublicOrganizerCampaign } from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";
import RichCampaignDescription from "../components/RichCampaignDescription";
import { PromptActionModal } from "../components/PromptActionModal";

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
        color: "teal",
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
  return <><Container size="md" py="xl"><Card className="campaign-control-hero" p="xl"><Stack gap="lg"><Group justify="space-between"><Stack gap={3}><Badge>{campaign.vendor.name}</Badge><Text className="campaign-hero-secondary" size="sm">Organized by <Text component="span" fw={800}>{campaign.organizerDisplayName}</Text></Text></Stack><Text>{campaign.location.name}</Text></Group><Title order={2}>{campaign.title}</Title>{campaign.description ? <RichCampaignDescription content={campaign.description}/> : null}<Progress color="orange" size="md" value={progress}/><SimpleGrid cols={{ base: 1, xs: 3 }}><Card className="campaign-hero-stat"><Text size="xs">Join fee</Text><Text fw={900}>{new Intl.NumberFormat("en-PH", { style: "currency", currency: campaign.currency }).format(campaign.contributionFeeCents / 100)}</Text></Card><Card className="campaign-hero-stat"><Text size="xs">Schedule</Text><Text fw={900}>{new Date(campaign.scheduledStartAt).toLocaleDateString()}</Text></Card><Card className="campaign-hero-stat"><Text size="xs">Contributors</Text><Text fw={900}>{campaign.filledContributors}/{campaign.requiredContributors}</Text></Card></SimpleGrid>{error ? <Alert color="red">{error}</Alert> : null}<Button loading={busy} onClick={join} size="lg">{user ? "Join campaign" : "Sign in to join"}</Button>{user ? <Button color="red" disabled={busy} onClick={report} variant="subtle">Report campaign</Button> : null}<Text c="dimmed" size="xs">GetPrio records campaign activity but does not collect, hold, transfer, or refund contributor funds.</Text></Stack></Card></Container><PromptActionModal confirmColor="red" confirmLabel="Submit report" description="Your report is private and will be reviewed by Platform Admin." error={error} eyebrow="CAMPAIGN SAFETY" label="Why are you reporting this campaign?" loading={busy} maxLength={1000} onChange={setReportDetails} onClose={() => { setReportModalOpen(false); setReportDetails(""); }} onConfirm={() => void submitReport()} opened={reportModalOpen} placeholder="Briefly describe the issue" title="Report campaign" value={reportDetails}/></>;
}
