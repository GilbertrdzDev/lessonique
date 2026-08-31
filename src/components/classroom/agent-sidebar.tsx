"use client";

import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CodeXml,
  Eye,
  FileCode2,
  FolderOpen,
  GraduationCap,
  InspectionPanel,
  MessageCircleMore,
  MonitorPlay,
  RadioTower,
  Sparkles,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { DevToolPanel } from "@/components/webmcp/dev-tool-panel";
import {
  getWebMCPAvailabilityPresentation,
  type WebMCPAvailability,
} from "@/components/webmcp/webmcp-availability";
import { useWebMCPRuntime } from "@/components/webmcp/webmcp-registration-provider";
import { useWorkspaceRuntime } from "@/components/workspace/workspace-runtime-provider";
import {
  activityFeedMock,
  learningPlanMock,
  toolCapabilitiesMock,
  type ActivityKind,
} from "@/features/classroom/classroom-mocks";
import { cn } from "@/lib/utils";
import { P0_INTERACTION_ANCHOR_IDS } from "@/providers/p0";

const MINIMUM_PANEL_WIDTH = 320;
const MAXIMUM_PANEL_WIDTH = 520;
const DEFAULT_PANEL_WIDTH = 400;
const COLLAPSED_PANEL_WIDTH = 76;

const activityTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Bogota",
});

const activityIcons: Readonly<Record<ActivityKind, LucideIcon>> = {
  connection: RadioTower,
  explanation: MessageCircleMore,
  file: FileCode2,
  lesson: GraduationCap,
  preview: Eye,
  request: Sparkles,
};

const toolIcons: Readonly<Record<string, LucideIcon>> = {
  "surface.console": SquareTerminal,
  "surface.editor": CodeXml,
  "surface.files": FolderOpen,
  "surface.inspector": InspectionPanel,
  "surface.preview": MonitorPlay,
};

type ResizeSession = Readonly<{
  pointerId: number;
  startWidth: number;
  startX: number;
}>;

function clampPanelWidth(width: number) {
  return Math.min(MAXIMUM_PANEL_WIDTH, Math.max(MINIMUM_PANEL_WIDTH, width));
}

function AgentStatus({
  availability,
}: Readonly<{ availability: WebMCPAvailability }>) {
  const presentation = getWebMCPAvailabilityPresentation(availability);

  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-4"
      data-webmcp-availability={availability}
    >
      <div className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary">
        <Bot aria-hidden="true" className="size-6" />
        <span
          aria-hidden="true"
          className={cn(
            "absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-card",
            availability === "detecting" && "bg-muted-foreground/45",
            availability === "ready" && "bg-success",
            availability === "unsupported" && "bg-warning",
          )}
          data-webmcp-status-indicator
          data-webmcp-status-tone={availability}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">Learning Agent</p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              availability === "detecting" && "bg-muted-foreground/45",
              availability === "ready" && "bg-success",
              availability === "unsupported" && "bg-warning",
            )}
            data-webmcp-status-indicator
            data-webmcp-status-tone={availability}
          />
          {presentation.agentDetail}
        </p>
      </div>
    </div>
  );
}

