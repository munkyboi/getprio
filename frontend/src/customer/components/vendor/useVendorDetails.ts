import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PublicVendorProfileResponse,
  PublicVendorService,
  QueueSnapshot,
} from "@shared";
import { apiRequest, API_BASE_URL } from "../../../api/client";

export type VendorRatings = {
  rating: { average: number; count: number };
  reviews: Array<{
    id: string;
    stars: number;
    comment?: string;
    vendor_reply?: string;
    customer_display_name: string;
    created_at: string;
  }>;
  pagination?: { page: number; totalPages: number; totalItems: number };
};
export function useVendorDetails(
  slug: string,
  locationSlug: string,
  token?: string,
  userId?: string,
) {
  const client = useQueryClient();
  const [liveInterrupted, setLiveInterrupted] = useState(false);
  const profile = useQuery({
    queryKey: ["customer-vendor", slug],
    queryFn: ({ signal }) =>
      apiRequest<PublicVendorProfileResponse>(
        `/public/vendors/${encodeURIComponent(slug)}`,
        { signal },
      ),
    enabled: !!slug,
  });
  const vendor = profile.data?.vendor;
  const selected =
    vendor?.locations.find((item) => item.slug === locationSlug) ||
    vendor?.locations.find((item) => item.isPrimary) ||
    vendor?.locations[0];
  const branch = selected?.slug;
  const queueKey = ["customer-vendor-queue", slug, branch];
  const queue = useQuery({
    queryKey: queueKey,
    queryFn: ({ signal }) =>
      apiRequest<QueueSnapshot>(
        `/public/tenant/${encodeURIComponent(slug)}/location/${encodeURIComponent(branch!)}/queue`,
        { signal },
      ),
    enabled: !!(vendor?.capabilities.queue && branch),
  });
  const services = useQuery({
    queryKey: ["customer-vendor-services", slug, branch],
    queryFn: async ({ signal }) => {
      const data = await apiRequest<{ services: PublicVendorService[] }>(
        `/public/vendors/${encodeURIComponent(slug)}/locations/${encodeURIComponent(branch!)}/services`,
        { signal },
      );
      if (!Array.isArray(data.services))
        throw new Error("Services could not be read. Please try again.");
      return data.services;
    },
    enabled: !!(vendor?.capabilities.booking && branch),
  });
  const ratings = useQuery({
    queryKey: ["customer-vendor-ratings", slug],
    queryFn: ({ signal }) =>
      apiRequest<VendorRatings>(
        `/public/vendors/${encodeURIComponent(slug)}/ratings?page=1&pageSize=5`,
        { signal },
      ),
    enabled: !!vendor,
  });
  const favorites = useQuery({
    queryKey: ["customer-favorites", userId],
    queryFn: ({ signal }) =>
      apiRequest<{ vendors: Array<{ slug: string }> }>("/account/favorites", {
        token,
        signal,
      }),
    enabled: !!(token && vendor),
  });
  const favorite = !!favorites.data?.vendors.some((item) => item.slug === slug);
  const favoriteChange = useMutation({
    mutationFn: () =>
      apiRequest<{ favorite: boolean }>(
        `/account/favorites/${encodeURIComponent(slug)}`,
        { method: favorite ? "DELETE" : "PUT", token },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["customer-favorites", userId],
      });
    },
  });
  useEffect(() => {
    setLiveInterrupted(false);
    if (!vendor?.capabilities.queue || !branch) return;
    // The established public queue stream is an invalidation signal. Read the
    // authoritative endpoint, never infer queue state from event payloads.
    const stream = new EventSource(
      `${API_BASE_URL}/public/tenant/${encodeURIComponent(slug)}/location/${encodeURIComponent(branch)}/stream`,
    );
    const refresh = () => {
      void Promise.all([
        client.invalidateQueries({
          queryKey: ["customer-vendor-queue", slug, branch],
        }),
        client.invalidateQueries({ queryKey: ["customer-vendor", slug] }),
        client.invalidateQueries({
          queryKey: ["customer-vendor-services", slug, branch],
        }),
      ]);
    };
    stream.onmessage = refresh;
    stream.onopen = () => {
      setLiveInterrupted(false);
      refresh();
    };
    stream.onerror = () => setLiveInterrupted(true);
    return () => stream.close();
  }, [slug, branch, vendor?.capabilities.queue, client]);
  return {
    profile,
    vendor,
    selected,
    queue,
    services,
    ratings,
    favorites,
    favorite,
    favoriteChange,
    liveInterrupted,
  };
}
