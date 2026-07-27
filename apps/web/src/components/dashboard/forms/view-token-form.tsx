"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@sizeupdashboard/convex/src/api/_generated/api.js";
import type { Id } from "@sizeupdashboard/convex/src/api/_generated/dataModel.js";
import type { ViewToken } from "@sizeupdashboard/convex/src/api/schema.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldInfo } from "@/components/ui/field-info";
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

interface ViewTokenFormProps {
  id?: string;
  onDone: () => void;
}

// The token value is generated server-side and is never editable (viewers
// authenticate with it), so the form collects just a name in both modes.
export function ViewTokenForm({ id, onDone }: ViewTokenFormProps) {
  // Edit hydration: fetch the single row by id. The table is paginated, so
  // reading the list and finding the row would miss rows past the first page.
  const existing = useQuery(
    api.viewToken.getViewTokenById,
    id ? { id: id as Id<"viewTokens"> } : "skip",
  );

  if (id && existing === undefined) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (id && !existing) {
    return (
      <div className="p-4">
        <SheetHeader>
          <SheetTitle>View token not found</SheetTitle>
        </SheetHeader>
        <Button className="mt-4" variant="outline" onClick={onDone}>
          Close
        </Button>
      </div>
    );
  }

  return <ViewTokenFormInner existing={existing ?? null} onDone={onDone} />;
}

function ViewTokenFormInner({
  existing,
  onDone,
}: {
  existing: ViewToken | null;
  onDone: () => void;
}) {
  const isEdit = existing !== null;
  const createViewToken = useMutation(api.viewToken.createViewToken);
  const updateViewToken = useMutation(api.viewToken.updateViewToken);

  const form = useForm({
    defaultValues: { name: existing?.name ?? "" },
    onSubmit: async ({ value }) => {
      try {
        if (isEdit && existing) {
          await updateViewToken({ id: existing._id, name: value.name.trim() });
          toast.success("View token updated");
        } else {
          await createViewToken({ name: value.name.trim() });
          toast.success("View token created");
        }
        onDone();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Save failed");
      }
    },
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle>{isEdit ? "Edit view token" : "New view token"}</SheetTitle>
        <SheetDescription>
          {isEdit
            ? "Renames this kiosk/display token. The token value itself cannot be changed — displays already using it keep working."
            : "Creates a token for a kiosk/display. The token value is generated automatically."}
        </SheetDescription>
      </SheetHeader>

      <form
        id="view-token-form"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void form.handleSubmit();
        }}
        className="flex-1 space-y-4 overflow-y-auto px-4"
      >
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => (!value.trim() ? "Name is required" : undefined),
          }}
        >
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Name</Label>
              <Input
                id={field.name}
                placeholder="e.g., Station 1 Lobby"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              <FieldInfo field={field} />
            </div>
          )}
        </form.Field>
      </form>

      <SheetFooter>
        <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              form="view-token-form"
              disabled={!canSubmit}
            >
              {isSubmitting
                ? isEdit
                  ? "Saving..."
                  : "Creating..."
                : isEdit
                  ? "Save changes"
                  : "Create view token"}
            </Button>
          )}
        </form.Subscribe>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </SheetFooter>
    </>
  );
}
