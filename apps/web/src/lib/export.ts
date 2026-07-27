import type { Row, Table } from "@tanstack/react-table";

interface ExportOptions {
  excludeColumns?: string[];
  onlySelected?: boolean;
  filename?: string;
}

export function exportTableToCSV<TData>(
  table: Table<TData>,
  options: ExportOptions = {},
) {
  const {
    excludeColumns = [],
    onlySelected = false,
    filename = "export.csv",
  } = options;

  // Get rows to export
  const rows = onlySelected
    ? table.getFilteredSelectedRowModel().rows
    : table.getRowModel().rows;

  if (rows.length === 0) {
    return;
  }

  // Get visible columns, excluding specified ones
  const columns = table
    .getVisibleLeafColumns()
    .filter((column) => !excludeColumns.includes(column.id));

  // Generate header row
  const headers = columns
    .map((column) => {
      const header = column.columnDef.header;
      if (typeof header === "string") {
        return header;
      }
      if (typeof header === "function") {
        // For function headers, try to extract title from meta or use id
        const meta = column.columnDef.meta;
        return meta?.label || column.id;
      }
      return column.id;
    })
    .map(escapeCSVField);

  // Generate data rows
  const dataRows = rows.map((row) =>
    columns
      .map((column) =>
        escapeCSVField(formatCSVValue(getRowValue(row, column.id))),
      )
      .join(","),
  );

  // Combine header and data
  const csvContent = [headers.join(","), ...dataRows].join("\n");

  // Create and download file
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Epoch-millisecond window used to recognise timestamps stored as plain
// numbers (Convex `_creationTime`, `lastPing`, …): 2001-09-09 → 2100-01-01.
// Anything outside it is treated as an ordinary number.
const MIN_EPOCH_MS = 1_000_000_000_000;
const MAX_EPOCH_MS = 4_102_444_800_000;

/**
 * `row.getValue` only works for columns declared with an `accessorKey` /
 * `accessorFn`; display columns (an `id` plus a `cell` renderer) return
 * undefined. Fall back to the raw row data under the same key so those columns
 * export whatever the underlying record holds instead of an empty cell.
 */
function getRowValue<TData>(row: Row<TData>, columnId: string): unknown {
  const value = row.getValue(columnId);
  if (value !== undefined) {
    return value;
  }
  const original = row.original as unknown as
    Record<string, unknown> | undefined;
  return original?.[columnId];
}

function formatCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "number") {
    // Timestamps are far more readable as ISO than as an epoch number.
    if (
      Number.isFinite(value) &&
      value >= MIN_EPOCH_MS &&
      value <= MAX_EPOCH_MS
    ) {
      return new Date(value).toISOString();
    }
    return String(value);
  }
  if (typeof value === "object") {
    // Objects and arrays stringify to "[object Object]" / a lossy join.
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escapeCSVField(field: string): string {
  // If field contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (field.includes(",") || field.includes("\n") || field.includes('"')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
