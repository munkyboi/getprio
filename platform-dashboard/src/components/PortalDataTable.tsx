import type { ReactNode } from "react";
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
  pinLastColumn = false
}: {
  rows: T[];
  columns: Array<PortalTableColumn<T>>;
  emptyLabel: string;
  minWidth?: number;
  pinFirstColumn?: boolean;
  pinLastColumn?: boolean;
}) {
  const firstColumnKey = columns[0]?.key;
  const lastColumnKey = columns[columns.length - 1]?.key;

  return (
    <Paper className="portal-card" p="lg">
      <ScrollArea type="auto" offsetScrollbars>
        <Table
          className="portal-data-table"
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
            {rows.length ? (
              rows.map((row, index) => (
                <Table.Tr key={String((row.id as string | number | undefined) ?? index)}>
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
                      {column.render ? column.render(row) : String(row[column.key] ?? "--")}
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
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}
