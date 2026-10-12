import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PlatformResourceInventory } from "../../src/components/platform-resource-inventory";
import type {
  ResourceInventoryApi,
  ResourceReport,
} from "../../src/lib/resource-inventory-contracts";
import "../../src/index.css";
const params = new URLSearchParams(location.search);
if (params.has("dark")) document.documentElement.classList.add("dark");
let calls = 0
const completed: number[] = [];
const api: ResourceInventoryApi = {
  searchScopes: async () => ({
    scopes: [
      {
        tenantId: "1",
        locationId: "10",
        tenantName: params.has("long")
          ? "VendorName".repeat(24)
          : "Test vendor",
        locationName: "Main location",
      },
      {
        tenantId: "2",
        locationId: "20",
        tenantName: "Other vendor",
        locationName: "Other location",
      },
    ],
    limited: false,
  }),
  read: async (input) => {
    const request = ++calls;
    document.getElementById("qa-calls")!.textContent = `Report calls: ${calls}`;
    await new Promise((resolve) =>
      setTimeout(resolve, (params.has("race") || params.has("raceerror")) && request === 1 ? 2500 : 100),
    );
    completed.push(request)
    document.getElementById("qa-completed")!.textContent = `Completed calls: ${completed.join(",")}`
    if (params.has("expire"))
      throw Object.assign(Error("Session expired"), { status: 401 });
    if (params.has("forbidden"))
      throw Object.assign(Error("Access revoked"), { status: 403 });
    if (params.has("raceerror") && request === 1)
      throw Error("Old request failed");
    const unavailable = params.has("unavailable");
    const overflow = params.has("overflow");
    const byte = params.has("byte");
    return {
      reportVersion: "resource-inventory-reconciliation-report-v1",
      scope: {
        tenantId: input.tenantId,
        locationId: input.locationId,
        queueKind: "location",
        sourceBinding: "local-test",
      },
      window: {
        from: input.windowFrom,
        to: input.windowTo,
        horizonCompletenessAttested: false,
      },
      observedAt: unavailable ? null : "2026-10-12T01:00:00.000Z",
      completedAt: `2026-10-12T01:00:0${request}.000Z`,
      readiness: "not_ready",
      snapshot: null,
      authoritativeInventoryComplete: false,
      scanStatus: unavailable
        ? "unavailable"
        : overflow
          ? "row_limit_exceeded"
          : byte
            ? "byte_limit_exceeded"
            : "complete",
      countsStatus: unavailable ? "unavailable" : "exact",
      counts: unavailable
        ? null
        : {
            pools: "1",
            work: "26",
            allocations: "1",
            historicalConversions: "1",
          },
      limits: { pools: 100, work: 10000 },
      exceededCollections: overflow ? ["work"] : [],
      findings: {
        status:
          unavailable || overflow || byte
            ? "not_evaluated"
            : "exact_for_scanned_sources",
        counts:
          unavailable || overflow || byte
            ? null
            : [
                {
                  code: "missing_captured_plan",
                  recordType: "work",
                  classification: "forecast_support_gap",
                  count: "26",
                },
              ],
        examples: [],
        examplesComplete: false,
      },
      inventory:
        unavailable || overflow || byte
          ? null
          : {
              pools: [
                {
                  poolRef: `pool:${input.tenantId}:${input.locationId}:100`,
                  capacity: 4,
                  trackingEnabled: false,
                },
              ],
              work: Array.from({ length: 26 }, (_, index) => ({
                workRef: `ticket:${input.tenantId}:${input.locationId}:${index + 1}`,
                plan: null,
              })),
              allocations: [
                { occupancyState: "unreleased", units: 1, expectedEndAt: null },
              ],
              historicalConversions: [{ occupancyState: "released", units: 1 }],
            },
      blockers: ["tracking_disabled", "writer_coverage_incomplete"],
      forecastSupport: "not_assessed",
      historicalRepairPerformed: false,
      customerEstimateChanged: false,
    } satisfies ResourceReport;
  },
};
export function Fixture() {
  const [canRead, setCanRead] = useState(true);
  return (
    <main className="mx-auto max-w-5xl p-4">
      <p>Local test fixture — no production requests</p>
      <output id="qa-calls">Report calls: 0</output>
      <output id="qa-completed">Completed calls: none</output>
      <button onClick={() => setCanRead(false)}>Revoke fixture access</button>
      <PlatformResourceInventory
        live
        canRead={canRead}
        api={api}
        onSessionExpired={() => {
          document.getElementById("qa-calls")!.textContent =
            "Session expiry callback invoked";
        }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
