"use client";

import { InfiniteDataTable } from "@/components/data-table/infinite-data-table";
import { CopyCell } from "@/components/ui/copy-cell";
import { TimestampCell } from "@/components/ui/timestamp-cell";
import { NumberCell } from "@/components/ui/number-cell";
import { ActionCell } from "@/components/ui/action-cell";
import { Cell, CellContent } from "@/components/ui/cell";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useInfiniteTable } from "@/hooks/use-infinite-table";
import { useSearchList } from "@/hooks/use-search-list";
import { useQuery } from "@/hooks/use-query";
import { useDrawerState } from "@/hooks/nuqs/use-drawer-state";
import { DrawerEntity, DrawerMode } from "@/lib/enums";
import { cn } from "@/utils/ui";
import { api } from "@sizeupdashboard/convex/src/api/_generated/api.js";
import type { Id } from "@sizeupdashboard/convex/src/api/_generated/dataModel.js";
import type { ViewToken } from "@sizeupdashboard/convex/src/api/schema.js";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { TableActionBar } from "@/components/table-action-bar";

export function ViewTokensTable() {
  const { open } = useDrawerState();
  const { results, status, loadMore, search, setSearch } = useSearchList(
    api.viewToken.listViewTokens,
  );

  // Live per-token online client counts; streams updates as clients ping and
  // as the cleanup cron prunes stale rows.
  const { data: presence } = useQuery(
    api.viewToken.getActiveViewTokenClients,
    {},
  );
  const clientCounts = useMemo(() => {
    const map = new Map<Id<"viewTokens">, number>();
    for (const entry of presence ?? []) map.set(entry.viewTokenId, entry.count);
    return map;
  }, [presence]);

  const columns = useMemo<ColumnDef<ViewToken>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            className="translate-y-0.5"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="translate-y-0.5"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "name",
        header: "Name",
        minSize: 150,
        enableResizing: true,
        enableSorting: false,
        cell: ({ row }) => {
          return (
            <Cell>
              <CellContent>{row.original.name}</CellContent>
            </Cell>
          );
        },
      },
      {
        accessorKey: "token",
        header: "Token",
        minSize: 200,
        enableResizing: true,
        enableSorting: false,
        cell: ({ row }) => {
          return <CopyCell value={row.original.token} />;
        },
      },
      {
        id: "status",
        header: "Status",
        // Derived from clientCounts, which lives here rather than on the row —
        // an accessorFn is what lets CSV export read it (export.ts reads through
        // row.getValue, which is undefined for display-only columns).
        accessorFn: (row) =>
          (clientCounts.get(row._id) ?? 0) > 0 ? "Online" : "Offline",
        size: 110,
        enableResizing: true,
        enableSorting: false,
        cell: ({ row }) => {
          const online = (clientCounts.get(row.original._id) ?? 0) > 0;
          return (
            <Cell>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    online ? "bg-emerald-500" : "bg-muted-foreground/40",
                  )}
                />
                <span className="text-sm">{online ? "Online" : "Offline"}</span>
              </div>
            </Cell>
          );
        },
      },
      {
        id: "clients",
        header: "Clients",
        // Same as `status`: derived here, so export needs an accessorFn.
        accessorFn: (row) => clientCounts.get(row._id) ?? 0,
        size: 110,
        enableResizing: true,
        enableSorting: false,
        cell: ({ row }) => {
          const count = clientCounts.get(row.original._id) ?? 0;
          return (
            <NumberCell
              value={count}
              suffix={count === 1 ? " client" : " clients"}
              decimals={0}
            />
          );
        },
      },
      {
        accessorKey: "lastPing",
        header: "Last Active",
        size: 140,
        enableResizing: true,
        enableSorting: false,
        cell: ({ row }) => {
          return (
            <TimestampCell
              timestamp={row.original.lastPing}
              format="short-12h"
            />
          );
        },
      },
      {
        accessorKey: "_creationTime",
        header: "Created At",
        size: 140,
        enableResizing: true,
        enableSorting: false,
        cell: ({ row }) => {
          return (
            <TimestampCell
              timestamp={row.original._creationTime}
              format="short-12h"
            />
          );
        },
      },
      {
        id: "actions",
        header: "",
        size: 50,
        enableResizing: true,
        cell: ({ row }) => {
          return (
            <ActionCell
              entity={DrawerEntity.VIEW_TOKEN}
              itemId={row.original._id}
            />
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [clientCounts],
  );

  const { table } = useInfiniteTable({
    data: results,
    columns,
    getRowId: (originalRow) => originalRow._id,
  });

  return (
    <InfiniteDataTable
      table={table}
      status={status}
      onLoadMore={loadMore}
      actionBar={<TableActionBar table={table} entityName="view tokens" />}
    >
      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder="Search by name..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
        <Button
          size="sm"
          onClick={() => open(DrawerEntity.VIEW_TOKEN, DrawerMode.CREATE)}
        >
          <Plus className="mr-1 size-4" />
          New view token
        </Button>
      </div>
    </InfiniteDataTable>
  );
}
