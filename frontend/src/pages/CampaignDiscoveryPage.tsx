import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Group, Progress, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { Link, Navigate } from "react-router-dom";
import type { PublicOrganizerCampaign } from "@shared";
import { customerAccountApi } from "../api/customerAccount";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";
import RichCampaignDescription from "../components/RichCampaignDescription";

export default function CampaignDiscoveryPage() {
  const { token, user, loading } = useAuth();
  const [campaigns, setCampaigns] = useState<PublicOrganizerCampaign[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", date: "" });
  const loadRequestId = useRef(0);
  const load = useCallback(async (requestedFilters: typeof filters) => {
    if (!token) return;
    const requestId = ++loadRequestId.current;
    setError("");
    try {
      const data = await customerAccountApi.getCampaignDiscovery(token, requestedFilters);
      if (requestId === loadRequestId.current) setCampaigns(data.campaigns);
    } catch (next) {
      if (requestId === loadRequestId.current) setError(getErrorMessage(next));
    }
  }, [token]);
  useEffect(() => { void load({ search: "", date: "" }); }, [load]);
  if (loading) return null;
  if (!user || !token) return <Navigate replace to="/login" />;
  return <Card className="finazze-auth-card customer-account-card campaign-discovery-page" p="xl"><Stack gap="lg"><div><Text className="finazze-section-label">SIGNED-IN DISCOVERY</Text><Title order={2}>Public campaigns</Title><Text c="dimmed">Nearest deadline first. Payment details and contributor identities stay private.</Text></div><Card className="campaign-discovery-filters" component="form" onSubmit={(event) => { event.preventDefault(); void load(filters); }} p="md"><SimpleGrid cols={{ base: 1, md: 3 }}><TextInput label="Search campaigns" maxLength={120} placeholder="Campaign title, organizer, vendor, or address" type="search" value={filters.search} onChange={(event) => { const search = event.currentTarget.value; setFilters((current) => ({ ...current, search })); }}/><TextInput label="Booking date" type="date" value={filters.date} onChange={(event) => { const date = event.currentTarget.value; setFilters((current) => ({ ...current, date })); }}/><Button mt={{ base: 0, md: 25 }} type="submit">Apply filters</Button></SimpleGrid></Card>{error ? <Alert color="red">{error}</Alert> : null}<SimpleGrid cols={{ base: 1, md: 2 }}>{campaigns.map((campaign) => { const progress = Math.min(100, campaign.acceptedContributors / campaign.requiredContributors * 100); return <Card className="campaign-list-card" key={campaign.id} p="lg"><Stack><Group justify="space-between"><Badge>{campaign.vendor.name}</Badge><Text fw={800}>{new Intl.NumberFormat("en-PH", { style: "currency", currency: campaign.currency }).format(campaign.contributionFeeCents / 100)}</Text></Group><Title order={3}>{campaign.title}</Title><Text c="dimmed">{campaign.service.name} · {campaign.location.name}</Text>{campaign.description ? <RichCampaignDescription className="rich-campaign-description campaign-list-description campaign-discovery-description" content={campaign.description}/> : null}<Progress value={progress}/><Group justify="space-between"><Text size="sm">{campaign.acceptedContributors}/{campaign.requiredContributors} filled</Text><Text size="sm">Ends {new Date(campaign.deadlineAt).toLocaleDateString()}</Text></Group><Button className="campaign-discovery-cta" component={Link} to={`/campaign/${campaign.publicToken}`}>View campaign</Button></Stack></Card>; })}</SimpleGrid>{!campaigns.length && !error ? <Alert color="gray">No public campaigns are collecting right now.</Alert> : null}</Stack></Card>;
}
