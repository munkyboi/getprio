import { Link, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Paper, Select, SimpleGrid, Stack, Switch, Text, TextInput } from "@mantine/core";
import { apiRequest, ApiError } from "../api";
import { PortalDataTable, type PortalTableColumn } from "./PortalDataTable";

type Row = Record<string, unknown>;
type Page = { items: Row[]; pagination: { page: number; limit: number; hasNext: boolean; snapshot?: string } };
type Filters = Record<string, string>;

export function ManagedRecordsPage({ token, kind, columns, emptyLabel }: {
  token: string; kind: "tenants" | "users" | "audit"; columns: PortalTableColumn<Row>[]; emptyLabel: string;
}) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>({});
  const [query, setQuery] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("25");
  const [data, setData] = useState<Page | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(true);
  const [updated, setUpdated] = useState("");
  const [refresh, setRefresh] = useState(0);
  const detailRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (detail) detailRef.current?.focus(); }, [detail]);
  const snapshot = useRef<string | undefined>(undefined);
  const audit = kind === "audit";

  useEffect(() => {
    const timer = window.setTimeout(() => { snapshot.current = undefined; setPage(1); setQuery(filters); }, 300);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let stopped = false;
    async function load() {
      if (running || stopped || controller.signal.aborted) return;
      running = true;
      setLoading(true);
      const params = new URLSearchParams({ ...query, page: String(page), limit });
      if (audit && page > 1 && snapshot.current) params.set("snapshot", snapshot.current);
      try {
        const response = await apiRequest<Page>(`/platform/${audit ? "security-audit-events" : kind}?${params}`, { token, signal: controller.signal });
        if (controller.signal.aborted) return;
        snapshot.current = response.pagination.snapshot;
        setData(response);
        setError("");
        setUpdated(new Date().toLocaleTimeString());
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "Unable to load records.");
        if (failure instanceof ApiError && [401, 403].includes(failure.status)) {
          stopped = true;
          setData(null);
        }
      } finally {
        running = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          if (audit && live && page === 1 && !stopped) timer = setTimeout(() => {
            if (document.visibilityState === "visible") void load();
          }, 5000);
        }
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && audit && live && page === 1) {
        clearTimeout(timer);
        void load();
      }
    };
    setData(null);
    setDetail(null);
    void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [audit, kind, limit, live, page, query, refresh, token]);

  const change = (key: string, value: string | null) => setFilters((current) => ({ ...current, [key]: value || "" }));
  const changing = filters !== query;
  const currentData = data?.pagination.page === page && data.pagination.limit === Number(limit) ? data : null;
  return <Stack gap="md" className="managed-records">
    <Paper className="portal-card" p="md">
      <Stack>
        <TextInput label="Search" placeholder={audit ? "Action, actor, resource, reason, or ID" : "Name, username, or ID"} value={filters.search || ""} onChange={(event) => change("search", event.currentTarget.value)} />
        <SimpleGrid cols={{ base: 1, sm: 2, lg: audit ? 4 : 2 }}>
          {kind === "tenants" && <><Select label="Status" clearable placeholder="All statuses" data={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} value={filters.status || null} onChange={(value) => change("status", value)} /><TextInput label="Plan" placeholder="All plans (enter a plan slug to filter)" value={filters.plan || ""} onChange={(event) => change("plan", event.currentTarget.value)} /></>}
          {kind === "users" && <Select label="Role" clearable placeholder="All roles" data={[{ value: "customer", label: "Customer" }, { value: "owner", label: "Vendor Admin (owner)" }, { value: "admin", label: "Vendor Admin" }, { value: "staff", label: "Vendor Staff" }, { value: "platform_admin", label: "Platform Admin" }]} value={filters.role || null} onChange={(value) => change("role", value)} />}
          {audit && <><Select label="Outcome" clearable placeholder="All outcomes" data={["success", "failed", "denied", "conflict", "pending"]} value={filters.outcome || null} onChange={(value) => change("outcome", value)} /><TextInput label="Tenant ID" value={filters.tenantId || ""} onChange={(event) => change("tenantId", event.currentTarget.value)} /><TextInput type="date" label="From (UTC)" value={filters.from || ""} onChange={(event) => change("from", event.currentTarget.value)} /><TextInput type="date" label="Through (UTC)" value={filters.to || ""} onChange={(event) => change("to", event.currentTarget.value)} /></>}
        </SimpleGrid>
        <Group justify="space-between">
          <Button variant="subtle" mih={44} onClick={() => setFilters({})}>Clear filters</Button>
          {audit && <Switch label="Auto-refresh every 5 seconds" checked={live} onChange={(event) => setLive(event.currentTarget.checked)} />}
          <Button variant="light" mih={44} disabled={loading || changing} onClick={() => setRefresh((value) => value + 1)}>Refresh</Button>
        </Group>
      </Stack>
    </Paper>
    {error && <Alert color="red" title="Could not update records">{error} Use Refresh to retry.</Alert>}
    <Text size="sm" c="dimmed" role="status">{loading || changing ? "Updating records…" : updated ? `Updated ${updated}` : "Loading records…"}{audit && page > 1 ? " · Auto-refresh paused while viewing older events." : ""}</Text>
    <PortalDataTable key={`${page}-${limit}-${JSON.stringify(query)}`} rows={currentData?.items || []} onRowClick={kind === "tenants" ? (row) => navigate(`/tenants/${encodeURIComponent(String(row.id))}/entitlements`) : undefined} columns={kind === "tenants" ? columns.map((column) => column.key === "name" ? { ...column, render: (row) => <Text component={Link} to={`/tenants/${encodeURIComponent(String(row.id))}/entitlements`} className="tenant-record-link">{String(row.name)}</Text> } : column) : audit ? [...columns, { key: "details", label: "Details", render: (row) => <Button variant="subtle" mih={44} onClick={() => setDetail(row)}>View event</Button> }] : columns} emptyLabel={loading || changing ? "Loading records…" : error ? "Records unavailable." : emptyLabel} virtualized={audit} />
    {detail && <Paper ref={detailRef} tabIndex={-1} className="portal-card" p="md" role="region" aria-label="Event details"><Group justify="space-between"><Text fw={700}>Event {String(detail.id)}</Text><Button variant="subtle" mih={44} onClick={() => setDetail(null)}>Close details</Button></Group>{Object.entries(detail).map(([key, value]) => <Text key={key} style={{ overflowWrap: "anywhere" }}><strong>{key.replaceAll("_", " ")}: </strong>{String(value ?? "—")}</Text>)}</Paper>}
    <Group justify="space-between" className="records-pagination">
      <Select label="Rows per page" value={limit} data={["25", "50", "100"]} onChange={(value) => { setLimit(value || "25"); setPage(1); snapshot.current = undefined; }} allowDeselect={false} />
      <Group><Button mih={44} variant="default" disabled={page === 1 || loading || changing} onClick={() => setPage((value) => value - 1)}>Previous</Button><Text>Page {page}</Text><Button mih={44} variant="default" disabled={!currentData?.pagination.hasNext || loading || changing || !!error} onClick={() => setPage((value) => value + 1)}>Next</Button></Group>
    </Group>
    <Text size="xs" c="dimmed">Scroll the table horizontally to view all columns.{kind === "tenants" ? " Select a tenant row to manage its entitlements. User ID identifies the first active owner account." : ""}</Text>
  </Stack>;
}
