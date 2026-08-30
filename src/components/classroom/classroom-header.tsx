import { Bot, CircleCheck, RadioTower, Sparkles } from "lucide-react";

import { ThemeToggle } from "@/components/classroom/theme-toggle";
import { classroomHeaderMock } from "@/features/classroom/classroom-mocks";

export function ClassroomHeader() {
  return (
    <header className="grid min-h-24 grid-cols-1 overflow-hidden rounded-[1.25rem] border bg-card shadow-panel xl:grid-cols-[1.15fr_0.85fr_1fr]">
      <div className="flex min-w-0 items-center gap-3 px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-primary text-wrap-balance">
            {classroomHeaderMock.requestLabel}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {classroomHeaderMock.requestDetail}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3 border-y px-5 py-4 xl:border-x xl:border-y-0">
        <span className="relative flex size-3 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-35 motion-reduce:animate-none" />
          <span
            aria-hidden="true"
            className="relative inline-flex size-3 rounded-full bg-success"
          />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <RadioTower aria-hidden="true" className="size-4 text-primary" />
            {classroomHeaderMock.connectionLabel}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {classroomHeaderMock.connectionDetail}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
          <Bot aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">Detected Capabilities</p>
            <CircleCheck aria-hidden="true" className="size-4 text-success" />
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            {classroomHeaderMock.technologies.map((technology) => (
              <span
                className="rounded-lg border bg-background/70 px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground"
                key={technology.id}
                title={technology.label}
                translate="no"
              >
                {technology.shortLabel}
              </span>
            ))}
          </div>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