function LearningPlan({
  availability,
}: Readonly<{ availability: WebMCPAvailability }>) {
  const workspace = useWorkspaceRuntime();
  const anchorRef = useInteractionAnchor(P0_INTERACTION_ANCHOR_IDS.plan);
  const presentation = getWebMCPAvailabilityPresentation(availability);
  const lesson = useSyncExternalStore(
    workspace.lessonStore.subscribe,
    workspace.lessonStore.getSnapshot,
    workspace.lessonStore.getSnapshot,
  );
  const planSteps =
    lesson.plan.steps.length > 0
      ? lesson.plan.steps.map((step) => ({
          id: step.id,
          label: step.title,
          state:
            step.status === "completed"
              ? ("complete" as const)
              : step.status === "active"
                ? ("current" as const)
                : ("pending" as const),
        }))
      : learningPlanMock;
  const isPlaceholderPlan = lesson.plan.steps.length === 0;
  const currentStepIndex = planSteps.findIndex(
    (step) => step.state === "current",
  );

  return (
    <section
      aria-labelledby="learning-plan-title"
      className="rounded-2xl border p-3"
      data-interaction-anchor={P0_INTERACTION_ANCHOR_IDS.plan}
      data-webmcp-availability={availability}
      ref={anchorRef}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-bold" id="learning-plan-title">
          Learning Plan
        </h2>
        {isPlaceholderPlan && availability !== "ready" ? (
          <span className="rounded-lg bg-secondary px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">
            {availability === "detecting" ? "Detecting" : "Unavailable"}
          </span>
        ) : (
          <span className="rounded-lg bg-secondary px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">
            Step {Math.max(1, currentStepIndex + 1)} of {planSteps.length}
          </span>
        )}
      </div>
      {isPlaceholderPlan && availability !== "ready" ? (
        <p className="rounded-xl bg-muted/45 px-3 py-4 text-xs leading-relaxed text-muted-foreground">
          {presentation.planDetail}
        </p>
      ) : (
        <ol className="space-y-1">
          {planSteps.map((step, index) => {
            const isCurrent = step.state === "current";
            const isComplete = step.state === "complete";

            return (
              <li
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-xl px-2.5 py-2 text-xs",
                  isCurrent && "bg-brand-soft text-accent-foreground",
                )}
                key={step.id}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-[0.68rem] font-semibold",
                    isCurrent && "border-primary bg-background text-primary",
                    isComplete && "border-success bg-success text-white",
                  )}
                >
                  {isComplete ? (
                    <Check aria-hidden="true" className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1",
                    isCurrent && "font-semibold",
                  )}
                >
                  {step.label}
                  {isCurrent ? (
                    <span className="mt-0.5 block text-[0.65rem] font-medium text-accent-foreground">
                      In progress
                    </span>
                  ) : null}
                </span>
                {isCurrent ? (
                  <Sparkles aria-hidden="true" className="size-4" />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ReferencePanel() {
  const workspace = useWorkspaceRuntime();
  const anchorRef = useInteractionAnchor(P0_INTERACTION_ANCHOR_IDS.reference);
  const referenceState = useSyncExternalStore(
    workspace.referencePanels.subscribe,
    workspace.referencePanels.getSnapshot,
    workspace.referencePanels.getSnapshot,
  );
  const workspaceState = useSyncExternalStore(
    workspace.store.subscribe,
    workspace.store.getSnapshot,
    workspace.store.getSnapshot,
  );
  const reference = referenceState.active;
  const isVisible = workspaceState.surfaces.some(
    ({ id, visible }) => id === reference?.surfaceId && visible,
  );
  if (!reference || !isVisible) return null;

  return (
    <section
      aria-labelledby="reference-panel-title"
      className="rounded-2xl border border-primary/25 bg-brand-soft/35 p-3"
      data-interaction-anchor={P0_INTERACTION_ANCHOR_IDS.reference}
      data-reference-id={reference.referenceId}
      ref={anchorRef}
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
        Reference
      </p>
      <h2 className="mt-1 text-sm font-bold" id="reference-panel-title">
        {reference.title}
      </h2>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
        {reference.content}
      </p>
      {reference.snippets.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {reference.snippets.map((snippet, index) => (
            <li key={`${snippet.languageId}:${index}`}>
              <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {snippet.languageId}
              </span>
              <pre className="mt-1 max-h-40 overflow-auto rounded-xl bg-background/80 p-2 text-[0.68rem] leading-relaxed">
                <code>{snippet.code}</code>
              </pre>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ActivityFeed({
  availability,
}: Readonly<{ availability: WebMCPAvailability }>) {
  const anchorRef = useInteractionAnchor(P0_INTERACTION_ANCHOR_IDS.activity);
  const presentation = getWebMCPAvailabilityPresentation(availability);
  return (
    <section
      aria-labelledby="activity-title"
      className="rounded-2xl border p-3"
      data-interaction-anchor={P0_INTERACTION_ANCHOR_IDS.activity}
      data-webmcp-availability={availability}
      ref={anchorRef}
    >
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-bold" id="activity-title">
          Live Activity
        </h2>
        <Button className="h-auto px-1 text-[0.68rem]" size="xs" variant="link">
          View All
        </Button>
      </div>
      {availability === "ready" ? (
        <ol className="space-y-1.5">
          {activityFeedMock.map((event) => {
            const Icon = activityIcons[event.kind];
            const isConnection = event.kind === "connection";

            return (
              <li
                className="grid grid-cols-[3.4rem_1rem_1fr_auto] items-center gap-1.5 text-[0.68rem]"
                key={event.id}
              >
                <time
                  className="font-mono text-muted-foreground tabular-nums"
                  dateTime={event.occurredAt}
                >
                  {activityTimeFormatter.format(new Date(event.occurredAt))}
                </time>
                <Icon aria-hidden="true" className="size-3.5 text-primary" />
                <span className="truncate text-muted-foreground">
                  {isConnection ? presentation.activityLabel : event.label}
                </span>
                <span
                  aria-label={
                    isConnection
                      ? presentation.activityStatusLabel
                      : "Activity recorded"
                  }
                  className={cn(
                    "size-1.5 rounded-full bg-primary",
                    isConnection && "bg-success",
                  )}
                  data-webmcp-status-indicator={isConnection ? "" : undefined}
                  data-webmcp-status-tone={
                    isConnection ? availability : undefined
                  }
                  role="img"
                />
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-3 text-[0.68rem] text-muted-foreground">
          <RadioTower aria-hidden="true" className="size-3.5 text-primary" />
          <span className="min-w-0 flex-1">{presentation.activityLabel}</span>
          <span
            aria-label={presentation.activityStatusLabel}
            className={cn(
              "size-2 shrink-0 rounded-full",
              availability === "detecting" && "bg-muted-foreground/45",
              availability === "unsupported" && "bg-warning",
            )}
            data-webmcp-status-indicator
            data-webmcp-status-tone={availability}
            role="img"
          />
        </div>
      )}
    </section>
  );
}

function useInteractionAnchor(anchorId: string) {
  const { interactionAnchorAdapter } = useWorkspaceRuntime();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    return element
      ? interactionAnchorAdapter.registerElement(anchorId, element)
      : undefined;
  }, [anchorId, interactionAnchorAdapter]);
  return ref;
}

function WebMCPStatusCard({
  availability,
}: Readonly<{ availability: WebMCPAvailability }>) {
  const presentation = getWebMCPAvailabilityPresentation(availability);

  return (
    <section
      aria-labelledby="webmcp-status-title"
      className={cn(
        "rounded-2xl border p-3",
        availability === "detecting" && "bg-muted/30",
        availability === "ready" && "border-primary/35 bg-brand-soft/70",
        availability === "unsupported" && "border-warning/45 bg-warning/10",
      )}
      data-webmcp-availability={availability}
    >
      <div className="flex items-start gap-2.5">
        <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-primary bg-background">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              availability === "detecting" && "bg-muted-foreground/45",
              availability === "ready" && "bg-success",
              availability === "unsupported" && "bg-warning",
            )}
            data-webmcp-status-indicator
            data-webmcp-status-tone={availability}
          />
        </span>
        <div>
          <h2 className="text-sm font-bold" id="webmcp-status-title">
            {presentation.statusTitle}
          </h2>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
            {presentation.statusDetail}
          </p>
        </div>
      </div>
      {availability === "ready" ? (
        <ul className="mt-3 grid grid-cols-5 overflow-hidden rounded-xl border border-primary/20 bg-background/65">
          {toolCapabilitiesMock.map((capability) => {
            const Icon = toolIcons[capability.id] ?? CircleDot;

            return (
              <li
                className="flex min-w-0 flex-col items-center gap-1 border-r px-1 py-2 last:border-r-0"
                key={capability.id}
                title={capability.label}
              >
                <Icon aria-hidden="true" className="size-4 text-primary" />
                <span className="max-w-full truncate text-[0.56rem] text-muted-foreground">
                  {capability.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export function AgentSidebar() {
  const { availability } = useWebMCPRuntime();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const resizeSession = useRef<ResizeSession | null>(null);
  const shouldReduceMotion = useReducedMotion();

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    resizeSession.current = {
      pointerId: event.pointerId,
      startWidth: panelWidth,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizeSession.current?.pointerId !== event.pointerId) {
      return;
    }

    const nextWidth =
      resizeSession.current.startWidth +
      resizeSession.current.startX -
      event.clientX;
    setPanelWidth(clampPanelWidth(nextWidth));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (resizeSession.current?.pointerId === event.pointerId) {
      resizeSession.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPanelWidth((current) => clampPanelWidth(current + 16));
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setPanelWidth((current) => clampPanelWidth(current - 16));
    }

    if (event.key === "Home") {
      event.preventDefault();
      setPanelWidth(MINIMUM_PANEL_WIDTH);
    }

    if (event.key === "End") {
      event.preventDefault();
      setPanelWidth(MAXIMUM_PANEL_WIDTH);
    }
  }

  return (
    <motion.aside
      animate={{ width: isCollapsed ? COLLAPSED_PANEL_WIDTH : panelWidth }}
      aria-label="Learning agent"
      className="relative order-3 flex h-full min-h-[42rem] shrink-0 flex-col overflow-visible rounded-[1.25rem] border bg-card text-card-foreground shadow-panel max-2xl:col-span-full max-2xl:!w-full max-2xl:min-h-0 2xl:order-none 2xl:col-span-1"
      data-agent-collapsed={isCollapsed}
      data-webmcp-availability={availability}
      initial={false}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {!isCollapsed ? (
        <div
          aria-label="Resize learning agent panel"
          aria-orientation="vertical"
          aria-valuemax={MAXIMUM_PANEL_WIDTH}
          aria-valuemin={MINIMUM_PANEL_WIDTH}
          aria-valuenow={panelWidth}
          className="absolute -left-3 top-1/2 z-10 hidden h-20 w-6 -translate-y-1/2 cursor-col-resize touch-none select-none items-center justify-center rounded-full outline-none before:h-9 before:w-1 before:rounded-full before:bg-border before:transition-[height,background-color] hover:before:h-11 hover:before:bg-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:before:h-11 focus-visible:before:bg-primary active:before:bg-primary 2xl:flex"
          onKeyDown={handleResizeKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          role="separator"
          tabIndex={0}
        />
      ) : null}

      <div className="absolute right-3 top-3 z-10 hidden 2xl:block">
        <Button
          aria-controls="learning-agent-content"
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed ? "Expand learning agent" : "Collapse learning agent"
          }
          onClick={() => setIsCollapsed((current) => !current)}
          size="icon-sm"
          variant="ghost"
        >
          {isCollapsed ? (
            <ChevronLeft aria-hidden="true" />
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
        </Button>
      </div>

      {isCollapsed ? (
        <div className="flex h-full flex-col items-center gap-5 px-3 py-16">
          <span className="relative grid size-10 place-items-center rounded-2xl bg-brand-soft text-primary">
            <Bot aria-hidden="true" className="size-5" />
            <span
              aria-hidden="true"
              className={cn(
                "absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-card",
                availability === "detecting" && "bg-muted-foreground/45",
                availability === "ready" && "bg-success",
                availability === "unsupported" && "bg-warning",
              )}
              data-webmcp-status-indicator
              data-webmcp-status-tone={availability}
            />
          </span>
          <span className="h-px w-8 bg-border" />
          <span className="text-[0.65rem] font-semibold [writing-mode:vertical-rl]">
            Learning Agent
          </span>
        </div>
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          id="learning-agent-content"
        >
          <AgentStatus availability={availability} />
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 md:grid md:grid-cols-3 2xl:flex">
            <LearningPlan availability={availability} />
            <ActivityFeed availability={availability} />
            <ReferencePanel />
            <WebMCPStatusCard availability={availability} />
            <DevToolPanel />
          </div>
        </div>
      )}
    </motion.aside>
  );
}
