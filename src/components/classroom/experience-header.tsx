"use client";

import { GraduationCap, LoaderCircle, RotateCcw } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { ThemeToggle } from "@/components/classroom/theme-toggle";
import { Button } from "@/components/ui/button";
import { useWebMCPRuntime } from "@/components/webmcp/webmcp-registration-provider";
import { useWorkspaceRuntime } from "@/components/workspace/workspace-runtime-provider";
import type { LessoniqueExperienceState } from "@/features/classroom/experience-state";
import { cn } from "@/lib/utils";

export function ExperienceHeader({
  experienceState,
}: Readonly<{ experienceState: LessoniqueExperienceState }>) {
  const workspace = useWorkspaceRuntime();
  const { agentConnection, availability } = useWebMCPRuntime();
  const state = useSyncExternalStore(
    workspace.store.subscribe,
    workspace.store.getSnapshot,
    workspace.store.getSnapshot,
  );
  const [isResetting, setIsResetting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const profile = state.profileId
    ? workspace.registries.environmentProfiles.get(state.profileId)
    : undefined;
  const status = getHeaderStatus(
    experienceState,
    availability,
    agentConnection.status,
  );

  const resetClassroom = async () => {
    setIsResetting(true);
    setErrorMessage(undefined);
    try {
      await workspace.resetClassroom.execute({ scope: "all" });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The classroom could not be reset.",
      );
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <header className="mx-auto flex min-h-16 w-full max-w-[120rem] flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border bg-card/92 px-4 py-3 shadow-panel backdrop-blur-xl sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <GraduationCap aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate text-base font-bold tracking-tight" translate="no">
            Lessonique
          </span>
          <span className="rounded-md bg-primary px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-primary-foreground">
            AI
          </span>
          {experienceState === "classroom" ? (
            <>
              <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
              <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
                Classroom
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <div
          aria-live="polite"
          className={cn(
            "flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium",
            status.tone === "success" &&
              "border-success/30 bg-success/10 text-foreground",
            status.tone === "warning" &&
              "border-warning/40 bg-warning/10 text-foreground",
            status.tone === "neutral" && "bg-secondary text-secondary-foreground",
          )}
          data-webmcp-availability={availability}
          data-webmcp-status-tone={status.tone}
          role="status"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              status.tone === "success" && "bg-success",
              status.tone === "warning" && "bg-warning",
              status.tone === "neutral" && "bg-muted-foreground/50",
            )}
          />
          {status.label}
        </div>

        {experienceState === "classroom" ? (
          <>
            {profile ? (
              <span className="hidden rounded-lg border bg-background/70 px-3 py-2 text-xs text-muted-foreground lg:inline">
                {profile.displayName}
              </span>
            ) : null}
            <Button
              disabled={isResetting}
              onClick={() => void resetClassroom()}
              size="sm"
              variant="outline"
            >
              {isResetting ? (
                <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <RotateCcw aria-hidden="true" />
              )}
              Reset
            </Button>
          </>
        ) : null}
        <ThemeToggle />
      </div>
      {errorMessage ? (
        <p className="basis-full text-right text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </header>
  );
}

function getHeaderStatus(
  experienceState: LessoniqueExperienceState,
  availability: "detecting" | "ready" | "unsupported",
  connection: "disconnected" | "connected",
) {
  if (experienceState === "unsupported") {
    return { label: "Browser not compatible", tone: "warning" as const };
  }
  if (experienceState === "guide-build-error") {
    return { label: "Guide build paused", tone: "warning" as const };
  }
  if (experienceState === "building-guide") {
    return { label: "Building your AI guide", tone: "success" as const };
  }
  if (experienceState === "starting-session") {
    return { label: "Opening your classroom", tone: "success" as const };
  }
  if (connection === "connected") {
    return { label: "Connected through WebMCP", tone: "success" as const };
  }
  if (experienceState === "classroom" && availability === "unsupported") {
    return { label: "WebMCP connection unavailable", tone: "warning" as const };
  }
  return { label: "Looking for WebMCP connection", tone: "neutral" as const };
}
