"use client";

import {
  Bot,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RadioTower,
  Sparkles,
} from "lucide-react";
import { useSyncExternalStore } from "react";

import { getWebMCPAvailabilityPresentation } from "@/components/webmcp/webmcp-availability";
import { useWebMCPRuntime } from "@/components/webmcp/webmcp-registration-provider";
import { useWorkspaceRuntime } from "@/components/workspace/workspace-runtime-provider";
import { cn } from "@/lib/utils";

export function ClassroomHeader() {
  const { agentConnection, availability } = useWebMCPRuntime();
  const workspace = useWorkspaceRuntime();
  const workspaceState = useSyncExternalStore(
    workspace.store.subscribe,
    workspace.store.getSnapshot,
    workspace.store.getSnapshot,
  );
  const presentation = getWebMCPAvailabilityPresentation(availability);
  const connected =
    availability === "ready" && agentConnection.status === "connected";
  const connectionTone = connected
    ? "ready"
    : availability === "unsupported"
      ? "unsupported"
      : "detecting";
  const capabilities = workspaceState.languageIds.flatMap((languageId) => {
    const language = workspace.registries.languages.get(languageId);
    return language ? [language] : [];
  });

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
            Request received from ChatGPT
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Guided session led by ChatGPT
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
          data-webmcp-status-tone={connectionTone}
        >
          {connectionTone === "ready" ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-35 motion-reduce:animate-none" />
          ) : null}
          <span
            aria-hidden="true"
            className={cn(
              "relative inline-flex size-3 rounded-full",
              connectionTone === "detecting" && "bg-muted-foreground/45",
              connectionTone === "ready" && "bg-success",
              connectionTone === "unsupported" && "bg-warning",
            )}
          />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <RadioTower aria-hidden="true" className="size-4 text-primary" />
            {connected
              ? "Connected through WebMCP"
              : availability === "unsupported"
                ? "WebMCP connection unavailable"
                : "Waiting for WebMCP reconnection"}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {connected
              ? "Secure and active channel"
              : availability === "unsupported"
                ? "The classroom remains available while the agent reconnects"
                : "Registered tools are waiting for agent activity"}
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
              Detected Capabilities
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
          {capabilities.length > 0 ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              {capabilities.map((technology) => (
                <span
                  className="rounded-lg border bg-background/70 px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground"
                  key={technology.id}
                  title={technology.displayName}
                  translate="no"
                >
                  {getCapabilityShortLabel(technology.displayName)}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {presentation.capabilitiesDetail}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

function getCapabilityShortLabel(displayName: string): string {
  return displayName === "JavaScript"
    ? "JS"
    : displayName.length <= 5
      ? displayName
      : displayName.slice(0, 5);
}
