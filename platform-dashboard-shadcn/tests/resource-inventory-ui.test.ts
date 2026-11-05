import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultReportWindow,
  validReportWindow,
} from "../src/lib/resource-inventory-contracts.ts";
const require = createRequire(import.meta.url);
const compiled = buildSync({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../src/components/platform-resource-inventory.tsx",
        import.meta.url,
      ),
    ),
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  external: ["react", "react-dom", "react-dom/server", "react-dom/client"],
  tsconfig: fileURLToPath(new URL("../tsconfig.app.json", import.meta.url)),
  define: { "import.meta.env": JSON.stringify({ DEV: true }) },
}).outputFiles[0].text;
const module = {
  exports: {} as Record<string, Parameters<typeof createElement>[0]>,
};
runInNewContext(compiled, {
  module,
  exports: module.exports,
  require,
  window: { location: { hostname: "localhost" } },
  process,
  console,
  setTimeout,
  clearTimeout,
  URL,
  URLSearchParams,
});
const render = (name: string, props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(module.exports[name], props));
const base = {
  reportVersion: "resource-inventory-reconciliation-report-v1",
  scope: { tenantId: "1", locationId: "10" },
  window: { from: "2026-10-12T00:00:00.000Z", to: "2026-10-12T02:00:00.000Z" },
  observedAt: "2026-10-12T01:00:00.000Z",
  completedAt: "2026-10-12T01:00:01.000Z",
  readiness: "not_ready",
  scanStatus: "complete",
  countsStatus: "exact",
  counts: { work: "9007199254740993" },
  findings: {
    status: "exact_for_scanned_sources",
    counts: [],
    examples: [],
    examplesComplete: true,
  },
  inventory: { allocations: [], historicalConversions: [] },
  blockers: ["tracking_disabled"],
};
test("complete report keeps not-ready, exact decimal counts, observation and released/held distinction", () => {
  const html = render("ResourceReportView", { report: base });
  for (const text of [
    "Readiness: Not ready",
    "9007199254740993",
    "2026-10-12T01:00:00.000Z",
    "Current held allocations",
    "Released conversion history (not held)",
    "At most 32 examples",
    "Expected end times never release",
  ])
    assert.ok(html.includes(text), text);
});
test("unavailable, row and byte overflow never display fabricated zero findings", () => {
  for (const scanStatus of [
    "unavailable",
    "row_limit_exceeded",
    "byte_limit_exceeded",
  ]) {
    const html = render("ResourceReportView", {
      report: {
        ...base,
        scanStatus,
        countsStatus: "unavailable",
        counts: null,
        inventory: null,
        findings: { status: "not_evaluated", counts: null, examples: [] },
      },
    });
    assert.match(html, /Counts unavailable; sources were not assessed/);
    assert.match(html, /Finding counts unavailable/);
    assert.doesNotMatch(html, /No findings in the scanned sources/);
  }
});
test("private evidence UI denies access and fixture mode before controls appear", () => {
  for (const props of [
    { live: true, canRead: false },
    { live: false, canRead: true },
  ]) {
    const html = render("PlatformResourceInventory", {
      ...props,
      onSessionExpired: () => {},
    });
    assert.doesNotMatch(html, /Load resource report|Find locations/);
  }
});
test("canonical UTC validation rejects invalid dates, offsets, inversion and windows beyond eight hours", () => {
  assert.equal(
    validReportWindow("2026-10-12T00:00:00Z", "2026-10-12T08:00:00Z"),
    true,
  );
  for (const [from, to] of [
    ["2026-02-30T00:00:00Z", "2026-03-02T01:00:00Z"],
    ["2026-10-12T00:00:00+08:00", "2026-10-12T01:00:00Z"],
    ["2026-10-12T02:00:00Z", "2026-10-12T01:00:00Z"],
    ["2026-10-12T00:00:00Z", "2026-10-12T08:00:00.001Z"],
  ])
    assert.equal(validReportWindow(from, to), false);
  assert.deepEqual(defaultReportWindow(Date.parse("2026-10-12T01:00:00Z")), {
    windowFrom: "2026-10-12T00:00:00.000Z",
    windowTo: "2026-10-12T02:00:00.000Z",
  });
});
