import { useState, type ReactNode } from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type PlatformDataTableProps<TData> = {
  columns: ColumnDef<TData>[]
  data: TData[]
  emptyMessage: string
  tableClassName?: string
  stickyColumnId?: string
  searchColumn?: string
  searchPlaceholder?: string
  pageSize?: number
  serverPagination?: { pageIndex: number; pageCount: number; onPageIndexChange: (pageIndex: number) => void }
  serverSearch?: { value: string; totalCount: number; onChange: (value: string) => void }
  rowActions?: (row: TData) => ReactNode
  onRowClick?: (row: TData) => void
  getRowLabel?: (row: TData) => string
  isRowSelected?: (row: TData) => boolean
}

export function PlatformDataTable<TData>({ columns, data, emptyMessage, tableClassName, stickyColumnId, searchColumn, searchPlaceholder = "Search records…", pageSize = 10, serverPagination, serverSearch, rowActions, onRowClick, getRowLabel, isRowSelected }: PlatformDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize })
  const resolvedColumns: ColumnDef<TData>[] = rowActions ? [...columns, {
    id: "actions",
    header: () => null,
    enableSorting: false,
    cell: ({ row }) => rowActions(row.original),
  }] : columns
  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: { sorting, columnFilters, pagination: serverPagination ? { pageIndex: serverPagination.pageIndex, pageSize } : pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: (updater) => {
      if (!serverPagination) { setPagination(updater); return }
      const current = { pageIndex: serverPagination.pageIndex, pageSize }
      const next = typeof updater === "function" ? updater(current) : updater
      serverPagination.onPageIndexChange(next.pageIndex)
    },
    manualFiltering: Boolean(serverSearch),
    manualPagination: Boolean(serverPagination),
    ...(serverPagination ? { pageCount: serverPagination.pageCount } : {}),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const searchableColumn = searchColumn ? table.getColumn(searchColumn) : undefined
  const filteredCount = serverSearch?.totalCount ?? table.getFilteredRowModel().rows.length
  const pageCount = serverPagination?.pageCount ?? table.getPageCount()
  const currentPageIndex = serverPagination?.pageIndex ?? pagination.pageIndex

  return (
    <div className="grid min-w-0 gap-3">
      {searchableColumn ? <div className="flex flex-col justify-between gap-3 border-y py-3 sm:flex-row sm:items-center"><div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={searchPlaceholder} className="pl-9" placeholder={searchPlaceholder} value={serverSearch?.value ?? (searchableColumn.getFilterValue() as string) ?? ""} onChange={(event) => serverSearch ? serverSearch.onChange(event.target.value) : searchableColumn.setFilterValue(event.target.value)} /></div><p className="text-xs text-muted-foreground">{filteredCount} {filteredCount === 1 ? "record" : "records"}</p></div> : null}
      <ScrollArea className="min-w-0 w-full">
        <div className="min-w-max">
          <Table className={tableClassName}>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => <TableRow key={headerGroup.id}>{headerGroup.headers.map((header) => <TableHead key={header.id} className={header.column.id === stickyColumnId ? "sticky right-0 z-20 border-l bg-background" : undefined}>{header.isPlaceholder ? null : header.column.getCanSort() ? <Button variant="ghost" size="sm" className="-ml-3 min-h-11 min-w-11 gap-1 font-semibold uppercase tracking-wide text-muted-foreground sm:min-h-8 sm:min-w-8" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === "asc" ? <ArrowUp data-icon="inline-end" /> : header.column.getIsSorted() === "desc" ? <ArrowDown data-icon="inline-end" /> : <ArrowUpDown data-icon="inline-end" />}</Button> : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => { const selected = isRowSelected?.(row.original) ?? false; return <TableRow key={row.id} data-state={selected ? "selected" : undefined} aria-selected={selected || undefined} tabIndex={onRowClick ? 0 : undefined} aria-label={onRowClick ? getRowLabel?.(row.original) : undefined} className={onRowClick ? "group cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring data-[state=selected]:bg-accent/70 data-[state=selected]:hover:bg-accent" : stickyColumnId ? "group" : undefined} onClick={onRowClick ? (event) => { const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null; if (!target || !event.currentTarget.contains(target)) return; if (!target.closest("button,a,input,select,textarea")) onRowClick(row.original) } : undefined} onKeyDown={onRowClick ? (event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onRowClick(row.original) } } : undefined}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id} className={cell.column.id === stickyColumnId ? "sticky right-0 z-10 border-l bg-background group-hover:bg-muted/50 group-data-[state=selected]:bg-accent/70" : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow> }) : <TableRow><TableCell className="h-24 text-center text-muted-foreground" colSpan={resolvedColumns.length}>{emptyMessage}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {pageCount > 1 ? <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Page {currentPageIndex + 1} of {pageCount}</span><div className="flex items-center gap-1"><Button variant="outline" size="icon-xs" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button><Button variant="outline" size="icon-xs" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button></div></div> : null}
    </div>
  )
}
