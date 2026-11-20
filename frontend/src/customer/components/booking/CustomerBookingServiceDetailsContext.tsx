import { createContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiRequest } from "../../../api/client";

type ServiceDetails = { slug: string; imageUrl?: string; priceDisplay?: string; description?: string };
export const CustomerBookingServiceDetailsContext = createContext<ServiceDetails[]>([]);

/** Fetch presentation details independently, with a request identity for every scope change. */
export function useLocationServiceDetails(vendor: string | undefined, location: string) {
  const key = JSON.stringify([vendor || "", location]);
  const [scope, setScope] = useState({ key, generation: 0 });
  if (scope.key !== key) setScope({ key, generation: scope.generation + 1 });
  const generation = scope.generation;
  const committedScope = useRef(scope);
  useLayoutEffect(() => { committedScope.current = scope; }, [scope]);
  const [scoped, setScoped] = useState<{ key: string; generation: number; services: ServiceDetails[] }>({ key: "", generation: -1, services: [] });
  useEffect(() => {
    if (!vendor || !location) return;
    const controller = new AbortController();
    apiRequest<{ services?: unknown }>(
      `/public/vendors/${encodeURIComponent(vendor)}/locations/${encodeURIComponent(location)}/services`,
      { signal: controller.signal },
    ).then(({ services }) => {
      if (!controller.signal.aborted && committedScope.current.key === key && committedScope.current.generation === generation) {
        const validServices: ServiceDetails[] = Array.isArray(services)
          ? services.flatMap((service): ServiceDetails[] => {
              if (service === null || typeof service !== "object" || typeof service.slug !== "string") return [];
              return [{ slug: service.slug,
                imageUrl: typeof service.imageUrl === "string" ? service.imageUrl : undefined,
                priceDisplay: typeof service.priceDisplay === "string" ? service.priceDisplay : undefined,
                description: typeof service.description === "string" ? service.description : undefined }];
            })
          : [];
        setScoped({ key, generation, services: validServices });
      }
    }).catch(() => { /* Missing presentation details use the existing safe fallback. */ });
    return () => controller.abort();
  }, [vendor, location, key, generation]);
  return scoped.key === key && scoped.generation === generation ? scoped.services : [];
}

export function findCustomerBookingServiceDetails(services: ServiceDetails[], slug: string) {
  const matches = services.filter((service) => service.slug === slug);
  return matches.length === 1 ? matches[0] : undefined;
}
