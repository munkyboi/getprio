import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Group, Stack, Switch, Text } from "@mantine/core";
import { apiRequest } from "../api/client";

type Review = { id: string; stars: number; comment: string | null; created_at: string; public_visible: boolean; moderation_status: string };
export function VendorRatingsPanel({ token, tenantSlug }: { token: string; tenantSlug: string }) {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["vendor-ratings", tenantSlug, page],
    queryFn: () => apiRequest<{ reviews: Review[]; hasMore: boolean }>(`/vendor/tenant/${encodeURIComponent(tenantSlug)}/ratings?page=${page}&pageSize=10`, { token })
  });
  async function toggle(review: Review) {
    setBusy(review.id); setError("");
    try {
      await apiRequest(`/vendor/tenant/${encodeURIComponent(tenantSlug)}/ratings/${review.id}`, { token, method: "PATCH", body: { visible: !review.public_visible } });
      await client.invalidateQueries({ queryKey: ["vendor-ratings", tenantSlug] });
    } catch (next) { setError(next instanceof Error ? next.message : "Could not update review visibility."); }
    finally { setBusy(null); }
  }
  return <Stack>
    <Text c="dimmed">Choose which reviews appear on your public vendor page. Your overall rating includes all active ratings.</Text>
    {error && <Alert color="red">{error}</Alert>}
    {query.isPending ? <Text>Loading reviews…</Text> : query.isError ? <Alert color="red">Could not load reviews. <Button variant="subtle" onClick={() => void query.refetch()}>Try again</Button></Alert> : <>
      {!query.data.reviews.length && <Text>No reviews yet.</Text>}
      {query.data.reviews.map(review => <Card withBorder key={review.id}>
        <Stack gap="sm">
          <Group justify="space-between"><Text size="sm">{new Date(review.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Text><Text aria-label={`${review.stars} out of 5 stars`} c="yellow">{"★".repeat(review.stars)}{"☆".repeat(5 - review.stars)}</Text></Group>
          <Text style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{review.comment || "No comment"}</Text>
          <Group justify="space-between"><Badge>{review.moderation_status}</Badge><Switch label="Show publicly" checked={review.public_visible} disabled={busy !== null || review.moderation_status !== "active"} onChange={() => void toggle(review)} /></Group>
        </Stack>
      </Card>)}
      <Group justify="space-between"><Button variant="default" disabled={page === 1 || busy !== null} onClick={() => setPage(page - 1)}>Previous</Button><Text>Page {page}</Text><Button variant="default" disabled={!query.data.hasMore || busy !== null} onClick={() => setPage(page + 1)}>Next</Button></Group>
    </>}
  </Stack>;
}
