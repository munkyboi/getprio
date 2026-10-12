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
        setLoading(true)
        setRefresh((value) => value + 1)
        throw new Error(
          "The policy changed. Review the refreshed policy again."
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
    setBusy(true)
    setError(null)
    try {
      const result = await api.searchScopes(query)
      setScopes(result.scopes)
      setLimited(result.limited)
      setSearched(true)
    } catch (cause) {
      reportFailure(cause, "Location search failed.")
    } finally {
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
          disabled={busy || loading}
          onClick={() => {
            setLoading(true)
            setRefresh((value) => value + 1)
          }}
        >
          <RefreshCw data-icon="inline-start" />
          Refresh policy
        </Button>
      </div>
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
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt>Requested mode</dt>
                  <dd>
                    <Badge variant="secondary">
                      {explain(model.policy.requestedMode)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt>Effective mode</dt>
                  <dd>
                    <Badge variant="secondary">
                      {explain(model.effectiveMode)}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt>Predictor</dt>
                  <dd className="break-all">{model.predictor.version}</dd>
                  <dd>
                    {model.predictor.kind} · {explain(model.predictor.target)}
                  </dd>
                </div>
                <div>
                  <dt>Policy revision</dt>
                  <dd>{model.policy.revision}</dd>
                </div>
              </dl>
              <Alert>
                <ShieldCheck />
                <AlertTitle>
                  Readiness: {explain(model.readiness.status)}
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-inside list-disc">
                    {model.readiness.blockers.map((blocker) => (
                      <li key={blocker}>{explain(blocker)}</li>
                    ))}
                  </ul>
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
                onSubmit={(event) => {
                  event.preventDefault()
                  void prepare()
                }}
              >
                <fieldset
                  disabled={!canManage || busy || loading || Boolean(review)}
                  className="flex min-w-0 flex-col gap-5"
                >
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Global mode</FieldLabel>
                      <ToggleGroup
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
                    <Field>
                      <FieldLabel htmlFor="ai-timeout">Timeout (ms)</FieldLabel>
                      <Input
                        className="min-h-11"
                        id="ai-timeout"
                        name="timeoutMs"
                        type="number"
                        min={1}
                        max={1000}
                        required
                        value={draft.timeoutMs}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            timeoutMs: Number(event.target.value)
                          })
                        }
                      />
                      <FieldDescription>
                        1–1,000 ms. Late synchronous results are discarded; this
                        is not a hard CPU deadline.
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
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            freshnessMs: Number(event.target.value)
                          })
                        }
                      />
                      <FieldDescription>
                        1–5,000 ms. Freshness must be rechecked when accepting a
                        result.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="ai-scope-search">
                        Find pilot locations
                      </FieldLabel>
                      <Input
                        className="min-h-11"
                        id="ai-scope-search"
                        value={query}
                        maxLength={100}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      <Button
                        className="min-h-11"
                        type="button"
                        variant="outline"
                        onClick={() => void search()}
                      >
                        Search locations
                      </Button>
                      {searched && !scopes.length ? (
                        <FieldDescription>
                          No locations match this search.
                        </FieldDescription>
                      ) : null}
                      {limited ? (
                        <FieldDescription>
                          Showing 50 results. Refine the search to find another
                          location.
                        </FieldDescription>
                      ) : null}
                    </Field>
                    {scopes.length ? (
                      <Field>
                        <FieldLabel htmlFor="ai-pilot">
                          Add pilot location
                        </FieldLabel>
                        <Select
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
                                  key={`${scope.tenantId}:${scope.locationId}`}
                                  value={`${scope.tenantId}:${scope.locationId}`}
                                >
                                  {scope.tenantName} · {scope.locationName}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
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
                          <Button
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
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <FieldDescription>
                      Explain the policy change. Do not include credentials or
                      customer details.
                    </FieldDescription>
                  </Field>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="min-h-11" type="submit">
                      Review policy
                    </Button>
                  </div>
                </fieldset>
                <Button
                  className="mt-3 min-h-11 w-full sm:w-auto"
                  type="button"
                  variant="destructive"
                  disabled={!canManage || busy || loading}
                  onClick={() => void prepare(true)}
                >
                  Disable globally
                </Button>
              </form>
            </CardContent>
            <CardFooter>
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
            </CardContent>
          </Card>
        </>
      ) : null}
      <PlatformResourceInventory live={live} canRead={canReadResources} onSessionExpired={onSessionExpired} />
    </div>
  )
}
