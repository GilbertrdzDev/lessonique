import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppShellProps = Readonly<{
  agent: ReactNode;
  className?: string;
  sessionInfo: ReactNode;
  workspace: ReactNode;
}>;

export function AppShell({
  agent,
  className,
  sessionInfo,
  workspace,
}: AppShellProps) {
  return (
    <div
      className={cn("min-w-0", className)}
      data-slot="app-shell"
    >
      <a
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-floating transition-transform focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href="#classroom-workspace"
      >
        Skip to Classroom Workspace
      </a>
      <div className="mx-auto grid min-w-0 max-w-[120rem] grid-cols-1 gap-2 sm:gap-2.5 2xl:grid-cols-[minmax(34rem,1fr)_auto]">
        <div className="order-1 flex min-w-0 flex-col gap-2 sm:gap-2.5 2xl:order-none">
          {sessionInfo}
          {workspace}
        </div>
        {agent}
      </div>
    </div>
  );
}
