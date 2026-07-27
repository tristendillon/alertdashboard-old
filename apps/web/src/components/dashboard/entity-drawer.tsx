"use client";

import { useMutation } from "convex/react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { api } from "@sizeupdashboard/convex/src/api/_generated/api.js";
import type { Id } from "@sizeupdashboard/convex/src/api/_generated/dataModel.js";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDrawerState } from "@/hooks/nuqs/use-drawer-state";
import { DrawerEntity, DrawerMode } from "@/lib/enums";
import { ViewTokenForm } from "./forms/view-token-form";
import { DispatchTypeForm } from "./forms/dispatch-type-form";
import { DispatchTypeImportForm } from "./forms/dispatch-type-import-form";
import { FieldTransformationForm } from "./forms/field-transformation-form";

const ENTITY_LABEL: Record<DrawerEntity, string> = {
  [DrawerEntity.VIEW_TOKEN]: "view token",
  [DrawerEntity.DISPATCH_TYPE]: "dispatch type",
  [DrawerEntity.TRANSFORMATION_RULE]: "transformation rule",
  [DrawerEntity.FIELD_TRANSFORMATION]: "field transformation",
};

/**
 * URL-driven drawer for create/edit/import (a right-side Sheet) and delete
 * (an AlertDialog). Replaces the old ModalRouter. Mounted once in the
 * dashboard layout; reads `?drawer/mode/id` via useDrawerState.
 */
export function EntityDrawer() {
  const { drawer, mode, id, close } = useDrawerState();

  const deleteViewToken = useMutation(api.viewToken.deleteViewToken);
  const deleteDispatchType = useMutation(api.customization.deleteDispatchType);
  const deleteRule = useMutation(api.transformations.deleteTransformationRule);
  const deleteFieldTransformation = useMutation(
    api.transformations.deleteFieldTransformation,
  );
  const [deleting, setDeleting] = useState(false);

  const isDelete = mode === DrawerMode.DELETE;
  const sheetOpen = !!drawer && !isDelete;

  const runDelete = async () => {
    // A delete deep-link can arrive without an entity or id (e.g. a hand-edited
    // `?drawer=view-token&mode=delete`). There is nothing to target, so fail
    // visibly instead of leaving a Delete button that does nothing.
    if (!drawer || !id) {
      toast.error("Nothing to delete — this link is missing an item.");
      close();
      return;
    }
    setDeleting(true);
    try {
      switch (drawer) {
        case DrawerEntity.VIEW_TOKEN:
          await deleteViewToken({ id: id as Id<"viewTokens"> });
          break;
        case DrawerEntity.DISPATCH_TYPE:
          await deleteDispatchType({ id: id as Id<"dispatchTypes"> });
          break;
        case DrawerEntity.TRANSFORMATION_RULE:
          await deleteRule({ id: id as Id<"transformationRules"> });
          break;
        case DrawerEntity.FIELD_TRANSFORMATION:
          await deleteFieldTransformation({ id: id as Id<"fieldTransformations"> });
          break;
      }
      toast.success("Deleted");
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const renderForm = () => {
    switch (drawer) {
      case DrawerEntity.VIEW_TOKEN:
        return <ViewTokenForm id={id ?? undefined} onDone={close} />;
      case DrawerEntity.DISPATCH_TYPE:
        return mode === DrawerMode.IMPORT ? (
          <DispatchTypeImportForm onDone={close} />
        ) : (
          <DispatchTypeForm id={id ?? undefined} onDone={close} />
        );
      case DrawerEntity.FIELD_TRANSFORMATION:
        return <FieldTransformationForm id={id ?? undefined} onDone={close} />;
      case DrawerEntity.TRANSFORMATION_RULE:
        // Create/edit now live in the full-page editor at
        // /dashboard/transformation-rules/{new,[id]}; the drawer only handles
        // this entity's DELETE flow (the AlertDialog branch below).
        return null;
      default:
        return null;
    }
  };

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && close()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          {/*
            Keyed so switching entity/mode/id while the sheet stays open (back
            /forward between two `?mode=edit&id=…` URLs, or a deep link)
            remounts the form. TanStack Form only reads `defaultValues` on
            mount, so without this you'd edit row B showing row A's values.
            A keyed Fragment rather than a wrapper element: SheetContent's
            flex column expects the header/form/footer as direct children.
          */}
          {sheetOpen && (
            <Fragment key={`${drawer}:${mode}:${id ?? "new"}`}>
              {renderForm()}
            </Fragment>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={isDelete} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this {drawer ? ENTITY_LABEL[drawer] : "item"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void runDelete();
              }}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
