import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  LoaderCircle,
  RefreshCw,
  ShieldCheck
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { aiInferenceApi } from "@/lib/platform-api"
import { PlatformResourceInventory } from "@/components/platform-resource-inventory"
import type {
  AiInferenceApi,
  AiMode,
  AiPilot,
  AiPolicy,
  AiPreview,
  AiScope,
  AiStatus
} from "@/lib/ai-inference-contracts"

const explain = (value: string) => value.replaceAll("_", " ")
const modeLabel = (value: string) =>
  value === "off"
    ? "Off"
    : value === "private_shadow"
      ? "Private shadow"
      : "Needs verification"
const blockerGuidance: Record<string, { title: string; action: string }> = {
  caller_not_integrated: {
    title: "Private evaluation is not connected",
    action:
      "Ask engineering to connect the approved runtime caller. Saving this policy does not connect it."
  },
  producer_not_ready: {
    title: "Resource evidence is not ready",
    action:
      "Review resource inventory, writer coverage and reconciliation with the operations team. Incomplete evidence cannot be enabled here."
  },
  shadow_approval_missing: {
    title: "Private evaluation needs approval",
    action:
      "Complete the private-shadow review and approval process before operation. A saved request is not an approval."
  },
  customer_rollout_not_approved: {
    title: "Customer delivery is not approved",
    action:
      "Keep existing customer estimates. Evaluation, privacy, fallback and rollout approval are separate requirements."
  },
  global_disabled: {
    title: "Global mode is Off",
    action:
      "Global Off overrides every pilot. Change the request only when private evaluation is intended and its prerequisites are satisfied."
  },
  scope_disabled: {
    title: "This location is excluded",
    action:
      "A location must be selected and request Private shadow. Other branches of the vendor are not included automatically."
  }
}
function ReadinessBlockers({ blockers }: { blockers: string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {[...new Set(blockers)].map((code) => {
        const guidance = blockerGuidance[code] || {
          title: "An additional prerequisite needs review",
          action:
            "Ask engineering to interpret the diagnostic code. Do not assume this location is ready."
        }
        return (
          <li key={code} className="flex flex-col gap-1">
            <span className="font-medium">{guidance.title}</span>
            <span>{guidance.action}</span>
          </li>
        )
      })}
    </ul>
  )
}
function editablePolicy(record: AiPolicy): AiPolicy {
  return {
    requestedMode: record.requestedMode,
    timeoutMs: record.timeoutMs,
    freshnessMs: record.freshnessMs,
    pilots: record.pilots
  }
}
function scopeName(scope: AiPilot, known: Array<Partial<AiScope>>) {
  const match = known.find(
    (item) =>
      item.tenantId === scope.tenantId && item.locationId === scope.locationId
  )
  return `${match?.tenantName || `Tenant ${scope.tenantId}`} · ${match?.locationName || `Location ${scope.locationId}`}`
}
export function PlatformAiInference({
  live,
  canRead,
  canManage,
  canReadResources = false,
  onSessionExpired,
  api = aiInferenceApi
}: {
  live: boolean
  canRead: boolean
  canManage: boolean
  canReadResources?: boolean
  onSessionExpired: () => void
  api?: AiInferenceApi
}) {
  const [model, setModel] = useState<AiStatus | null>(null)
  const [draft, setDraft] = useState<AiPolicy | null>(null)
  const [reason, setReason] = useState("")
  const [query, setQuery] = useState("")
  const [scopes, setScopes] = useState<AiScope[]>([])
  const [limited, setLimited] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [review, setReview] = useState<{
    preview: AiPreview
    reason: string
    key: string
  } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [expired, setExpired] = useState(false)
  const dirty = Boolean(
    model &&
    draft &&
    (JSON.stringify(draft) !== JSON.stringify(editablePolicy(model.policy)) ||
      reason.trim())
  )
  const reportFailure = useCallback(
    (cause: unknown, fallback: string) => {
      if (
        cause &&
        typeof cause === "object" &&
        "status" in cause &&
        Number(cause.status) === 401
      ) {
        setModel(null)
        setDraft(null)
        setScopes([])
        setReview(null)
        setReason("")
        setQuery("")
        setNotice(null)
        setError(null)
        setExpired(true)
        onSessionExpired()
        return
      }
      setError(cause instanceof Error ? cause.message : fallback)
    },
    [onSessionExpired]
  )
  useEffect(() => {
    if (!live || !canRead) return
    let active = true
    api
      .read()
      .then((data) => {
        if (active) {
          setModel(data)
          setDraft(editablePolicy(data.policy))
          setError(null)
          setReview(null)
        }
      })
      .catch((cause) => {
        if (active) reportFailure(cause, "AI controls are unavailable.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [api, live, canRead, refresh, reportFailure])
  if (expired)
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Session expired</AlertTitle>
        <AlertDescription>
          Sign in again to view AI inference controls.
        </AlertDescription>
      </Alert>
    )
  if (!canRead)
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>
          You do not have permission to view AI inference controls.
        </AlertDescription>
      </Alert>
    )
  if (!live)
    return (
      <Alert>
        <ShieldCheck />
        <AlertTitle>Live policy required</AlertTitle>
        <AlertDescription>
          Connect the live Platform API to manage AI inference. Fixture data
          cannot enable inference.
        </AlertDescription>
      </Alert>
    )
  const prepare = async (disable = false) => {
    if (!model || !draft || busy || loading || !canManage) return
    if (reason.trim().length < 8 || reason.trim().length > 500) {
      setError("Enter an audit reason between 8 and 500 characters.")
      document.getElementById("ai-reason")?.focus()
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const policy = disable
        ? { ...editablePolicy(model.policy), requestedMode: "off" as const }
        : draft
      const preview = await api.preview(policy, reason)
      if (preview.revision !== model.policy.revision) {
        throw new Error(
          "The saved policy changed. Your draft is preserved. Discard it and refresh the saved policy before reviewing again."
        )
      }
      setReview({ preview, reason, key: crypto.randomUUID() })
    } catch (cause) {
      reportFailure(cause, "Policy preview failed.")
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    if (!review || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.save(review.preview, review.reason, review.key)
      setModel(result)
      setDraft(editablePolicy(result.policy))
      setReview(null)
      setReason("")
      setNotice(
        "Policy saved. Effective inference remains subject to integration and readiness gates."
      )
    } catch (cause) {
      reportFailure(
        cause,
        "Policy save failed. Retry uses the same operation key."
      )
    } finally {
      setBusy(false)
    }
  }
  const search = async () => {
    if (busy || loading || review) return
    setBusy(true)
    setSearching(true)
    setError(null)
    try {
      const result = await api.searchScopes(query)
      setScopes(result.scopes)
      setLimited(result.limited)
      setSearched(true)
    } catch (cause) {
      reportFailure(cause, "Location search failed.")
    } finally {
      setSearching(false)
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">AI Inference</h1>
          <p className="text-muted-foreground">
            Manage private inference policy and review its operational
            readiness.
          </p>
        </div>
        <Button
          className="min-h-11"
          variant="outline"
          disabled={busy || loading || dirty || Boolean(review)}
          onClick={() => {
            setLoading(true)
            setRefresh((value) => value + 1)
          }}
        >
          <RefreshCw data-icon="inline-start" />
          Refresh policy
        </Button>
      </div>
      {dirty || review ? (
        <p className="text-sm text-muted-foreground" role="status">
          {review
            ? "A reviewed change is pending. Save or cancel the review before editing."
            : "You have unsaved edits. Refresh is disabled until you save or discard them."}
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Action needs attention</AlertTitle>
          <AlertDescription aria-live="assertive">{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <ShieldCheck />
          <AlertTitle>Policy updated</AlertTitle>
          <AlertDescription aria-live="polite">{notice}</AlertDescription>
        </Alert>
      ) : null}
      {loading ? <p role="status">Loading inference policy…</p> : null}
      {model && draft ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Current inference state</CardTitle>
              <CardDescription>
                Requested settings do not activate a missing or unapproved
                integration.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt>Requested mode</dt>
                  <dd>
                    <Badge variant="secondary">
                      {modeLabel(model.policy.requestedMode)}
                    </Badge>
                  </dd>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    Saved request, not proof that inference is running.
                  </dd>
                </div>
                <div>
                  <dt>Effective mode</dt>
                  <dd>
                    <Badge variant="secondary">
                      {modeLabel(model.effectiveMode)}
                    </Badge>
                  </dd>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    What the server currently permits.
                  </dd>
                </div>
                <div>
                  <dt>Customer estimates</dt>
                  <dd>Customer estimates are unchanged</dd>
                  <dd className="mt-1 text-sm text-muted-foreground">
                    These controls do not enable customer-facing resource AI.
                  </dd>
                </div>
              </dl>
              <Alert>
                <ShieldCheck />
                <AlertTitle>
                  {model.readiness.status === "ready"
                    ? "Readiness reported by the server"
                    : "What needs attention before private operation"}
                </AlertTitle>
                <AlertDescription>
                  {model.readiness.blockers.length ? (
                    <ReadinessBlockers blockers={model.readiness.blockers} />
                  ) : (
                    "No blockers are reported. Effective mode and separate rollout approvals still determine what may run."
                  )}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Requested policy</CardTitle>
              <CardDescription>
                Global Off overrides every pilot location. Queue operations and
                existing samples are unchanged.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onInvalidCapture={(event) => {
                  const input = event.target
                  if (input instanceof HTMLInputElement) {
                    const section = input.closest("details")
                    if (section) {
                      event.preventDefault()
                      section.open = true
                      setError(input.validationMessage)
                      input.focus()
                    }
                  }
                }}
                onSubmit={(event) => {
                  event.preventDefault()
                  void prepare()
                }}
              >
                <fieldset
                  disabled={busy || loading || Boolean(review)}
                  className="flex min-w-0 flex-col gap-5"
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Global mode</FieldLabel>
                      <ToggleGroup
                        disabled={!canManage}
                        aria-label="Global requested mode"
                        value={[draft.requestedMode]}
                        onValueChange={(values) => {
                          if (values[0])
                            setDraft({
                              ...draft,
                              requestedMode: values[0] as AiMode
                            })
                        }}
                      >
                        <ToggleGroupItem
                          className="min-h-11 min-w-11"
                          value="off"
                        >
                          Off
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          className="min-h-11"
                          value="private_shadow"
                        >
                          Private shadow
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <FieldDescription>
                        Customer estimates are blocked until evaluation,
                        privacy, integration and rollout approval are complete.
                      </FieldDescription>
                    </Field>
                    <details>
                      <summary className="min-h-11 cursor-pointer py-3 font-medium">
                        Advanced settings
                      </summary>
                      <FieldGroup className="mt-3">
                        <Field>
                          <FieldLabel htmlFor="ai-timeout">
                            Timeout (ms)
                          </FieldLabel>
                          <Input
                            className="min-h-11"
                            id="ai-timeout"
                            name="timeoutMs"
                            type="number"
                            min={1}
                            max={1000}
                            required
                            value={draft.timeoutMs}
                            disabled={!canManage}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                timeoutMs: Number(event.target.value)
                              })
                            }
                          />
                          <FieldDescription>
                            1–1,000 ms. Late synchronous results are discarded;
                            this is not a hard CPU deadline.
                          </FieldDescription>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="ai-freshness">
                            Maximum snapshot age (ms)
                          </FieldLabel>
                          <Input
                            className="min-h-11"
                            id="ai-freshness"
                            name="freshnessMs"
                            type="number"
                            min={1}
                            max={5000}
                            required
                            value={draft.freshnessMs}
                            disabled={!canManage}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                freshnessMs: Number(event.target.value)
                              })
                            }
                          />
                          <FieldDescription>
                            1–5,000 ms. Freshness must be rechecked when
                            accepting a result.
                          </FieldDescription>
                        </Field>
                      </FieldGroup>
                    </details>
                    <Field>
                      <FieldLabel htmlFor="ai-scope-search">
                        Find pilot locations
                      </FieldLabel>
                      <Input
                        className="min-h-11"
                        id="ai-scope-search"
                        value={query}
                        maxLength={100}
                        onChange={(event) => {
                          setQuery(event.target.value)
                          setScopes([])
                          setLimited(false)
                          setSearched(false)
                        }}
                      />
                      <Button
                        className="min-h-11"
                        type="button"
                        variant="outline"
                        onClick={() => void search()}
                      >
                        {searching ? (
                          <LoaderCircle
                            data-icon="inline-start"
                            className="animate-spin"
                          />
                        ) : null}
                        {searching
                          ? "Searching locations…"
                          : "Search locations"}
                      </Button>
                      {searched && !scopes.length ? (
                        <FieldDescription>
                          No locations match this search.
                        </FieldDescription>
                      ) : null}
                      {limited ? (
                        <FieldDescription>
                          Showing {scopes.length} results. Refine the search to
                          find another location.
                        </FieldDescription>
                      ) : null}
                      {!canManage && scopes.length ? (
                        <ul
                          aria-label="Matching pilot locations"
                          className="flex flex-col gap-2"
                        >
                          {scopes.map((scope) => (
                            <li
                              className="break-words"
                              key={`${scope.tenantId}:${scope.locationId}`}
                            >
                              {scope.tenantName} · {scope.locationName}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </Field>
                    {scopes.length ? (
                      <Field>
                        <FieldLabel htmlFor="ai-pilot">
                          Add pilot location
                        </FieldLabel>
                        <Select
                          disabled={!canManage}
                          value=""
                          onValueChange={(value) => {
                            const scope = scopes.find(
                              (item) =>
                                `${item.tenantId}:${item.locationId}` === value
                            )
                            if (
                              scope &&
                              !draft.pilots.some(
                                (item) =>
                                  item.tenantId === scope.tenantId &&
                                  item.locationId === scope.locationId
                              )
                            )
                              setDraft({
                                ...draft,
                                pilots: [
                                  ...draft.pilots,
                                  {
                                    tenantId: scope.tenantId,
                                    locationId: scope.locationId,
                                    requestedMode: "private_shadow"
                                  }
                                ]
                              })
                          }}
                        >
                          <SelectTrigger
                            disabled={draft.pilots.length >= 100}
                            id="ai-pilot"
                            className="min-h-11 w-full"
                          >
                            <SelectValue placeholder="Select a location" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {scopes.map((scope) => (
                                <SelectItem
                                  wrapText
                                  className="min-h-11"
                                  disabled={draft.pilots.some(
                                    (item) =>
                                      item.tenantId === scope.tenantId &&
                                      item.locationId === scope.locationId
                                  )}
                                  key={`${scope.tenantId}:${scope.locationId}`}
                                  value={`${scope.tenantId}:${scope.locationId}`}
                                >
                                  {scope.tenantName} · {scope.locationName}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {draft.pilots.length >= 100 ? (
                          <FieldDescription>
                            All 100 pilot slots are used. Remove a location
                            before adding another.
                          </FieldDescription>
                        ) : null}
                      </Field>
                    ) : null}
                  </FieldGroup>
                  <section
                    className="flex flex-col gap-3"
                    aria-label="Pilot scope policies"
                  >
                    <h2 className="font-semibold">
                      Pilot locations ({draft.pilots.length}/100)
                    </h2>
                    {!draft.pilots.length ? (
                      <p className="text-sm text-muted-foreground">
                        No pilot locations selected. Inference is disabled for
                        every location.
                      </p>
                    ) : (
                      draft.pilots.map((scope) => (
                        <div
                          key={`${scope.tenantId}:${scope.locationId}`}
                          className="flex flex-col gap-2 rounded-lg border p-3"
                        >
                          <p className="break-words">
                            {scopeName(scope, [...model.pilots, ...scopes])}
                          </p>
                          <ToggleGroup
                            disabled={!canManage}
                            aria-label={`Requested mode for location ${scope.locationId}`}
                            value={[scope.requestedMode]}
                            onValueChange={(values) => {
                              if (values[0])
                                setDraft({
                                  ...draft,
                                  pilots: draft.pilots.map((item) =>
                                    item === scope
                                      ? {
                                          ...item,
                                          requestedMode: values[0] as AiMode
                                        }
                                      : item
                                  )
                                })
                            }}
                          >
                            <ToggleGroupItem
                              className="min-h-11 min-w-11"
                              value="off"
                            >
                              Off
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              className="min-h-11"
                              value="private_shadow"
                            >
                              Private shadow
                            </ToggleGroupItem>
                          </ToggleGroup>
                          <p className="text-sm text-muted-foreground">
                            Effective:{" "}
                            {explain(
                              model.pilots.find(
                                (item) =>
                                  item.tenantId === scope.tenantId &&
                                  item.locationId === scope.locationId
                              )?.effectiveMode || "off"
                            )}
                          </p>
                          {!model.pilots.some(
                            (item) =>
                              item.tenantId === scope.tenantId &&
                              item.locationId === scope.locationId
                          ) ? (
                            <p className="text-sm text-muted-foreground">
                              New draft location — not included in the saved
                              policy yet.
                            </p>
                          ) : null}
                          {draft.requestedMode === "off" ? (
                            <p className="text-sm text-muted-foreground">
                              Global Off overrides this location after saving.
                            </p>
                          ) : null}
                          <section aria-label="Saved policy readiness">
                            <p className="text-sm text-muted-foreground">
                              Saved policy blockers — draft changes have not
                              been applied.
                            </p>
                            <ReadinessBlockers
                              blockers={
                                model.pilots.find(
                                  (item) =>
                                    item.tenantId === scope.tenantId &&
                                    item.locationId === scope.locationId
                                )?.blockers || []
                              }
                            />
                          </section>
                          <Button
                            disabled={!canManage}
                            className="min-h-11"
                            variant="outline"
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                pilots: draft.pilots.filter(
                                  (item) => item !== scope
                                )
                              })
                            }
                          >
                            Remove location {scope.locationId}
                          </Button>
                        </div>
                      ))
                    )}
                  </section>
                  <Field>
                    <FieldLabel htmlFor="ai-reason">Audit reason</FieldLabel>
                    <Textarea
                      className="min-h-24"
                      id="ai-reason"
                      name="reason"
                      required
                      minLength={8}
                      maxLength={500}
                      value={reason}
                      disabled={!canManage}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <FieldDescription>
                      Explain the policy change. Do not include credentials or
                      customer details.
                    </FieldDescription>
                  </Field>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      className="min-h-11"
                      type="submit"
                      disabled={!canManage}
                    >
                      Review policy
                    </Button>
                  </div>
                </fieldset>
                <Button
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  type="button"
                  variant="destructive"
                  disabled={!canManage || busy || loading || Boolean(review)}
                  onClick={() => void prepare(true)}
                >
                  Disable globally
                </Button>
              </form>
            </CardContent>
            <CardFooter>
              <Button
                className="min-h-11 mr-3"
                variant="outline"
                disabled={!dirty || busy || loading || Boolean(review)}
                onClick={() => {
                  setDraft(model ? editablePolicy(model.policy) : null)
                  setReason("")
                  setError(null)
                  setNotice(null)
                }}
              >
                Discard draft
              </Button>
              <p className="text-sm text-muted-foreground">
                {canManage
                  ? "Saving requires a recent sign-in and MFA verification."
                  : "You have read-only access."}
              </p>
            </CardFooter>
          </Card>
          {review ? (
            <Card>
              <CardHeader>
                <CardTitle>Confirm policy change</CardTitle>
                <CardDescription>
                  Revision {review.preview.revision}. Effective inference
                  remains Off while readiness is blocked.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p>
                  Global: {explain(review.preview.policy.requestedMode)} ·{" "}
                  {review.preview.policy.pilots.length} pilot locations
                </p>
                <p>
                  Timeout {review.preview.policy.timeoutMs} ms · freshness{" "}
                  {review.preview.policy.freshnessMs} ms
                </p>
                <p className="break-words">Reason: {review.reason}</p>
              </CardContent>
              <CardFooter className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? (
                    <LoaderCircle
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : null}
                  Save policy
                </Button>
                <Button
                  className="min-h-11"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setReview(null)}
                >
                  Cancel review
                </Button>
              </CardFooter>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Capture and diagnostics</CardTitle>
              <CardDescription>
                Private observation capture has its own privacy gates.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <details>
                <summary className="min-h-11 cursor-pointer py-3 font-medium">
                  Advanced diagnostics
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt>Predictor candidate</dt>
                      <dd className="break-all">{model.predictor.version}</dd>
                      <dd>
                        {model.predictor.kind} ·{" "}
                        {explain(model.predictor.target)}
                      </dd>
                    </div>
                    <div>
                      <dt>Saved policy revision</dt>
                      <dd>{model.policy.revision}</dd>
                    </div>
                  </dl>
                  <p className="break-words text-sm">
                    Readiness code: {model.readiness.status}. Blocker codes:{" "}
                    {model.readiness.blockers.join(", ") || "none reported"}.
                  </p>
                  <p>
                    Capture: {explain(model.capture.status)} · privacy approval:{" "}
                    {explain(model.capture.privacyApproval)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {model.capture.detail}
                  </p>
                  <p>
                    Forecast support, latency, errors and last evidence:{" "}
                    {explain(model.diagnostics.status)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    No resource inference metrics have been collected by this
                    controller.
                  </p>
                </div>
              </details>
            </CardContent>
          </Card>
        </>
      ) : null}
      <PlatformResourceInventory
        live={live}
        canRead={canReadResources}
        onSessionExpired={onSessionExpired}
      />
    </div>
  )
}
