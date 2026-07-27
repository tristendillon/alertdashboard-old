import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { cookies } from "next/headers";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { EntityDrawer } from "@/components/dashboard/entity-drawer";
import { AuthedGate } from "@/components/dashboard/authed-gate";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <NuqsAdapter>
      <SidebarProvider defaultOpen={defaultOpen}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex flex-1 flex-col gap-4 p-4">
            {/*
              EntityDrawer is inside AuthedGate so its edit-hydration queries
              only run once Convex holds a Clerk token — before that they
              resolve to `[]` (not `undefined`) and a deep-linked edit URL
              flashes "not found". It renders only Radix portals, so sitting
              in this padded flex column costs it no layout.
            */}
            <AuthedGate>
              <EntityDrawer />
              {children}
            </AuthedGate>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NuqsAdapter>
  );
}
