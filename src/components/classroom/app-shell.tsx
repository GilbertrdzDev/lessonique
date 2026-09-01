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
      className={cn("min-h-0 min-w-0 flex-1", className)}
      data-slot="app-shell"
    >
      <div className="mx-auto grid h-full min-h-0 min-w-0 max-w-[120rem] grid-cols-1 gap-2 sm:gap-2.5 2xl:grid-cols-[minmax(34rem,1fr)_auto]">
        <div className="order-1 flex min-h-0 min-w-0 flex-col gap-2 sm:gap-2.5 2xl:order-none">
          {sessionInfo}
          {workspace}
        </div>
        {agent}
      </div>
    </div>
  );
}

export function ClassroomSkipLink() {
  return (
    <a
      className="lessonique-skip-link fixed left-4 top-4 z-50 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-floating focus:outline-none focus:ring-2 focus:ring-ring"
      href="#classroom-workspace"
    >
      Skip to Classroom Workspace
    </a>
  );
}
