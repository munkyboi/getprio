import { useState, type ReactNode } from "react";
import { FieldGroup } from "./components/ui/field";
import { OperationButton, OperationEmpty, OperationInput, OperationPagination, OperationSelect } from "./OperationsUi";
import { collectionPage } from "./collectionState";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";

/** Filters the complete already-loaded collection; it never replaces a server query. */
export function ManagedCollection<T>({ items, searchText, statusOf = () => "", statuses = [], defaultStatus = "", statusTabs = false, label, children }: {
  items: T[];
  searchText: (item: T) => string;
  statusOf?: (item: T) => string;
  statuses?: { value: string; label: string }[];
  defaultStatus?: string;
  statusTabs?: boolean;
  label: string;
  children: (items: T[]) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(defaultStatus);
  const [page, setPage] = useState(1);
  const view = collectionPage(items, search, status, page, searchText, statusOf);
  return <div className="collection-view">
    {statusTabs ? <Tabs value={status} onValueChange={(value) => {setStatus(String(value));setPage(1);}}><TabsList className="config-tabs-list" aria-label={`${label} status`} activateOnFocus>{statuses.map(option => <TabsTrigger key={option.value} value={option.value}>{option.label}</TabsTrigger>)}</TabsList></Tabs> : null}
    <FieldGroup className="collection-toolbar">
      <OperationInput label={`Search ${label}`} placeholder="Search by name or details" autoComplete="off" autoCapitalize="none" spellCheck={false} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      {statuses.length && !statusTabs ? <OperationSelect label="Status" value={status || "all"} data={[{value:"all",label:"All statuses"},...statuses]} onChange={(value) => {setStatus(value === "all" ? "" : value || "");setPage(1);}} /> : null}
      <OperationButton variant="ghost" disabled={!search && (statusTabs || !status)} onClick={() => {setSearch("");if (!statusTabs) setStatus(defaultStatus);setPage(1);}}>Clear filters</OperationButton>
    </FieldGroup>
    <p className="ops-muted" role="status">{view.total ? `${view.start}–${view.end} of ${view.total}` : "0"} {label}{view.total !== items.length ? ` · ${items.length} total` : ""}</p>
    {view.total || (!items.length && !search && !status) ? children(view.items) : <OperationEmpty title={statusTabs && !search ? `No ${status} ${label}` : `No matching ${label}`} text={statusTabs && !search ? `Items with ${status} status will appear here.` : "Try another search or clear the filters."} />}
    {view.pages > 1 ? <OperationPagination label={`${label} pages`} total={view.pages} value={view.page} onChange={setPage} /> : null}
  </div>;
}
