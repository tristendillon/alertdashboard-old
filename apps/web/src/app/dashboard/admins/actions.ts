"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ADMINS_PATH = "/dashboard/admins";

// Next.js redacts thrown server-action errors in production builds — the client
// only ever receives "An error occurred in the Server Components render... The
// specific message is omitted in production builds". That made every failure
// here (Clerk 422s especially) undebuggable from the browser. So these actions
// never throw for expected failures; they return the reason as data, which
// Next passes through untouched.
export type ActionResult = { ok: true } | { ok: false; error: string };

const emailSchema = z.email();

// Shape of a single entry in Clerk's `ClerkAPIResponseError.errors` array. The
// class isn't re-exported from @clerk/nextjs/server (that entrypoint only
// re-exports resource types from @clerk/backend), so duck-type it rather than
// reaching into the SDK's internals.
interface ClerkApiErrorDetail {
  code?: string;
  message?: string;
  longMessage?: string;
}

function isClerkApiResponseError(
  err: unknown,
): err is { errors: ClerkApiErrorDetail[]; status?: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors: unknown }).errors)
  );
}

// Clerk's top-level `err.message` is a generic "Unprocessable Entity" string;
// the actionable detail ("redirect_url is not a valid URL", "duplicate record")
// only lives in the `errors` array. Surface that, plus the codes, so the toast
// says something a human can act on.
function toErrorMessage(err: unknown): string {
  if (isClerkApiResponseError(err)) {
    const details = err.errors
      .map((e) => e.longMessage ?? e.message)
      .filter((m): m is string => Boolean(m))
      .join(" ");
    const codes = err.errors
      .map((e) => e.code)
      .filter((c): c is string => Boolean(c))
      .join(", ");
    const suffix = codes ? ` (${codes})` : "";
    if (details) return `${details}${suffix}`;
    // Empty/odd `errors` array — the HTTP status is still better than nothing.
    const status = err.status ? ` (HTTP ${err.status})` : "";
    return `Clerk rejected the request${status}${suffix}`;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong";
}

// Every dashboard user is a trusted admin, so any signed-in user may manage
// admins — but re-check auth here (defense in depth; server actions are their
// own entrypoint, not covered by the page's middleware guard).
async function getAdminUserId() {
  const { userId } = await auth();
  return userId;
}

// The invitation `redirectUrl` must be an absolute, well-formed URL or Clerk
// rejects the entire call with a 422. Two traps the old version fell into:
// hardcoding `https` produced the bogus `https://localhost:3000` under
// `next dev` (neither x-forwarded-* header is set there), and a missing host
// produced the literal `https://null/sign-up`. Derive the scheme, and return
// null when there is no host so the caller can omit redirectUrl entirely.
async function getOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;

  // Proxies may append to x-forwarded-proto ("https,http"); the client-facing
  // scheme is the first entry.
  const forwarded = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost");
  const proto = forwarded ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`;
}

export async function inviteAdmin(email: string): Promise<ActionResult> {
  try {
    const userId = await getAdminUserId();
    if (!userId) return { ok: false, error: "Not authorized" };

    // The dialog validates before submitting, but the action is its own
    // entrypoint and can be POSTed to directly, so validate again here.
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) return { ok: false, error: "Enter a valid email" };

    const origin = await getOrigin();
    // Observability is on for this Worker (see wrangler.jsonc), so this line
    // lands in the Cloudflare logs. A bad redirectUrl is the single most likely
    // cause of a 422 from createInvitation — log the evidence.
    console.log("[admins] inviteAdmin resolved origin", origin);

    const client = await clerkClient();
    await client.invitations.createInvitation({
      emailAddress: parsed.data,
      // No resolvable host: omit redirectUrl rather than send a malformed one.
      // Clerk falls back to the instance's own sign-up URL, which still works.
      ...(origin ? { redirectUrl: `${origin}/sign-up` } : {}),
      ignoreExisting: true,
    });
    revalidatePath(ADMINS_PATH);
    return { ok: true };
  } catch (err) {
    console.error("[admins] inviteAdmin failed", err);
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function revokeInvitation(
  invitationId: string,
): Promise<ActionResult> {
  try {
    const userId = await getAdminUserId();
    if (!userId) return { ok: false, error: "Not authorized" };

    const client = await clerkClient();
    await client.invitations.revokeInvitation(invitationId);
    revalidatePath(ADMINS_PATH);
    return { ok: true };
  } catch (err) {
    console.error("[admins] revokeInvitation failed", err);
    return { ok: false, error: toErrorMessage(err) };
  }
}

export async function removeAdmin(targetUserId: string): Promise<ActionResult> {
  try {
    const userId = await getAdminUserId();
    if (!userId) return { ok: false, error: "Not authorized" };
    if (targetUserId === userId) {
      return { ok: false, error: "You can't remove yourself" };
    }

    const client = await clerkClient();
    await client.users.deleteUser(targetUserId);
    revalidatePath(ADMINS_PATH);
    return { ok: true };
  } catch (err) {
    console.error("[admins] removeAdmin failed", err);
    return { ok: false, error: toErrorMessage(err) };
  }
}
