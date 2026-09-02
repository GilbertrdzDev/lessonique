"use client";

import {
  BookOpenCheck,
  BrainCircuit,
  Check,
  Circle,
  CodeXml,
  FileStack,
  LayoutPanelTop,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import type {
  GuideBuildSnapshot,
  GuideBuildStageId,
} from "@/core/guide-build";
import { cn } from "@/lib/utils";

const BUILD_STAGES = [
  {
    id: "understanding-goal",
    title: "Understanding your goal",
    description: "Analyzing your request",
    icon: BrainCircuit,
  },
  {
    id: "preparing-lesson",
    title: "Preparing the lesson",
    description: "Generating content & examples",
    icon: BookOpenCheck,
  },
  {
    id: "setting-up-classroom",
    title: "Setting up the classroom",
    description: "Configuring your workspace",
    icon: LayoutPanelTop,
  },
] as const satisfies readonly {
  id: GuideBuildStageId;
  title: string;
  description: string;
  icon: typeof BrainCircuit;
}[];

export function GuideBuildLobby({
  build,
}: Readonly<{ build: GuideBuildSnapshot }>) {
  const shouldReduceMotion = useReducedMotion();
  const isError = build.status === "error";
  const activeIndex = Math.max(
    0,
    BUILD_STAGES.findIndex(({ id }) => id === build.stage),
  );

  return (
    <motion.main
      animate={{ opacity: 1, scale: 1, y: 0 }}
      aria-labelledby="experience-title"
      className="relative mx-auto flex min-h-[calc(100svh-6.5rem)] w-full max-w-[120rem] flex-col items-center overflow-hidden px-4 pb-10 pt-[20rem] text-center sm:px-8 sm:pt-[22.5rem]"
      data-guide-build-stage={build.stage ?? "unknown"}
      data-guide-build-status={build.status}
      data-lobby-state={isError ? "guide-build-error" : "building-guide"}
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.99, y: 8 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.55,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <BuildContextCards />
      <div className="relative z-10 w-full max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {isError ? "Build paused" : "Assembling your learning experience"}
        </p>
        <h1
          className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          id="experience-title"
        >
          {isError ? (
            "Your AI guide needs another try"
          ) : (
            <>
              Building your <span className="text-primary">AI guide...</span>
            </>
          )}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty sm:text-base">
          {isError
            ? build.message ?? "Lessonique could not finish building this guide."
            : "Lessonique is turning your request into a focused lesson, practical examples, and a ready-to-use classroom."}
        </p>

        <ol
          aria-label="Guide build stages"
          className="mx-auto mt-7 grid max-w-4xl gap-3 text-left md:grid-cols-3"
        >
          {BUILD_STAGES.map((stage, index) => {
            const complete = index < activeIndex;
            const current = index === activeIndex;
            const Icon = stage.icon;
            return (
              <li
                aria-current={current && !isError ? "step" : undefined}
                className={cn(
                  "relative flex min-h-24 items-start gap-3 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-colors",
                  complete && "border-success/35 bg-success/5",
                  current && !isError && "border-primary/45 bg-brand-soft/65",
                  current && isError && "border-destructive/35 bg-destructive/5",
                )}
                data-build-stage-state={
                  complete ? "complete" : current ? (isError ? "error" : "active") : "pending"
                }
                key={stage.id}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground",
                    complete && "bg-success/15 text-success",
                    current && !isError && "bg-primary text-primary-foreground",
                    current && isError && "bg-destructive/10 text-destructive",
                  )}
                >
                  {complete ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : current && !isError ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin motion-reduce:animate-none"
                    />
                  ) : current && isError ? (
                    <TriangleAlert aria-hidden="true" className="size-4" />
                  ) : (
                    <Circle aria-hidden="true" className="size-3" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <Icon aria-hidden="true" className="size-4 text-primary" />
                    {stage.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {stage.description}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <div
          aria-live="polite"
          className={cn(
            "mx-auto mt-5 flex min-h-11 max-w-2xl items-center justify-center gap-3 rounded-xl border bg-card/75 px-4 text-sm font-semibold shadow-sm",
            isError && "border-destructive/30 text-destructive",
          )}
          role={isError ? "alert" : "status"}
        >
          {isError ? (
            <TriangleAlert aria-hidden="true" className="size-4" />
          ) : (
            <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          )}
          {build.message ?? BUILD_STAGES[activeIndex]?.description}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {isError
            ? "Ask ChatGPT to retry the lesson request when you are ready."
            : "Your classroom opens automatically when the real setup finishes."}
        </p>
      </div>
    </motion.main>
  );
}

function BuildContextCards() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden xl:block">
      <div className="absolute left-[4%] top-36 w-48 rotate-[-2deg] rounded-2xl border bg-card/70 p-4 text-left shadow-panel backdrop-blur-sm">
        <FileStack className="size-5 text-primary" />
        <div className="mt-3 h-2 w-3/4 rounded-full bg-primary/20" />
        <div className="mt-2 h-2 w-full rounded-full bg-muted" />
        <div className="mt-2 h-2 w-2/3 rounded-full bg-muted" />
      </div>
      <div className="absolute right-[5%] top-44 w-52 rotate-[2deg] rounded-2xl border bg-card/70 p-4 text-left shadow-panel backdrop-blur-sm">
        <CodeXml className="size-5 text-primary" />
        <div className="mt-3 rounded-lg bg-secondary p-2 font-mono text-[0.6rem] leading-4 text-muted-foreground">
          const lesson = ready;
          <br />
          practice(example);
        </div>
      </div>
    </div>
  );
}
