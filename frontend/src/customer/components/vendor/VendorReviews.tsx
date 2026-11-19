import { Alert } from "../shadcn/alert";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star as IconStar } from "lucide-react";
import { apiRequest } from "../../../api/client";
import { getErrorMessage } from "../../../utils/errors";
import { Button, Card } from "../ui";
import type { VendorRatings } from "./useVendorDetails";
export function VendorReviews({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["customer-vendor-all-reviews", slug, page],
    queryFn: ({ signal }) =>
      apiRequest<VendorRatings>(
        `/public/vendors/${encodeURIComponent(slug)}/ratings?page=${page}&pageSize=10`,
        { signal },
      ),
  });
  if (query.isPending) return <p role="status">Loading reviews…</p>;
  if (query.error)
    return (
      <Alert role="alert">
        <p>{getErrorMessage(query.error)}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </Alert>
    );
  return (
    <>
      {query.data?.reviews.map((review) => (
        <Card className="customer-vendor-review" key={review.id}>
          <strong>{review.customer_display_name}</strong>
          <p
            className="customer-rating-stars"
            aria-label={`${review.stars} out of 5 stars`}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <IconStar
                key={star}
                aria-hidden="true"
                data-filled={star <= review.stars}
              />
            ))}
          </p>
          <p>{review.comment || "No written review."}</p>
          {review.vendor_reply ? (
            <p>
              <strong>Vendor reply:</strong> {review.vendor_reply}
            </p>
          ) : null}
        </Card>
      ))}
      {!query.data?.reviews.length ? <p>No reviews yet.</p> : null}
      <div className="customer-review-pagination">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage((current) => current - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="outline"
          disabled={
            !query.data?.pagination || page >= query.data.pagination.totalPages
          }
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </Button>
      </div>
    </>
  );
}
