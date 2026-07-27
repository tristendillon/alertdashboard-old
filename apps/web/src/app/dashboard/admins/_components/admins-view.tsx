"use client";

import { useForm } from "@tanstack/react-form";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { MailPlus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CopyCell } from "@/components/ui/copy-cell";
import { TimestampCell } from "@/components/ui/timestamp-cell";
import { Cell, CellContent } from "@/components/ui/cell";
import { FieldInfo } from "@/components/ui/field-info";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  inviteAdmin,
  removeAdmin,
  revokeInvitation,
  type ActionResult,
} from "../actions";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  lastSignInAt: number | null;
  banned: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  createdAt: number;
}

interface AdminsViewProps {
  users: AdminUser[];
  pendingInvitations: PendingInvite[];
  currentUserId: string | null;
}

function initials(user: AdminUser) {
  const source = user.name ?? user.email;
  return source.slice(0, 2).toUpperCase();
}

export function AdminsView({
  users,
  pendingInvitations,
  currentUserId,
}: AdminsViewProps) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Admins</h1>
          <p className="text-muted-foreground text-sm">
            Invite and manage who can access the dashboard.
          </p>
        </div>
        <InviteAdminDialog />
      </div>

      {pendingInvitations.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Pending invitations</h2>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>
                      <TimestampCell
                        timestamp={invite.createdAt}
                        format="short-12h"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Pending</Badge>
                    </TableCell>
                    <TableCell>
                      <ConfirmAction
                        title="Revoke invitation?"
                        description={`The invite for ${invite.email} will no longer work.`}
                        confirmLabel="Revoke"
                        icon={<X className="size-4" />}
                        srLabel="Revoke invitation"
                        action={() => revokeInvitation(invite.id)}
                        successMessage="Invitation revoked"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Admins</h2>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                          {initials(user)}
                        </span>
                        <span>
                          {user.name ?? "—"}
                          {isSelf && (
                            <span className="text-muted-foreground ml-1 text-xs">
                              (you)
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <CopyCell value={user.email} />
                    </TableCell>
                    <TableCell>
                      {user.lastSignInAt ? (
                        <TimestampCell
                          timestamp={user.lastSignInAt}
                          format="short-12h"
                        />
                      ) : (
                        <Cell>
                          <CellContent className="text-muted-foreground">
                            Never
                          </CellContent>
                        </Cell>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.banned ? (
                        <Badge variant="destructive">Banned</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isSelf && (
                        <ConfirmAction
                          title="Remove admin?"
                          description={`${user.email} will lose dashboard access. This cannot be undone.`}
                          confirmLabel="Remove"
                          icon={<Trash2 className="size-4" />}
                          srLabel="Remove admin"
                          destructive
                          action={() => removeAdmin(user.id)}
                          successMessage="Admin removed"
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

const emailSchema = z.email("Enter a valid email");

function InviteAdminDialog() {
  const [open, setOpen] = useState(false);
  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      try {
        const result = await inviteAdmin(value.email);
        if (!result.ok) {
          // The action reports expected failures (bad email, Clerk 422) as
          // data — Next would have redacted them had they been thrown.
          toast.error(result.error);
          return;
        }
        toast.success(`Invitation sent to ${value.email.trim()}`);
        setOpen(false);
      } catch (error) {
        // Only genuine transport failures reach here (offline, worker 5xx).
        toast.error(
          error instanceof Error ? error.message : "Failed to send invitation",
        );
      }
    },
  });

  // Reset on close, not on success: cancelling a half-typed invite used to
  // leave the stale email and its red validation error sitting there on
  // reopen. Routing every close through here covers Escape, overlay click and
  // the Cancel button alike.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Must be a DialogTrigger, not a bare button — Radix needs it to
          return focus to this button when the dialog closes. */}
      <DialogTrigger asChild>
        <Button size="sm">
          <MailPlus className="mr-1 size-4" />
          Invite admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite admin</DialogTitle>
          <DialogDescription>
            They&apos;ll get an email with a link to set their password and join.
          </DialogDescription>
        </DialogHeader>
        <form
          id="invite-admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
          className="space-y-2"
        >
          <form.Field
            name="email"
            validators={{
              onChange: ({ value }) => {
                const result = emailSchema.safeParse(value.trim());
                return result.success
                  ? undefined
                  : result.error.issues[0]?.message;
              },
            }}
          >
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Email</Label>
                <Input
                  id={field.name}
                  type="email"
                  placeholder="admin@example.com"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <FieldInfo field={field} />
              </div>
            )}
          </form.Field>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" form="invite-admin-form" disabled={!canSubmit}>
                {isSubmitting ? "Sending..." : "Send invitation"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmActionProps {
  title: string;
  description: string;
  confirmLabel: string;
  srLabel: string;
  icon: React.ReactNode;
  action: () => Promise<ActionResult>;
  successMessage: string;
  destructive?: boolean;
}

function ConfirmAction({
  title,
  description,
  confirmLabel,
  srLabel,
  icon,
  action,
  successMessage,
  destructive,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          // Keep the dialog open on failure so the user can retry or cancel.
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        setOpen(false);
      } catch (error) {
        // Only genuine transport failures reach here.
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={srLabel}>
          {icon}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className={
              destructive
                ? "bg-destructive text-white hover:bg-destructive/90"
                : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              run();
            }}
          >
            {pending ? "Working..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
