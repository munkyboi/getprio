import { useState, type ReactNode } from "react";
import { Paper, ScrollArea, Table, Text } from "@mantine/core";

export type PortalTableColumn<T extends Record<string, unknown>> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  width?: string | number;
};

export function PortalDataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  emptyLabel,
  minWidth = 680,
  pinFirstColumn = false,
  pinLastColumn = false,
  virtualized = false,
  onRowClick
}: {
  rows: T[];
  columns: Array<PortalTableColumn<T>>;
  emptyLabel: string;
  minWidth?: number;
  pinFirstColumn?: boolean;
  pinLastColumn?: boolean;
  virtualized?: boolean;
  onRowClick?: (row: T) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 56;
  const start = virtualized ? Math.max(0, Math.min(rows.length - 1, Math.floor((scrollTop - 48) / rowHeight) - 3)) : 0;
  const end = virtualized ? Math.min(rows.length, start + 16) : rows.length;
  const firstColumnKey = columns[0]?.key;
  const lastColumnKey = columns[columns.length - 1]?.key;

  return (
    <Paper className="portal-card" p="lg">
      <ScrollArea type="auto" offsetScrollbars h={virtualized ? 480 : undefined} onScrollPositionChange={virtualized ? ({ y }) => setScrollTop(y) : undefined} viewportProps={{ tabIndex: 0, "aria-label": "Scrollable records table" }}>
        <Table
          className={`portal-data-table${virtualized ? " portal-data-table--virtual" : ""}`}
          striped
          highlightOnHover
          verticalSpacing="sm"
          withTableBorder
          withColumnBorders={false}
          miw={minWidth}
        >
          <Table.Thead>
            <Table.Tr>
              {columns.map((column) => (
                <Table.Th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={
                    column.key === firstColumnKey && pinFirstColumn
                      ? "portal-data-table__sticky portal-data-table__sticky-first"
                      : column.key === lastColumnKey && pinLastColumn
                        ? "portal-data-table__sticky portal-data-table__sticky-last"
                        : undefined
                  }
                >
                  {column.label}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {start > 0 && <Table.Tr aria-hidden="true"><Table.Td colSpan={columns.length} style={{ height: start * rowHeight, padding: 0 }} /></Table.Tr>}
            {rows.length ? (
              rows.slice(start, end).map((row, index) => (
                <Table.Tr onClick={onRowClick ? (event) => { if (!(event.target as HTMLElement).closest("a, button, input, select, textarea")) onRowClick(row); } : undefined} className={onRowClick ? "portal-data-table__linked-row" : undefined} key={String((row.id as string | number | undefined) ?? index)} style={virtualized ? { height: rowHeight } : undefined}>
                  {columns.map((column) => (
                    <Table.Td
                      key={column.key}
                      style={{
                        width: column.width,
                        whiteSpace: "nowrap"
                      }}
                      className={
                        column.key === firstColumnKey && pinFirstColumn
                          ? "portal-data-table__sticky portal-data-table__sticky-first"
                          : column.key === lastColumnKey && pinLastColumn
                            ? "portal-data-table__sticky portal-data-table__sticky-last"
                            : undefined
                      }
                    >
                      <div className={virtualized ? "portal-data-table__cell-preview" : undefined} title={virtualized ? String(row[column.key] ?? "") : undefined}>{column.render ? column.render(row) : String(row[column.key] ?? "--")}</div>
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Text c="dimmed">{emptyLabel}</Text>
                </Table.Td>
              </Table.Tr>
            )}
          {end < rows.length && <Table.Tr aria-hidden="true"><Table.Td colSpan={columns.length} style={{ height: (rows.length - end) * rowHeight, padding: 0 }} /></Table.Tr>}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}
