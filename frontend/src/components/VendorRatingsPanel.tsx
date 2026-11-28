import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OperationPanel, OperationAlert } from "../vendor/OperationsUi";
import { Badge } from "../vendor/components/ui/badge";
import { Button } from "../vendor/components/ui/button";
import { Switch } from "../vendor/components/ui/switch";
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
  return (
    <div className="queue-stack">
      <p className="ops-muted">Choose which reviews appear on your public vendor page. Your overall rating includes all active ratings.</p>
      {error && <OperationAlert color="red">{error}</OperationAlert>}
      {query.isPending && <p role="status">Loading reviews…</p>}
      {query.isError && (
        <OperationAlert color="red">Could not load reviews. <Button variant="ghost" onClick={() => void query.refetch()}>Try again</Button></OperationAlert>
      )}
      {query.isSuccess && <>
        {!query.data.reviews.length && <p>No reviews yet.</p>}
        {query.data.reviews.map(review => (
          <OperationPanel key={review.id}>
            <div className="queue-stack">
              <div className="ops-row ops-between">
                <time className="v:text-sm" dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time>
                <span aria-label={`${review.stars} out of 5 stars`} className="v:text-amber-500">{"★".repeat(review.stars)}{"☆".repeat(5 - review.stars)}</span>
              </div>
              <p className="v:whitespace-pre-wrap v:wrap-anywhere">{review.comment || "No comment"}</p>
              <div className="ops-row ops-between">
                <Badge variant="outline">{review.moderation_status}</Badge>
                <label className="v:flex v:items-center v:gap-2">
                  <Switch checked={review.public_visible} disabled={busy !== null || review.moderation_status !== "active"} onCheckedChange={() => void toggle(review)} />
                  Show publicly
                </label>
              </div>
            </div>
          </OperationPanel>
        ))}
        <nav className="ops-row ops-between" aria-label="Review pages">
          <Button variant="outline" disabled={page === 1 || busy !== null} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page}</span>
          <Button variant="outline" disabled={!query.data.hasMore || busy !== null} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>
      </>}
    </div>
  );
}
