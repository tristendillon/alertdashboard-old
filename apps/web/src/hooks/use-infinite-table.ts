"use client";

import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type TableOptions,
} from "@tanstack/react-table";
import * as React from "react";

interface UseInfiniteTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  getRowId: TableOptions<TData>["getRowId"];
}

/**
 * TanStack table for infinite-scroll lists: row selection only — ordering,
 * search, and pagination all live server-side (see useSearchList).
 */
export function useInfiniteTable<TData>({
  data,
  columns,
  getRowId,
}: UseInfiniteTableProps<TData>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // `data` is the server-filtered page: changing the search (`?q=`) or an
  // extra filter such as `?group=` re-runs the query, and a delete drops a
  // row. Selection is keyed by row id, so any id no longer in `data` is stale
  // — keeping it means clearing the search brings back a "N selected" bar for
  // rows the user watched disappear, and the next export or bulk action
  // silently includes them. Drop stale ids while rendering rather than in an
  // effect so the table never observes the stale selection; this converges
  // (the pruned selection has no unknown ids left) so it cannot loop.
  const rowIds = React.useMemo(() => {
    const ids = new Set<string>();
    data.forEach((row, index) => {
      ids.add(getRowId ? getRowId(row, index) : String(index));
    });
    return ids;
  }, [data, getRowId]);

  if (Object.keys(rowSelection).some((id) => !rowIds.has(id))) {
    setRowSelection((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => rowIds.has(id)),
      ),
    );
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    state: { rowSelection },
    getRowId,
  });

  return { table };
}
