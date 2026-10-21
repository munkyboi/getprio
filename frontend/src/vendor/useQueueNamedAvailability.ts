import { useEffect, useRef, useState } from "react";
import type {
  QueueNamedAvailabilityResponseV1,
  QueueServiceSelectionInputV4,
} from "../../../shared/queueSelectionPlanV4";
import { previewQueueNamedAvailability } from "../api/queueSelectionsV4";
import { ApiError } from "../api/client";
import {
  acceptedNamedAvailability,
  namedAvailabilityRequest,
} from "./queueNamedAvailability";
export interface NamedAvailabilityScope {
  token: string;
  tenant: string;
  location: string;
  draftId?: string;
}
/** One debounced whole-tree request; aborted/stale responses never authorize a pick. */
export function useQueueNamedAvailability(
  scope: NamedAvailabilityScope | undefined,
  enabled: boolean,
  catalogRevision: string,
  selections: QueueServiceSelectionInputV4[],
) {
  const tree = JSON.stringify(selections);
  const context = JSON.stringify([
    scope?.token,
    scope?.tenant,
    scope?.location,
    scope?.draftId,
    catalogRevision,
    tree,
  ]);
  const [snapshot, setSnapshot] = useState<{
    context: string;
    response?: QueueNamedAvailabilityResponseV1;
    message?: string;
  }>();
  const retryAt = useRef(0);
  const token = scope?.token,
    tenant = scope?.tenant,
    location = scope?.location,
    draftId = scope?.draftId;
  useEffect(() => {
    if (!enabled || !token || !tenant || !location) return;
    let disposed = false,
      controller: AbortController | undefined,
      timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), delay);
    };
    async function refresh() {
      if (disposed) return;
      if (Date.now() < retryAt.current) {
        schedule(retryAt.current - Date.now());
        return;
      }
      const ownGeneration = ++generation;
      controller?.abort();
      controller = new AbortController();
      setSnapshot({
        context,
        message: "Checking availability for the selected interval…",
      });
      const request = namedAvailabilityRequest(
        JSON.parse(tree),
        catalogRevision,
        crypto.randomUUID(),
        draftId,
      );
      try {
        const response = await previewQueueNamedAvailability(
          token!,
          tenant!,
          location!,
          request,
          controller.signal,
        );
        if (disposed || ownGeneration !== generation) return;
        setSnapshot(
          acceptedNamedAvailability(response, request)
            ? { context, response }
            : {
                context,
                message:
                  "Service policies changed. Refresh and review the current policies.",
              },
        );
      } catch (error) {
        if (
          disposed ||
          ownGeneration !== generation ||
          controller.signal.aborted
        )
          return;
        if (error instanceof ApiError && error.status === 429)
          retryAt.current = error.retryAt || Date.now() + 60000;
        setSnapshot({
          context,
          message:
            "Availability could not be confirmed. Existing selections are retained.",
        });
      } finally {
        if (!disposed && ownGeneration === generation)
          schedule(Math.max(15000, retryAt.current - Date.now()));
      }
    }
    const updated = () => {
      ++generation;
      controller?.abort();
      setSnapshot({ context });
      schedule(450);
    };
    window.addEventListener("queue-plans-updated", updated);
    window.addEventListener("vendor-queue-snapshot-updated", updated);
    window.addEventListener("online", updated);
    schedule(450);
    return () => {
      disposed = true;
      ++generation;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener("queue-plans-updated", updated);
      window.removeEventListener("vendor-queue-snapshot-updated", updated);
      window.removeEventListener("online", updated);
    };
  }, [
    enabled,
    token,
    tenant,
    location,
    draftId,
    catalogRevision,
    tree,
    context,
  ]);
  const current =
    enabled && snapshot?.context === context
      ? snapshot
      : {
          context,
          message: "Availability has not been confirmed for this interval.",
        };
  return {
    ...current,
    checking:
      !current.response &&
      (!current.message ||
        current.message.startsWith("Checking availability") ||
        current.message.startsWith("Availability has not been confirmed")),
  };
}
