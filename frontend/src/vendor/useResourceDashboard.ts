import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, ApiError } from "../api/client";
import { queueReadRequest } from "./queueReadRequest";
import type { LocalResourceOperations } from "../../../shared/localPoolDemo";
import { dashboardHintMatchesLocation, dashboardScopeKey, resourceDashboardModel, type DashboardScope } from "./resourceDashboardModel";

/** The local read is gated independently from production resource readiness. */
export function useResourceDashboard(token: string | null, scope: DashboardScope) {
  const scopeKey = dashboardScopeKey(scope);
  const [stream, setStream] = useState<{scope: string; session: string | null; state: "connecting" | "connected" | "disconnected"}>({scope: scopeKey, session: token, state: "connecting"});
  const [now, setNow] = useState(() => Date.now());
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 5000);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.clearInterval(tick); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);
  const localReadEnabled = Boolean(import.meta.env?.DEV && import.meta.env?.VITE_LOCAL_POOL_DEMO === "1" && typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
  const enabled = Boolean(localReadEnabled && token && scope.tenantSlug && scope.locationSlug && scope.tenantId && scope.locationId);
  const query = useQuery({
    queryKey: ["resource-dashboard", token, dashboardScopeKey(scope)],
    enabled,
    queryFn: async ({signal}) => resourceDashboardModel(await queueReadRequest<LocalResourceOperations>(
      `/vendor/tenant/${encodeURIComponent(scope.tenantSlug)}/locations/${encodeURIComponent(scope.locationSlug)}/resource-operations`,
      {token: token || "", signal}), scope),
    retry: false,
    staleTime: 10000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchIntervalInBackground: false,
    refetchInterval: query => query.state.error instanceof ApiError && [401,403,404,429].includes(query.state.error.status) ? false : 15000,
  });
  // No placeholderData: a business/location change must never carry another scope's last-good observation.
  const accessDenied = query.error instanceof ApiError && [401,403].includes(query.error.status);
  useEffect(() => {
    if (!enabled || accessDenied) return;
    return subscribeResourceDashboard({
      url: `${API_BASE_URL}/vendor/tenant/${encodeURIComponent(scope.tenantSlug)}/queue/stream?location=${encodeURIComponent(scope.locationSlug)}`,
      locationId: scope.locationId,
      onState: state => setStream({scope: scopeKey, session: token, state}),
      onRefresh: () => { void query.refetch(); },
    });
  }, [enabled, accessDenied, token, scopeKey, scope.tenantSlug, scope.locationSlug, scope.locationId, query.refetch]);
  const disconnected = enabled && stream.scope === scopeKey && stream.session === token && stream.state === "disconnected";
  return {query, enabled, offline, disconnected, accessDenied, stale: Boolean(query.data && (offline || disconnected || query.isError || now - Date.parse(query.data.asOf) > 45000))};
}

type StreamSource = Pick<EventSource, "addEventListener" | "removeEventListener" | "close">;
type StreamTimer = ReturnType<typeof setTimeout> | number;
type StreamOptions = {
  url: string; locationId: string;
  onState(state: "connecting" | "connected" | "disconnected"): void;
  onRefresh(): void;
  createSource?: (url: string) => StreamSource;
  clock?: () => number;
  schedule?: (callback: () => void, delay: number) => StreamTimer;
  cancel?: (timer: StreamTimer) => void;
};
/** One owned stream: authenticated ready, scoped hints, bounded reconnect, complete disposal. */
export function subscribeResourceDashboard(options: StreamOptions) {
  const create = options.createSource || (url => new EventSource(url, {withCredentials: true}));
  const clock = options.clock || Date.now;
  const schedule = options.schedule || setTimeout;
  const cancel = options.cancel || clearTimeout;
  let disposed = false;
  let retry: StreamTimer | undefined;
  let gap: StreamTimer | undefined;
  let release = () => {};
  let backoff = 5000;
  let attempted = false;
  let hasConnectionResult = false;
  const connect = () => {
    if (disposed) return;
    if (!attempted) options.onState("connecting");
    attempted = true;
    const source = create(options.url);
    let active = true;
    let lastMessage = clock();
    const valid = (event: Event) => !("data" in event) || dashboardHintMatchesLocation(String(event.data), options.locationId);
    const refresh = () => { if (!disposed && active) options.onRefresh(); };
    const close = () => {
      active = false;
      for (const [name, listener] of listeners) source.removeEventListener(name, listener);
      source.close();
      if (gap !== undefined) cancel(gap);
    };
    const reconnect = () => {
      if (disposed || !active) return;
      hasConnectionResult = true; options.onState("disconnected"); refresh(); close();
      retry = schedule(connect, backoff); backoff = Math.min(30000, backoff * 2);
    };
    const open = () => { if (!disposed && active) { if (!hasConnectionResult) options.onState("connecting"); refresh(); } };
    const ready = (event: Event) => {
      if (disposed || !active || !("data" in event)) return;
      try { if (JSON.parse(String(event.data))?.locationId !== options.locationId) return; } catch { return; }
      lastMessage = clock(); backoff = 5000; hasConnectionResult = true; options.onState("connected"); refresh();
    };
    const hint = (event: Event) => { if (!disposed && active && valid(event)) { lastMessage = clock(); refresh(); } };
    const heartbeat = () => { if (!disposed && active) lastMessage = clock(); };
    const listeners: [string, EventListener][] = [["open",open],["ready",ready],["queue-plans-updated",hint],["heartbeat",heartbeat],["error",reconnect]];
    for (const [name, listener] of listeners) source.addEventListener(name, listener);
    const checkGap = () => { if (disposed || !active) return; if (clock() - lastMessage > 60000) reconnect(); else gap = schedule(checkGap, 15000); };
    gap = schedule(checkGap, 15000);
    release = close;
  };
  connect();
  return () => { disposed = true; if (retry !== undefined) cancel(retry); if (gap !== undefined) cancel(gap); release(); };
}
