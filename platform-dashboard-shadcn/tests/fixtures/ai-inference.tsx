import { createRoot } from "react-dom/client";
import { PlatformAiInference } from "../../src/components/platform-ai-inference";
import "../../src/index.css";
import type {
  AiInferenceApi,
  AiStatus,
} from "../../src/lib/ai-inference-contracts";
const params = new URLSearchParams(location.search);
if (params.has("dark")) document.documentElement.classList.add("dark");
let status: AiStatus = {
  policy: {
    revision: "1",
    updatedAt: new Date().toISOString(),
    requestedMode: "off",
    timeoutMs: 100,
    freshnessMs: 1000,
    pilots: [],
  },
  effectiveMode: "off",
  predictor: {
    kind: "deterministic",
    version: "resource-service-start-shadow-v1",
    target: "time_to_actual_service_start",
  },
  readiness: {
    status: "not_ready",
    blockers: [
      "caller_not_integrated",
      "producer_not_ready",
      "shadow_approval_missing",
      "customer_rollout_not_approved",
    ],
  },
  capture: {
    status: "not_integrated",
    privacyApproval: "not_recorded",
    detail:
      "Resource capture is not integrated. Existing baseline capture is unchanged.",
  },
  diagnostics: {
    status: "not_collected",
    forecastSupport: null,
    latencyMs: null,
    errors: null,
    lastEvidenceAt: null,
  },
  pilots: [],
};
let saveCalls = 0;
let lastKey = "";
const api: AiInferenceApi = {
  read: async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (params.has("failread")) throw Error("Fixture API unavailable");
    return structuredClone(status);
  },
  searchScopes: async (q) => ({
    scopes:
      q === "none"
        ? []
        : [
            {
              tenantId: "1",
              locationId: "10",
              tenantName: "Test vendor",
              locationName: "Main location",
            },
          ],
    limited: false,
  }),
  preview: async (policy) => ({
    policy: structuredClone(policy),
    revision: status.policy.revision,
    confirmation: {
      token: "local-test-only",
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    },
  }),
  save: async (preview, _reason, key) => {
    saveCalls++;
    const reused = !lastKey || lastKey === key;
    lastKey = key;
    document.getElementById("qa-requests")!.textContent =
      `Save calls: ${saveCalls}; same retry key: ${reused}`;
    if (saveCalls === 1) throw Error("Fixture connection lost; retry safely");
    status = {
      ...status,
      policy: {
        ...preview.policy,
        revision: String(Number(status.policy.revision) + 1),
        updatedAt: new Date().toISOString(),
      },
      pilots: preview.policy.pilots.map((p) => ({
        ...p,
        tenantName: "Test vendor",
        locationName: "Main location",
        effectiveMode: "off",
        blockers: ["caller_not_integrated"],
      })),
    };
    return structuredClone(status);
  },
};
createRoot(document.getElementById("root")!).render(
  <main className="mx-auto max-w-5xl p-4">
    <p className="mb-4">Local test fixture — no production requests</p>
    <output id="qa-requests">Save calls: 0</output>
    <PlatformAiInference
      live
      canRead={!params.has("denied")}
      canManage={!params.has("readonly")}
      api={api}
    />
  </main>,
);
