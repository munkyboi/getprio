import { useId, useMemo, useState, type ReactNode } from "react";
import { IconArrowsSort, IconSearch } from "@tabler/icons-react";
import { QueueViewPicker } from "./LiveQueueWidgets";
import { getQueueCustomerFullNameLabel } from "../utils/queueNames";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Input } from "./components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";

export interface QueueRecoveryTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerDisplayName?: string | null;
  status: string;
  createdAt: string | Date;
  joinChannel?: string;
  carriedOverAt?: string | Date | null;
  rejoinDeadlineAt?: string | Date | null;
  lookupCode?: string;
}
const sortOptions = [
  { value: "loaded", label: "Default order" },
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
  { value: "customer", label: "Customer" },
  { value: "ticket", label: "Ticket" },
];
export function recoveryRows<T extends QueueRecoveryTicket>(tickets: readonly T[], search: string, sort: string): T[] {
  const query = search.trim().toLocaleLowerCase();
  const rows = tickets.filter(ticket => !query || [ticket.ticketNumber, getQueueCustomerFullNameLabel(ticket.customerName, ticket.customerDisplayName), ticket.joinChannel || ""].join(" ").toLocaleLowerCase().includes(query));
  if (sort === "loaded") return rows;
  return rows.sort((a, b) => {
    if (sort === "ticket") return a.ticketNumber.localeCompare(b.ticketNumber, undefined, { numeric: true });
    if (sort === "customer") return getQueueCustomerFullNameLabel(a.customerName, a.customerDisplayName).localeCompare(getQueueCustomerFullNameLabel(b.customerName, b.customerDisplayName));
    const time = (ticket: T) => { const value = new Date(ticket.createdAt).getTime(); return Number.isFinite(value) ? value : 0; };
    return sort === "newest" ? time(b) - time(a) : time(a) - time(b);
  });
}

/** Loaded snapshot presentation only. Recovery commands remain owned by the page. */
export function QueueRecoveryTable({ tickets, view, includeCurrent, onViewChange, formatDateTime, isPriorityRecovery, carryOverStatus, notice, renderRestore }: {
  tickets: readonly QueueRecoveryTicket[];
  view: "overflow" | "recovery";
  includeCurrent: boolean;
  onViewChange: (value: string) => void;
  formatDateTime: (value: string | Date | null | undefined) => string;
  isPriorityRecovery: (value: string | Date | null | undefined) => boolean;
  carryOverStatus: (status: string) => string;
  notice?: ReactNode;
  renderRestore: (ticket: QueueRecoveryTicket, priority: boolean) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("loaded");
  const [page, setPage] = useState(0);
  const headingId = useId();
  const rows = useMemo(() => recoveryRows(tickets, search, sort), [tickets, search, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, pages - 1);
  const carried = view === "overflow";
  const label = carried ? "Carry-over queue" : "Missed ticket recovery";
  return <section className="request-data-table recovery-data-table" aria-labelledby={headingId}>
    <div className="ops-list-heading request-card-heading"><div>
      <h3 id={headingId} className="ops-heading">Carry-over and missed requests</h3>
      <p className="ops-muted">{carried ? "Carried-over tickets are read-only here." : "Review missed tickets and their recovery window before restoring."}</p>
    </div></div>
    <div className="request-table-surface">
      <div className="request-filter-surface recovery-filter-surface">
        <QueueViewPicker data={[...(includeCurrent ? [{ value: "current", label: "Current queue" }] : []), { value: "overflow", label: "Carried over" }, { value: "recovery", label: "Missed recovery" }]} value={view} onChange={value => { setSearch(""); setPage(0); onViewChange(value); }} />
        <div className="request-table-toolbar recovery-table-toolbar">
          <div className="request-search-field"><IconSearch aria-hidden="true" /><Input aria-label={`Search loaded ${carried ? "carried-over" : "missed"} tickets`} placeholder="Search ticket or customer…" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></div>
          <div className="request-filter-controls"><Select items={sortOptions} value={sort} onValueChange={value => { if (value !== null) { setSort(value); setPage(0); } }}>
            <SelectTrigger className="request-select-control" aria-label="Sort loaded recovery tickets"><IconArrowsSort aria-hidden="true" data-icon="inline-start" /><SelectValue /></SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}><SelectGroup>{sortOptions.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select></div>
        </div>
      </div>
      {notice ? <div className="recovery-notice">{notice}</div> : null}
      <div className="request-table-body-surface" role="region" aria-label={label} tabIndex={0}>
        <Table aria-label={label}><TableHeader><TableRow>
          <TableHead scope="col">Request</TableHead>
          {carried ? <><TableHead scope="col">Channel</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Activated at</TableHead></> : <TableHead scope="col">Recovery</TableHead>}
          <TableHead scope="col">Joined</TableHead>
          {!carried ? <TableHead scope="col">Actions</TableHead> : null}
        </TableRow></TableHeader><TableBody>
          {rows.slice(currentPage * 10, currentPage * 10 + 10).map(ticket => {
            const priority = isPriorityRecovery(ticket.rejoinDeadlineAt);
            return <TableRow key={ticket.id}>
              <TableCell data-label="Request"><strong>{ticket.ticketNumber || "Ticket"}</strong><p className="ops-muted">{getQueueCustomerFullNameLabel(ticket.customerName, ticket.customerDisplayName)}</p></TableCell>
              {carried ? <>
                <TableCell data-label="Channel"><Badge variant="outline">{ticket.joinChannel || "Unavailable"}</Badge></TableCell>
                <TableCell data-label="Status"><Badge variant="outline">{carryOverStatus(ticket.status)}</Badge></TableCell>
                <TableCell data-label="Activated at">{ticket.carriedOverAt ? formatDateTime(ticket.carriedOverAt) : "—"}</TableCell>
              </> : <TableCell data-label="Recovery"><Badge variant="outline">{priority ? "Recovery priority" : "Normal priority"}</Badge><p className="ops-muted">{ticket.rejoinDeadlineAt ? `${priority ? "Priority until" : "Recovery expired"} ${formatDateTime(ticket.rejoinDeadlineAt)}` : "No recovery deadline"}</p></TableCell>}
              <TableCell data-label="Joined">{formatDateTime(ticket.createdAt)}</TableCell>
              {!carried ? <TableCell data-label="Actions">{renderRestore(ticket, priority)}</TableCell> : null}
            </TableRow>;
          })}
          {!rows.length ? <TableRow><TableCell colSpan={carried ? 5 : 4}><p>{search.trim() ? "No matching loaded tickets." : carried ? "No carried-over tickets." : "No missed tickets to recover."}</p><p className="ops-muted">{search.trim() ? "Try another ticket number or customer name." : carried ? "Waiting tickets carried over from a previous queue day will appear here." : "Missed tickets will appear here while they are still available for recovery."}</p></TableCell></TableRow> : null}
        </TableBody></Table>
      </div>
      <div className="request-table-pagination"><span>{rows.length ? currentPage * 10 + 1 : 0}–{Math.min((currentPage + 1) * 10, rows.length)} of {rows.length} loaded tickets</span><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>Page {currentPage + 1} of {pages}</span><Button variant="outline" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
    </div>
  </section>;
}
