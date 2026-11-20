
import { ChevronRight } from "lucide-react";
import { ResponsiveDrawer } from "../components/vendor/ResponsiveDrawer";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../api/client";
import { getErrorMessage } from "../../utils/errors";
import { Button } from "../components/ui";
import {
  CustomerPage,
  CustomerError,
} from "../components/account/CustomerPage";
type Favorite = {
  slug: string;
  name: string;
  category?: string;
  logoUrl?: string;
};
export function CustomerFavorites({ compact = false }: { compact?: boolean }) {
  const { user, token } = useAuth();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["customer-favorites", user?.id],
    queryFn: ({ signal }) =>
      apiRequest<{ vendors: Favorite[] }>("/account/favorites", {
        token: token!,
        signal,
      }),
    enabled: !!token,
  });
  const remove = useMutation({
    mutationFn: (slug: string) =>
      apiRequest(`/account/favorites/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        token: token!,
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["customer-favorites", user?.id] }),
  });
  return (
    <section className="customer-record-list">
      <div className="customer-inline-between">
        <h2>Favorites</h2>
        {compact && (query.data?.vendors.length || 0) > 5 ? (
          <ResponsiveDrawer title="Favorites" trigger="View all">
            <CustomerFavorites />
          </ResponsiveDrawer>
        ) : null}
      </div>
      {query.isLoading ? <p role="status">Loading favorites…</p> : null}
      {query.error || remove.error ? (
        <CustomerError
          error={getErrorMessage(query.error || remove.error)}
          retry={() => void query.refetch()}
        />
      ) : null}
      {(compact ? query.data?.vendors.slice(0, 5) : query.data?.vendors)?.map(
        (v) => (
          <div className="customer-favorite-item" key={v.slug}>
            <Link
              className="customer-visit-row"
              to={`/vendors/${encodeURIComponent(v.slug)}`}
            >
              <img
                src={v.logoUrl || "/logo.svg"}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = "/logo.svg";
                }}
                alt=""
                width={48}
                height={48}
              />
              <div>
                <strong>{v.name}</strong>
                <p>{v.category}</p>
              </div>
              <ChevronRight />
            </Link>
            {!compact ? (
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(v.slug)}
              >
                Remove favorite
              </Button>
            ) : null}
          </div>
        ),
      )}
      {!query.isLoading && !query.error && !query.data?.vendors.length ? (
        <p>Save a vendor to find it here.</p>
      ) : null}
    </section>
  );
}
export default function CustomerFavoritesPage() {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <CustomerPage title="Favorites" back="/account/settings">
      <CustomerFavorites />
    </CustomerPage>
  );
}
