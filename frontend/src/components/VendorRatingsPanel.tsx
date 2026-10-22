import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import {
  OperationAlert,
  OperationButton,
  OperationCheckbox,
  OperationEmpty,
  OperationPanel,
  OperationQueryState,
  OperationScope,
} from "../vendor/OperationsUi";
import { Badge } from "../vendor/components/ui/badge";

type Review = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  public_visible: boolean;
  moderation_status: string;
};
export function VendorRatingsPanel({
  token,
  tenantSlug,
  onBusyChange,
}: {
  token: string;
  tenantSlug: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const queryKey = ["vendor-ratings", token, tenantSlug];
  const query = useQuery({
    queryKey: [...queryKey, page],
    queryFn: () =>
      apiRequest<{ reviews: Review[]; hasMore: boolean }>(
        `/vendor/tenant/${encodeURIComponent(tenantSlug)}/ratings?page=${page}&pageSize=10`,
        { token },
      ),
  });
  useEffect(() => {
    onBusyChange?.(Boolean(busy));
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  async function toggle(review: Review) {
    if (
      busy ||
      query.isError ||
      query.isFetching ||
      review.moderation_status !== "active"
    )
      return;
    setBusy(review.id);
    setError("");
    try {
      await apiRequest(
        `/vendor/tenant/${encodeURIComponent(tenantSlug)}/ratings/${encodeURIComponent(review.id)}`,
        { token, method: "PATCH", body: { visible: !review.public_visible } },
      );
      await client.invalidateQueries({ queryKey });
    } catch (next) {
      setError(
        next instanceof Error
          ? next.message
          : "Could not update review visibility.",
      );
    } finally {
      setBusy(null);
    }
  }
  const locked = Boolean(busy) || query.isFetching;
  return (
    <OperationScope busy={locked}>
      <div className="config-page">
        <p className="ops-muted">
          Choose which reviews appear on your public vendor page. Your overall
          rating includes all active ratings, including reviews hidden from the
          public list.
        </p>
        {error ? (
          <OperationAlert color="red" title="Visibility was not updated">
            {error}
          </OperationAlert>
        ) : null}
        <OperationQueryState
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
        {!query.isPending && !query.isError && query.data ? (
          <>
            {!query.data.reviews.length ? (
              <OperationEmpty
                title="No reviews on this page"
                text="Customer reviews of your business appear here."
              />
            ) : null}
            {query.data.reviews.map((review) => (
              <OperationPanel key={review.id}>
                <div className="queue-stack">
                  <div className="ops-row ops-between">
                    <time dateTime={review.created_at}>
                      {new Date(review.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                    <span aria-label={`${review.stars} out of 5 stars`}>
                      {"★".repeat(review.stars)}
                      {"☆".repeat(5 - review.stars)}
                    </span>
                  </div>
                  <p className="rating-comment">
                    {review.comment || "No comment"}
                  </p>
                  <div className="ops-row ops-between">
                    <Badge variant="secondary">
                      {review.moderation_status}
                    </Badge>
                    <OperationScope
                      busy={locked || review.moderation_status !== "active"}
                    >
                      <OperationCheckbox
                        label={`Show review from ${new Date(review.created_at).toLocaleDateString("en-GB")} publicly`}
                        checked={review.public_visible}
                        onCheckedChange={() => void toggle(review)}
                      />
                    </OperationScope>
                  </div>
                  {review.moderation_status !== "active" ? (
                    <p className="ops-muted">
                      Public visibility is controlled by moderation for this
                      review.
                    </p>
                  ) : null}
                  {busy === review.id ? (
                    <p role="status" className="ops-muted">
                      Saving visibility…
                    </p>
                  ) : null}
                </div>
              </OperationPanel>
            ))}
            <nav aria-label="Review pages" className="ops-row ops-between">
              <OperationButton
                variant="outline"
                disabled={page === 1 || locked}
                onClick={() => {
                  setError("");
                  setPage((value) => Math.max(1, value - 1));
                }}
              >
                Previous
              </OperationButton>
              <span aria-live="polite">Page {page}</span>
              <OperationButton
                variant="outline"
                disabled={!query.data.hasMore || locked}
                onClick={() => {
                  setError("");
                  setPage((value) => value + 1);
                }}
              >
                Next
              </OperationButton>
            </nav>
          </>
        ) : null}
      </div>
    </OperationScope>
  );
}
