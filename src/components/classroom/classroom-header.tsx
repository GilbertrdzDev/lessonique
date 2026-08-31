"use client";

import {
  Bot,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RadioTower,
  Sparkles,
} from "lucide-react";

import { ThemeToggle } from "@/components/classroom/theme-toggle";
import { getWebMCPAvailabilityPresentation } from "@/components/webmcp/webmcp-availability";
import { useWebMCPRuntime } from "@/components/webmcp/webmcp-registration-provider";
import { classroomTechnologiesMock } from "@/features/classroom/classroom-mocks";
import { cn } from "@/lib/utils";

export function ClassroomHeader() {
  const { availability } = useWebMCPRuntime();
  const presentation = getWebMCPAvailabilityPresentation(availability);

  return (
    <header
      className="grid min-h-24 grid-cols-1 overflow-hidden rounded-[1.25rem] border bg-card shadow-panel xl:grid-cols-[1.15fr_0.85fr_1fr]"
      data-webmcp-availability={availability}
    >
      <div className="flex min-w-0 items-center gap-3 px-5 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-primary text-wrap-balance">
            {presentation.requestLabel}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {presentation.requestDetail}
          </p>
        </div>
      </div>

      <div
        aria-live="polite"
        className="flex min-w-0 items-center gap-3 border-y px-5 py-4 xl:border-x xl:border-y-0"
        role="status"
      >
        <span
          className="relative flex size-3 shrink-0"
          data-webmcp-status-indicator
          data-webmcp-status-tone={availability}
        >
          {availability === "ready" ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-35 motion-reduce:animate-none" />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "relative inline-flex size-3 rounded-full",
              availability === "detecting" && "bg-muted-foreground/45",
              availability === "ready" && "bg-success",
              availability === "unsupported" && "bg-warning",
            )}
          />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <RadioTower aria-hidden="true" className="size-4 text-primary" />
            {presentation.connectionLabel}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {presentation.connectionDetail}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
          <Bot aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">
              {presentation.capabilitiesLabel}
            </p>
            {availability === "ready" ? (
              <CircleCheck aria-hidden="true" className="size-4 text-success" />
            ) : availability === "unsupported" ? (
              <CircleAlert aria-hidden="true" className="size-4 text-warning" />
            ) : (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none"
              />
            )}
          </div>
          {availability === "ready" ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              {classroomTechnologiesMock.map((technology) => (
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
          ) : (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {presentation.capabilitiesDetail}
            </p>
          )}
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
