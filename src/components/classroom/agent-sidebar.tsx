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
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  activityFeedMock,
  learningPlanMock,
  toolCapabilitiesMock,
  type ActivityKind,
} from "@/features/classroom/classroom-mocks";
import { cn } from "@/lib/utils";

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

function AgentStatus() {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-4">
      <div className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-primary">
        <Bot aria-hidden="true" className="size-6" />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-card bg-success"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">Learning Agent</p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span aria-hidden="true" className="size-2 rounded-full bg-success" />
          Guided session through ChatGPT
        </p>
      </div>
    </div>
  );
}

function LearningPlan() {
  const currentStepIndex = learningPlanMock.findIndex(
    (step) => step.state === "current",
  );

  return (
    <section
      aria-labelledby="learning-plan-title"
      className="rounded-2xl border p-3"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-bold" id="learning-plan-title">
          Learning Plan
        </h2>
        <span className="rounded-lg bg-secondary px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">
          Step {currentStepIndex + 1} of {learningPlanMock.length}
        </span>
      </div>
      <ol className="space-y-1">
        {learningPlanMock.map((step, index) => {
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
                className={cn("min-w-0 flex-1", isCurrent && "font-semibold")}
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
    </section>
  );
}

function ActivityFeed() {
  return (
    <section
      aria-labelledby="activity-title"
      className="rounded-2xl border p-3"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-bold" id="activity-title">
          Live Activity
        </h2>
        <Button className="h-auto px-1 text-[0.68rem]" size="xs" variant="link">
          View All
        </Button>
      </div>
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
                {event.label}
              </span>
              <span
                aria-label={isConnection ? "Connected" : "Activity recorded"}
                className={cn(
                  "size-1.5 rounded-full bg-primary",
                  isConnection && "bg-success",
                )}
                role="img"
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WebMCPStatusCard() {
  return (
    <section
      aria-labelledby="webmcp-status-title"
      className="rounded-2xl border border-primary/35 bg-brand-soft/70 p-3"
    >
      <div className="flex items-start gap-2.5">
        <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-primary bg-background">
          <span aria-hidden="true" className="size-2 rounded-full bg-success" />
        </span>
        <div>
          <h2 className="text-sm font-bold" id="webmcp-status-title">
            WebMCP Ready
          </h2>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
            Classroom tools are available for this guided session.
          </p>
        </div>
      </div>
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
    </section>
  );
}

export function AgentSidebar() {
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
              className="absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-card bg-success"
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
          <AgentStatus />
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3 md:grid md:grid-cols-3 2xl:flex">
            <LearningPlan />
            <ActivityFeed />
            <WebMCPStatusCard />
          </div>
        </div>
      )}
    </motion.aside>
  );
}
