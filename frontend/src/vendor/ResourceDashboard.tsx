import { useContext, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { IconArrowRight, IconAlertTriangle, IconChartBar, IconRefresh, IconUsers, IconStack2 } from "@tabler/icons-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./components/ui/chart";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./components/ui/sheet";
import { VendorPortal } from "./portal";
import { useResourceDashboard } from "./useResourceDashboard";
import { dashboardScopeKey, poolAvailabilityReason, poolUtilization, type DashboardModel, type DashboardScope } from "./resourceDashboardModel";

const chartConfig = { allocated: { label: "Used capacity (%)", color: "var(--primary)" }, requests: { label: "Loaded requests", color: "var(--primary)" } };
export type ResourceDashboardProps = { token: string | null; scope: DashboardScope; canOpenQueue: boolean; onOpenQueue(): void };
export function ResourceDashboard({token, scope, canOpenQueue, onOpenQueue}: ResourceDashboardProps) {
  const {query, enabled, offline, disconnected, accessDenied, stale} = useResourceDashboard(token, scope);
  return <ResourceDashboardView key={`${dashboardScopeKey(scope)}:${accessDenied}`} model={accessDenied ? undefined : query.data} loading={enabled && query.isPending}
    refreshing={query.isFetching} unavailable={!enabled} error={query.error?.message || (offline || disconnected ? "Updates disconnected. Reconnecting…" : undefined)} stale={stale}
    canOpenQueue={canOpenQueue} onRetry={() => void query.refetch()} onOpenQueue={onOpenQueue} />;
}
type ViewProps = { canOpenQueue?: boolean; model?: DashboardModel; loading: boolean; refreshing: boolean; unavailable: boolean; error?: string; stale: boolean; onRetry(): void; onOpenQueue(): void };
export function ResourceDashboardView({model, loading, refreshing, unavailable, error, stale, canOpenQueue = true, onRetry, onOpenQueue}: ViewProps) {
  const portal = useContext(VendorPortal);
  const [selected, setSelected] = useState<{scope: string; poolId: string} | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pool = selected?.scope === model?.scopeKey ? model?.pools.find(item => item.id === selected?.poolId) : undefined;
  const chartPools = model?.pools.flatMap(item => {
    const percentage = poolUtilization(item);
    return percentage === null ? [] : [{name: item.name, allocated: percentage, id: item.id}];
  }) || [];
  const requestStates = model ? [{name: "Loaded waiting", requests: model.loadedWaiting}, {name: "Loaded called", requests: model.loadedCalled}] : [];
  const updated = model ? new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "medium"}).format(new Date(model.asOf)) : null;
  const inspectPool = (id: string, button: HTMLButtonElement) => { trigger.current = button; if (model) setSelected({scope: model.scopeKey, poolId: id}); };
  return <div className="vendor-operations resource-dashboard" aria-busy={loading}>
    <div className="resource-dashboard-toolbar">
      <div><span className="resource-dashboard-eyebrow">AT A GLANCE</span><p role="status">{loading ? "Loading updates…" : model ? `Last updated · ${updated}` : "Updates unavailable"}</p></div>
      <div className="resource-dashboard-actions"><Button variant="outline" disabled={refreshing || unavailable} onClick={onRetry}><IconRefresh aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}</Button><Button disabled={!canOpenQueue} title={!canOpenQueue ? "Live queue access is unavailable for this account." : undefined} onClick={onOpenQueue}>Live queue<IconArrowRight aria-hidden="true" /></Button></div>
    </div>
    {(error || stale || unavailable) && <div className="resource-dashboard-notice" role={error ? "alert" : "status"}><IconAlertTriangle aria-hidden="true" /><div><strong>{model ? "Updates may be out of date" : "Dashboard data unavailable"}</strong><p>{error || (unavailable ? "Resource updates are unavailable in this workspace." : "Refresh to check current conditions.")}</p>{model && <p>Showing the last received update.</p>}</div></div>}
    <div className="resource-dashboard-metrics">
      <Metric title="Waiting now" value={model?.readyToCall} icon={<IconUsers aria-hidden="true" />} loading={loading} detail="Excludes bookings scheduled for later." />
      <Metric title="Requests using resources" value={model?.requestsWithAllocations} icon={<IconStack2 aria-hidden="true" />} loading={loading} detail="Counts reflect currently loaded requests." />
      <Metric title="Pools needing attention" value={model?.attentionPoolCount ?? undefined} icon={<IconAlertTriangle aria-hidden="true" />} loading={loading} detail={model?.attentionPoolCount == null ? "Some pool availability is unknown." : "Pools with capacity or overdue items to review."} />
    </div>
    <Card><CardHeader><CardTitle>Resource utilization by pool</CardTitle><CardDescription>Used capacity for each resource pool.</CardDescription></CardHeader><CardContent>
      {loading ? <div className="resource-dashboard-chart-skeleton" aria-label="Loading chart" /> : !model ? <EmptyObservation /> : model.pools.length === 0 ? <p>No resource pools to show for this location.</p> : <>
        {chartPools.length > 0 && <ChartContainer className="resource-dashboard-utilization-chart" config={chartConfig} style={{height: Math.max(180, chartPools.length * 48)}} aria-label="Used capacity percentage for each tracked pool">
          <BarChart accessibilityLayer data={chartPools} layout="vertical" margin={{left: 0, right: 20}}><CartesianGrid horizontal={false} /><XAxis type="number" unit="%" domain={[0, (maximum: number) => Math.max(100, maximum)]} /><YAxis type="category" dataKey="name" width={105} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="allocated" fill="var(--color-allocated)" radius={4} isAnimationActive={false} /></BarChart>
        </ChartContainer>}
        <ul className="resource-dashboard-pool-list">{model.pools.map(item => <li key={item.id}><button type="button" onClick={event => inspectPool(item.id, event.currentTarget)}><span><strong>{item.name}</strong><small>{poolUtilization(item) !== null ? `${item.allocatedUnits} used / ${formatUnits(item.capacity)} · ${Math.round(poolUtilization(item)!)}%` : "Usage unavailable"}</small><small>{item.availabilityQuality === "observed" && item.capacity > 0 ? `${formatUnits(item.availableUnits)} available${stale ? " at last update" : " now"}` : `Availability unknown · ${poolAvailabilityReason(item)}`}</small></span><IconArrowRight aria-hidden="true" /></button></li>)}</ul>
      </>}
    </CardContent></Card>
    <div className="resource-dashboard-detail-grid">
      <Card><CardHeader><CardTitle>Requests by loaded state</CardTitle><CardDescription>Counts reflect currently loaded requests.</CardDescription></CardHeader><CardContent>
        {loading ? <div className="resource-dashboard-chart-skeleton" aria-label="Loading chart" /> : !model ? <EmptyObservation /> : <><ChartContainer className="resource-dashboard-state-chart" config={chartConfig} aria-label="Loaded waiting and called request counts"><BarChart accessibilityLayer data={requestStates}><CartesianGrid vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="requests" fill="var(--color-requests)" radius={4} isAnimationActive={false} /></BarChart></ChartContainer><dl className="resource-dashboard-state-values"><div><dt>Loaded waiting requests</dt><dd>{model.loadedWaiting}</dd></div><div><dt>Loaded called requests</dt><dd>{model.loadedCalled}</dd></div></dl></>}
      </CardContent></Card>
      {Boolean(model?.attention.length) && <Card className="resource-dashboard-attention"><CardHeader><CardTitle>Needs attention</CardTitle><CardDescription>Items to review in this location.</CardDescription></CardHeader><CardContent><ul>{model!.attention.map((item, index) => <li key={`${item.poolId}:${index}`}><strong>{item.title}</strong><p>{item.detail}</p>{item.poolId ? <Button variant="outline" onClick={event => inspectPool(item.poolId!, event.currentTarget)}>View pool<IconArrowRight aria-hidden="true" /></Button> : <Button variant="outline" disabled={!canOpenQueue} title={!canOpenQueue ? "Live queue access is unavailable for this account." : undefined} onClick={onOpenQueue}>Review Live queue<IconArrowRight aria-hidden="true" /></Button>}</li>)}</ul></CardContent></Card>}
    </div>
    <p className="resource-dashboard-footnote">Updates refresh automatically. Manage requests in Live queue.</p>
    <Sheet open={Boolean(pool)} onOpenChange={open => { if (!open) setSelected(null); }}><SheetContent container={portal} className="resource-dashboard-sheet" finalFocus={trigger}>
      <SheetHeader><SheetTitle>{pool?.name || "Pool details"}</SheetTitle><SheetDescription>Pool capacity · {updated}. {stale ? "Last updated; refresh before acting." : "Availability can change."}</SheetDescription></SheetHeader>
      {pool && <div className="resource-dashboard-sheet-body"><dl className="resource-dashboard-pool-details"><Detail label="Configured capacity" value={pool.capacity} /><Detail label="Used units" value={pool.allocatedUnits} /><div><dt>Available units</dt><dd>{pool.availabilityQuality === "observed" && pool.capacity > 0 ? formatUnits(pool.availableUnits) : "Unavailable"}</dd></div><Detail label="Protected demand" value={pool.protectedUnitsNow} /><Detail label="Overdue units" value={pool.overdueUnits} /></dl><p>Protected demand is capacity held for waiting requests or bookings. Overdue units are included in used units; time elapsed does not free capacity.</p><p>{pool.availabilityQuality === "observed" ? "Availability was checked at the time shown above." : `Availability unknown. ${poolAvailabilityReason(pool)}`}</p><Button disabled={!canOpenQueue} title={!canOpenQueue ? "Live queue access is unavailable for this account." : undefined} onClick={onOpenQueue}>Open Live queue<IconArrowRight aria-hidden="true" /></Button></div>}
    </SheetContent></Sheet>
  </div>;
}
function Metric({title, detail, icon, loading, value}: {title: string; detail: string; icon: React.ReactNode; loading: boolean; value?: number}) {
  return <Card><CardHeader><div className="resource-dashboard-metric-heading"><CardTitle>{title}</CardTitle>{icon}</div></CardHeader><CardContent>{loading ? <div className="resource-dashboard-metric-skeleton" aria-label="Loading metric" /> : <><strong className="resource-dashboard-metric-value" aria-label={`${title}: ${value ?? "unavailable"}`}>{value ?? "—"}</strong>{value === undefined && <span className="resource-dashboard-muted">Unavailable</span>}</>}<p className="resource-dashboard-muted">{detail}</p></CardContent></Card>;
}
function EmptyObservation() { return <div className="resource-dashboard-empty"><IconChartBar aria-hidden="true" /><p>No updates to show. Refresh to try again.</p></div>; }
function Detail({label, value}: {label: string; value: number}) { return <div><dt>{label}</dt><dd>{formatUnits(value)}</dd></div>; }

function formatUnits(value: number) { return `${value} ${value === 1 ? "unit" : "units"}`; }
