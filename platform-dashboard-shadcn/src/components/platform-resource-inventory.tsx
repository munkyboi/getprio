import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resourceInventoryApi } from "@/lib/platform-api";
import {
  defaultReportWindow,
  validReportWindow,
} from "@/lib/resource-inventory-contracts";
import type {
  EvidenceValue,
  ResourceInventoryApi,
  ResourceReport,
} from "@/lib/resource-inventory-contracts";
import type { AiScope } from "@/lib/ai-inference-contracts";

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
const collectionNames: Record<string, string> = {
  pools: "Resource capacity",
  requirements: "Current service requirements",
  work: "Work and captured plans",
  allocations: "Current held allocations",
  historicalConversions: "Released conversion history (not held)",
  protectedBindings: "Window protection",
  linkedBindings: "Linked and converted reservations",
  bookingItems: "Booking demand",
  queueDays: "Queue day evidence",
  segments: "Queue order evidence",
};
function Evidence({ value }: { value: EvidenceValue }) {
  if (value === null) return <>Unknown / unavailable</>;
  if (Array.isArray(value))
    return (
      <ul className="flex flex-col gap-2">
        {value.map((item, index) => (
          <li key={index}>
            <Evidence value={item} />
          </li>
        ))}
      </ul>
    );
  if (typeof value === "object")
    return (
      <dl className="flex flex-col gap-2">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className="min-w-0">
            <dt className="text-muted-foreground">{label(key)}</dt>
            <dd className="break-all">
              <Evidence value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <>{typeof value === "boolean" ? String(value) : value}</>;
}
function Collection({
  name,
  rows,
}: {
  name: string;
  rows: Record<string, EvidenceValue>[];
}) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-3">
        {collectionNames[name] || label(name)} · {rows.length} records
      </summary>
      {open ? (
        <div className="flex flex-col gap-4">
          {!rows.length ? (
            <p>No records in this scanned collection.</p>
          ) : (
            rows.slice(page * 25, page * 25 + 25).map((row, index) => (
              <Card key={page * 25 + index} size="sm">
                <CardHeader>
                  <CardTitle>Record {page * 25 + index + 1}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Evidence value={row} />
                </CardContent>
              </Card>
            ))
          )}
          {pages > 1 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="min-h-11"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous {collectionNames[name]}
              </Button>
              <p>
                Page {page + 1} of {pages}
              </p>
              <Button
                type="button"
                className="min-h-11"
                variant="outline"
                disabled={page + 1 === pages}
                onClick={() => setPage(page + 1)}
              >
                Next {collectionNames[name]}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
export function ResourceReportView({ report }: { report: ResourceReport }) {
  return (
    <section
      aria-label="Resource report results"
      className="flex min-w-0 flex-col gap-5"
    >
      <Alert>
        <AlertTitle>Readiness: Not ready</AlertTitle>
        <AlertDescription>
          A complete scan does not establish authoritative inventory, available
          capacity or a forecast. Customer estimates remain unchanged.
        </AlertDescription>
      </Alert>
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        {Object.entries({
          "Tenant / location": `${report.scope.tenantId} / ${report.scope.locationId}`,
          "Scan status": label(report.scanStatus),
          "Counts status": label(report.countsStatus),
          "Observed at (UTC)": report.observedAt || "Unavailable",
          "Completed at (UTC)": report.completedAt,
          "Window from (UTC)": report.window.from,
          "Window to (UTC)": report.window.to,
          "Timestamp precision":
            "Displayed milliseconds; capacity comparisons use microseconds",
          "Report version": report.reportVersion,
        }).map(([key, value]) => (
          <div key={key}>
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3>Readiness blockers</h3>
        <ul className="list-inside list-disc">
          {report.blockers.map((blocker) => (
            <li key={blocker}>{label(blocker)}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Source counts</h3>
        {report.counts === null ? (
          <p>Counts unavailable; sources were not assessed.</p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(report.counts).map(([key, value]) => (
              <div key={key}>
                <dt>{label(key)}</dt>
                <dd>
                  {value}
                  {report.limits?.[key] !== undefined
                    ? ` · scan limit ${report.limits[key]}`
                    : ""}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {report.exceededCollections?.length ? (
        <Alert>
          <AlertTitle>Scan limits exceeded</AlertTitle>
          <AlertDescription>
            {report.exceededCollections.map(label).join(", ")}. Details and
            findings have not been evaluated.
          </AlertDescription>
        </Alert>
      ) : null}
      <div>
        <h3>Reconciliation findings</h3>
        <p>Evaluation: {label(report.findings.status)}</p>
        {report.findings.counts === null ? (
          <p>Finding counts unavailable / not evaluated.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.findings.counts.map((item) => (
              <li
                key={`${item.code}:${item.recordType}:${item.classification}`}
              >
                {label(item.code)} · {label(item.recordType)} ·{" "}
                {label(item.classification)}: {item.count}
              </li>
            ))}
          </ul>
        )}
        {report.findings.counts?.length === 0 ? (
          <p>
            No findings in the scanned sources. Readiness remains not ready.
          </p>
        ) : null}
        <p>
          At most 32 examples.{" "}
          {report.findings.examplesComplete === true
            ? "Examples cover all counted findings."
            : "Examples may omit findings or evaluation is unavailable; use exact counts above."}
        </p>
        <ul className="flex flex-col gap-2">
          {report.findings.examples.map((item, index) => (
            <li key={index} className="break-all">
              {label(item.code)} · {label(item.recordType)} ·{" "}
              {label(item.classification)} · {item.ref}
            </li>
          ))}
        </ul>
      </div>
      {report.revisionEvidence ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-3">
            Revision and coverage evidence
          </summary>
          <Evidence value={report.revisionEvidence} />
        </details>
      ) : null}
      {report.historicalEvidence ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-3">
            Historical evidence
          </summary>
          <Evidence value={report.historicalEvidence} />
        </details>
      ) : null}
      <p>
        Expected end times never release held capacity. Released history is
        separate from current occupancy. Dispatch order and horizon completeness
        are not attested.
      </p>
      {report.inventory === null ? (
        <p>Inventory details unavailable / suppressed by scan limits.</p>
      ) : (
        Object.entries(report.inventory).map(([name, rows]) => (
          <Collection key={name} name={name} rows={rows} />
        ))
      )}
    </section>
  );
}
export function PlatformResourceInventory({
  live,
  canRead,
  onSessionExpired,
  api = resourceInventoryApi,
}: {
  live: boolean;
  canRead: boolean;
  onSessionExpired: () => void;
  api?: ResourceInventoryApi;
}) {
  const [query, setQuery] = useState("");
  const [scopes, setScopes] = useState<AiScope[]>([]);
  const [selected, setSelected] = useState("");
  const [window, setWindow] = useState(defaultReportWindow);
  const [reportLocation, setReportLocation] = useState("");
  const [report, setReport] = useState<ResourceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [limited, setLimited] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    generation.current++;
    setReport(null);
    setScopes([]);
    setSelected("");
    setBusy(false);
    setSearched(false);
    setLimited(false);
  }, [live, canRead]);
  function invalidate() {
    generation.current++;
    setReport(null);
    setError(null);
    setBusy(false);
  }
  async function run(operation: () => Promise<void>) {
    const request = ++generation.current;
    setReport(null);
    setError(null);
    setBusy(true);
    try {
      await operation();
    } catch (cause) {
      if (request !== generation.current) return;
      const status =
        cause && typeof cause === "object" && "status" in cause
          ? Number(cause.status)
          : null;
      if (status === 401 || status === 403) {
        setRevoked(true);
        setScopes([]);
        setSelected("");
        setReport(null);
        if (status === 401) onSessionExpired();
      }
      if (status === 404) {
        setScopes([]);
        setSelected("");
        setSearched(false);
        setLimited(false);
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "Resource evidence is unavailable.",
      );
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  async function search() {
    const expected = generation.current + 1;
    await run(async () => {
      const result = await api.searchScopes(query);
      if (expected !== generation.current) return;
      setScopes(result.scopes);
      setLimited(result.limited);
      setSearched(true);
      setSelected("");
    });
  }
  async function load() {
    const scope = scopes.find(
      (item) => `${item.tenantId}:${item.locationId}` === selected,
    );
    if (!scope || !validReportWindow(window.windowFrom, window.windowTo)) {
      setError(
        "Choose a location and a valid UTC window of at most eight hours.",
      );
      return;
    }
    const expected = generation.current + 1;
    await run(async () => {
      const result = await api.read({
        tenantId: scope.tenantId,
        locationId: scope.locationId,
        ...window,
      });
      if (expected === generation.current) {
        setReportLocation(`${scope.tenantName} · ${scope.locationName}`);
        setReport(result);
      }
    });
  }
  if (!canRead || revoked)
    return (
      <Alert>
        <AlertTitle>Resource evidence access denied</AlertTitle>
        <AlertDescription>
          Active Platform Admin access and an authenticated MFA session are
          required.
        </AlertDescription>
      </Alert>
    );
  if (!live)
    return (
      <Alert>
        <AlertTitle>Live evidence required</AlertTitle>
        <AlertDescription>
          Resource reports are available only through the live authorized API.
        </AlertDescription>
      </Alert>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resource inventory and reconciliation</CardTitle>
        <CardDescription>
          Read-only location evidence. Load manually; no polling, repair or
          resource activation.
        </CardDescription>
        <Badge variant="secondary">Private operational data</Badge>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Report unavailable</AlertTitle>
            <AlertDescription role="alert">{error}</AlertDescription>
          </Alert>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="resource-search">
                Vendor or location search
              </FieldLabel>
              <Input
                id="resource-search"
                className="min-h-11"
                maxLength={100}
                value={query}
                onChange={(event) => {
                  invalidate();
                  setQuery(event.target.value);
                  setScopes([]);
                  setSelected("");
                  setSearched(false);
                  setLimited(false);
                }}
              />
            </Field>
            <Button type="submit" className="min-h-11" disabled={busy}>
              Find locations
            </Button>
          </FieldGroup>
        </form>
        {searched && !scopes.length ? <p>No matching locations.</p> : null}
        {limited ? (
          <p>Showing 50 matches. Narrow the search to find another location.</p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="resource-location">Location</FieldLabel>
              <Select
                items={scopes.map((scope) => ({
                  value: `${scope.tenantId}:${scope.locationId}`,
                  label: `${scope.tenantName} · ${scope.locationName} (${scope.tenantId}/${scope.locationId})`,
                }))}
                value={selected}
                onValueChange={(value) => {
                  if ((value || "") === selected) return;
                  invalidate();
                  setSelected(value || "");
                }}
              >
                <SelectTrigger
                  id="resource-location"
                  className="min-h-11 w-full min-w-0 data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none"
                >
                  <SelectValue
                    className="min-w-0 break-all whitespace-normal"
                    placeholder="Choose an exact location"
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {scopes.map((scope) => (
                      <SelectItem
                        wrapText
                        key={`${scope.tenantId}:${scope.locationId}`}
                        value={`${scope.tenantId}:${scope.locationId}`}
                      >
                        <span className="break-all whitespace-normal">
                          {scope.tenantName} · {scope.locationName} (
                          {scope.tenantId}/{scope.locationId})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {(["windowFrom", "windowTo"] as const).map((key, index) => (
              <Field
                key={key}
                data-invalid={
                  Boolean(error) &&
                  !validReportWindow(window.windowFrom, window.windowTo)
                }
              >
                <FieldLabel htmlFor={`resource-${key}`}>
                  {index === 0 ? "Window from" : "Window to"} (UTC)
                </FieldLabel>
                <Input
                  id={`resource-${key}`}
                  aria-invalid={
                    Boolean(error) &&
                    !validReportWindow(window.windowFrom, window.windowTo)
                  }
                  className="min-h-11"
                  required
                  value={window[key]}
                  onChange={(event) => {
                    invalidate();
                    setWindow({ ...window, [key]: event.target.value });
                  }}
                />
                <FieldDescription>
                  ISO UTC, e.g. 2026-10-12T08:00:00.000Z. Up to eight hours;
                  must contain the server observation.
                </FieldDescription>
              </Field>
            ))}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                invalidate();
                setWindow(defaultReportWindow());
              }}
            >
              Reset window around now
            </Button>
            <Button
              type="submit"
              className="min-h-11"
              disabled={busy || !selected}
            >
              Load resource report
            </Button>
          </FieldGroup>
        </form>
        {busy ? <p role="status">Loading private resource evidence…</p> : null}
        {report ? (
          <div className="flex min-w-0 flex-col gap-4">
            <h3 className="break-all">{reportLocation}</h3>
            <ResourceReportView key={report.completedAt} report={report} />
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        <p>
          Qualified IDs and timestamps remain private, linkable data. This view
          grants no dataset capture or export approval.
        </p>
      </CardFooter>
    </Card>
  );
}
