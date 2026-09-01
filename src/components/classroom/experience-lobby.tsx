"use client";

import {
  Bot,
  Link2,
  RadioTower,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import type { LessoniqueExperienceState } from "@/features/classroom/experience-state";

type LobbyState = Exclude<LessoniqueExperienceState, "classroom">;

export function ExperienceLobby({ state }: Readonly<{ state: LobbyState }>) {
  const shouldReduceMotion = useReducedMotion();
  const content = LOBBY_CONTENT[state];

  return (
    <motion.main
      animate={{ opacity: 1, scale: 1, y: 0 }}
      aria-labelledby="experience-title"
      className="mx-auto flex min-h-[calc(100svh-6.5rem)] w-full max-w-[120rem] flex-col items-center px-4 pb-10 pt-[22rem] text-center sm:px-8 sm:pt-[24rem]"
      data-lobby-state={state}
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.985, y: 10 }}
      key={state}
      transition={{ duration: shouldReduceMotion ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-full max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {content.eyebrow}
        </p>
        <h1
          className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          id="experience-title"
        >
          {content.titleStart}{" "}
          <span className="text-primary">{content.titleAccent}</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground text-pretty sm:text-base">
          {content.description}
        </p>

        <div
          className="mx-auto mt-6 flex min-h-12 max-w-xl items-center justify-center gap-3 rounded-xl border bg-card/75 px-4 text-sm font-semibold shadow-sm"
          role="status"
        >
          <content.indicatorIcon aria-hidden="true" className="size-4 text-primary" />
          {content.indicator}
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          {content.secondary}
        </p>
      </div>

      {state === "connected" ? (
        <div className="mt-7 w-full max-w-xl">
          <div className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-floating">
            <Sparkles aria-hidden="true" className="size-4" />
            Tell the agent what you want to learn
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Your classroom will appear here once the agent starts your lesson.
          </p>
        </div>
      ) : state === "starting-session" ? (
        <div className="mt-8 flex items-center gap-3 text-sm font-medium text-primary" role="status">
          <span className="size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          Preparing the environment, files, and learning plan
        </div>
      ) : (
        <InstructionCard state={state} />
      )}
    </motion.main>
  );
}

function InstructionCard({
  state,
}: Readonly<{ state: "unsupported" | "supported-disconnected" }>) {
  const disconnected = state === "supported-disconnected";
  const steps = disconnected
    ? [
        ["Keep this page open", Bot],
        ["Connect through ChatGPT with WebMCP", Link2],
        ["Lessonique continues automatically", Sparkles],
      ] as const
    : [
        ["Open Lessonique through ChatGPT", Bot],
        ["Use a browser or session with WebMCP support", RadioTower],
        ["Return here once compatibility is available", Sparkles],
      ] as const;

  return (
    <section className="mt-8 w-full max-w-3xl rounded-2xl border bg-card/70 p-4 text-left shadow-panel sm:p-5">
      <h2 className="text-sm font-bold">
        {disconnected ? "What happens next" : "What to do"}
      </h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map(([label, Icon], index) => (
          <li className="flex items-center gap-3 rounded-xl border bg-background/65 px-3 py-3 text-xs leading-5" key={label}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-primary">
              {index + 1}
            </span>
            <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span>{label}</span>
          </li>
        ))}
      </ol>
      {disconnected ? (
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          The agent can also confirm the connection dynamically.
        </p>
      ) : null}
    </section>
  );
}

const LOBBY_CONTENT = {
  unsupported: {
    eyebrow: "Browser not compatible",
    titleStart: "This browser can’t connect to your",
    titleAccent: "AI guide",
    description:
      "Lessonique needs a ChatGPT session or browser with WebMCP support. Open Lessonique from a compatible agent session to continue.",
    indicator: "WebMCP unavailable in this browser",
    indicatorIcon: WifiOff,
    secondary: "Use a compatible ChatGPT + WebMCP environment",
  },
  "supported-disconnected": {
    eyebrow: "Looking for WebMCP connection",
    titleStart: "Waiting for your",
    titleAccent: "AI guide",
    description:
      "Lessonique will detect the WebMCP connection automatically. You can also let the ChatGPT agent confirm the connection and continue for you.",
    indicator: "Detecting connection...",
    indicatorIcon: RadioTower,
    secondary: "No refresh needed",
  },
  connected: {
    eyebrow: "Connected through WebMCP",
    titleStart: "Your",
    titleAccent: "AI guide is ready",
    description:
      "Tell the ChatGPT agent what you want to learn. Once you send your instruction, Lessonique will build your classroom automatically.",
    indicator: "Tell ChatGPT what you want to learn",
    indicatorIcon: Sparkles,
    secondary: "ChatGPT remains your conversational interface",
  },
  "starting-session": {
    eyebrow: "Starting session",
    titleStart: "Building your",
    titleAccent: "lesson...",
    description:
      "Lessonique is preparing the guided classroom requested through ChatGPT.",
    indicator: "Creating your classroom",
    indicatorIcon: Sparkles,
    secondary: "The workspace will open here automatically",
  },
} as const;
