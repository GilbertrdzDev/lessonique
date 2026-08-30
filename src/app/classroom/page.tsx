import { CodeXml, MonitorPlay, SquareTerminal } from "lucide-react";

import { AgentSidebar } from "@/components/classroom/agent-sidebar";
import { AppShell } from "@/components/classroom/app-shell";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import { NavigationSidebar } from "@/components/classroom/navigation-sidebar";

export default function ClassroomPage() {
  return (
    <AppShell
      navigation={<NavigationSidebar />}
      header={<ClassroomHeader />}
      workspace={
        <main
          aria-labelledby="classroom-title"
          className="flex min-h-[28rem] flex-1 flex-col rounded-[1.25rem] border bg-workspace p-3 shadow-panel sm:min-h-[38rem] sm:p-5"
          id="classroom-workspace"
        >
          <h1 id="classroom-title" className="text-xl font-semibold">
            Lessonique Classroom
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            The learning workspace is ready for its tools.
          </p>
          <section
            aria-labelledby="workspace-empty-title"
            className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-code-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/70 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-primary">
                  <CodeXml aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <h2
                    className="text-sm font-semibold"
                    id="workspace-empty-title"
                  >
                    Classroom Workspace
                  </h2>
                  <p className="text-[0.68rem] text-muted-foreground">
                    No active lesson
                  </p>
                </div>
              </div>
              <ul
                aria-label="Available workspace surfaces"
                className="flex gap-1.5"
              >
                {[
                  { icon: CodeXml, label: "Editor" },
                  { icon: MonitorPlay, label: "Preview" },
                  { icon: SquareTerminal, label: "Console" },
                ].map(({ icon: Icon, label }) => (
                  <li
                    className="flex items-center gap-1.5 rounded-lg border bg-background/70 px-2.5 py-1.5 text-[0.68rem] font-medium text-muted-foreground"
                    key={label}
                  >
                    <Icon aria-hidden="true" className="size-3.5" />
                    <span className="max-sm:sr-only">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid flex-1 place-items-center px-6 py-12 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl border bg-card text-primary shadow-sm">
                  <CodeXml aria-hidden="true" className="size-6" />
                </span>
                <h2 className="mt-4 text-base font-semibold text-balance">
                  Your Guided Workspace Is Ready
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
                  Editor, preview, and console surfaces will appear here when a
                  guided lesson begins.
                </p>
              </div>
            </div>
          </section>
        </main>
      }
      agent={<AgentSidebar />}
    />
  );
}
