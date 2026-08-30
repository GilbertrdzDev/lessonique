import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppShellProps = Readonly<{
  agent: ReactNode;
  className?: string;
  header: ReactNode;
  navigation: ReactNode;
  workspace: ReactNode;
}>;

export function AppShell({
  agent,
  className,
  header,
  navigation,
  workspace,
}: AppShellProps) {
  return (
    <div
      className={cn("min-h-svh overflow-x-hidden p-2 sm:p-2.5", className)}
      data-slot="app-shell"
    >
      <a
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-floating transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="#classroom-workspace"
      >
        Skip to Classroom Workspace
      </a>
      <div className="mx-auto grid min-h-[calc(100svh-1rem)] min-w-0 max-w-[120rem] grid-cols-1 gap-2 rounded-[1.25rem] border bg-background/80 p-2 shadow-panel backdrop-blur-xl sm:min-h-[calc(100svh-1.25rem)] sm:gap-2.5 sm:rounded-[1.5rem] sm:p-2.5 md:grid-cols-[auto_minmax(0,1fr)] 2xl:grid-cols-[auto_minmax(34rem,1fr)_auto]">
        {navigation}
        <div className="order-1 flex min-w-0 flex-col gap-2 md:order-none sm:gap-2.5">
          {header}
          {workspace}
        </div>
        {agent}
      </div>
    </div>
  );
}
