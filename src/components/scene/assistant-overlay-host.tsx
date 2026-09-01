"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";

import {
  calculatePointerPath,
  PlacementEngine,
  type SceneControlAction,
  type ScenePresentationStore,
} from "@/core/scene";
import type { TargetGeometry } from "@/core/workspace/targeting";
import { cn } from "@/lib/utils";

export function AssistantOverlayHost({
  onControl,
  presentationStore,
}: Readonly<{
  onControl?: (action: Extract<SceneControlAction, "next" | "previous">) => Promise<unknown>;
  presentationStore: ScenePresentationStore;
}>) {
  const presentation = useSyncExternalStore(
    presentationStore.subscribe,
    presentationStore.getSnapshot,
    presentationStore.getSnapshot,
  );
  const target =
    presentation.targetSnapshot?.status === "resolved"
      ? presentation.targetSnapshot.geometry
      : undefined;
  const effectIds = new Set(presentation.effects.map(({ effectId }) => effectId));
  const callout = presentation.effects.find(
    ({ effectId }) => effectId === "effect.callout",
  )?.input?.text;
  const calloutText = typeof callout === "string" ? callout : undefined;
  const assistant = presentation.assistant;
  const companionRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const measured = useMeasuredSceneLayout({
    assistant,
    beatId: presentation.beatId,
    companionRef,
    guideRef,
    presentationStore,
    target,
  });
  const companionVisualState = resolveSceneCompanionVisualState(
    assistant.stateId,
    effectIds,
  );

  if (
    !assistant.visible &&
    !presentation.guide &&
    !presentation.caption &&
    !presentation.hint &&
    !calloutText
  ) {
    return null;
  }

  return (
    <div
      aria-label="Lessonique visual guidance"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      data-reduced-motion={assistant.reducedMotion}
      data-scene-id={presentation.sceneId}
      data-slot="assistant-overlay-host"
    >
      {target && effectIds.has("effect.spotlight") ? (
        <TargetSpotlight geometry={target} />
      ) : null}
      {target && effectIds.has("effect.focus") ? (
        <TargetFocus geometry={target} />
      ) : null}
      {target && effectIds.has("effect.highlight") ? (
        <TargetHighlight geometry={target} />
      ) : null}
      {target &&
      (effectIds.has("effect.point") || effectIds.has("effect.pointer")) &&
      assistant.visible ? (
        <TargetPointer
          companionLeft={
            assistant.position.left + assistant.position.companionOffsetLeft
          }
          companionTop={assistant.position.top + assistant.position.companionOffsetTop}
          companionSize={measured.companionSize}
          guideGeometry={measured.guideGeometry}
          geometry={target}
        />
      ) : null}

      <div
        className={cn(
          "lessonique-companion-presentation absolute flex items-center gap-4",
          assistant.position.companionOffsetLeft > 0 && "flex-row-reverse",
          assistant.position.docked && "items-end",
        )}
        data-assistant-docked={assistant.position.docked}
        data-assistant-facing={assistant.position.facing}
        data-assistant-side={assistant.position.side}
        style={{
          transform: `translate3d(${assistant.position.left}px, ${assistant.position.top}px, 0)`,
        }}
      >
        {assistant.visible ? (
          <LessoniqueCompanion
            facing={assistant.position.facing}
            containerRef={companionRef}
            paused={presentation.paused}
            stateId={assistant.stateId}
            status={assistant.status}
            visualState={companionVisualState}
          />
        ) : null}
        {presentation.guide ||
        presentation.caption ||
        presentation.hint ||
        calloutText ? (
          <VisualGuideCard
            callout={calloutText}
            caption={presentation.caption}
            guide={presentation.guide}
            hint={presentation.hint}
            navigation={presentation.navigation}
            onControl={onControl}
            paused={presentation.paused}
            phase={presentation.phase}
            ref={guideRef}
          />
        ) : null}
      </div>
    </div>
  );
}

export type CompanionVisualState =
  | "idle"
  | "connected"
  | "guiding"
  | "focusing"
  | "thinking"
  | "success"
  | "warning"
  | "incompatible";

const NORMAL_COMPANION_ASSET =
  "/images/companion/lessonique-companion-normal.png";
const INCOMPATIBLE_COMPANION_ASSET =
  "/images/companion/lessonique-companion-incompatible.png";

export function LessoniqueCompanion({
  className,
  containerRef,
  decorative = false,
  facing,
  paused,
  stateId,
  status,
  visualState,
}: Readonly<{
  className?: string;
  containerRef?: Ref<HTMLDivElement>;
  decorative?: boolean;
  facing: "left" | "right";
  paused: boolean;
  stateId: string;
  status: string;
  visualState?: CompanionVisualState;
}>) {
  const stateLabel = stateId.replace("assistant.", "");
  const resolvedVisualState =
    visualState ?? resolveAssistantVisualState(stateId);
  const asset =
    resolvedVisualState === "incompatible"
      ? INCOMPATIBLE_COMPANION_ASSET
      : NORMAL_COMPANION_ASSET;

  return (
    <div
      ref={containerRef}
      aria-hidden={decorative || undefined}
      aria-live={decorative ? undefined : "polite"}
      aria-label={
        decorative
          ? undefined
          : `Lessonique companion: ${stateLabel}${paused ? ", paused" : ""}`
      }
      className={cn(
        "lessonique-companion relative size-28 shrink-0",
        className,
      )}
      data-assistant-facing={facing}
      data-pointing-arm={stateId === "assistant.pointing" ? facing : "none"}
      data-assistant-state={stateId}
      data-assistant-status={status}
      data-companion-asset={
        resolvedVisualState === "incompatible" ? "incompatible" : "normal"
      }
      data-companion-visual-state={resolvedVisualState}
      role={decorative ? undefined : "status"}
    >
      <span aria-hidden="true" className="companion-aura" />
      <span aria-hidden="true" className="companion-focus-halo" />
      <span aria-hidden="true" className="companion-ground-shadow" />
      <span aria-hidden="true" className="companion-hover-system">
        <span className="companion-hover-ring companion-hover-ring-upper" />
        <span className="companion-hover-ring companion-hover-ring-lower" />
        <span className="companion-hover-spark" />
      </span>
      <span aria-hidden="true" className="companion-character-stage">
        <span className="companion-body-shell">
          <Image
            alt=""
            className="companion-character-image h-full w-full select-none object-contain"
            draggable={false}
            height={1254}
            loading="eager"
            sizes="(max-width: 640px) 144px, 176px"
            src={asset}
            width={1254}
          />
          <span className="companion-limb-layer companion-limb-left" />
          <span className="companion-limb-layer companion-limb-right" />
          <span className="companion-body-glitch-slice body-glitch-slice-a" />
          <span className="companion-body-glitch-slice body-glitch-slice-b" />
          <span className="companion-body-glitch-slice body-glitch-slice-c" />
          <span className="companion-eye-glimmer companion-eye-glimmer-left" />
          <span className="companion-eye-glimmer companion-eye-glimmer-right" />
          <span className="companion-expression-glow" />
          <span className="companion-blink-mask companion-blink-mask-left" />
          <span className="companion-blink-mask companion-blink-mask-right" />
          <span className="companion-leaf-glint" />
        </span>
      </span>
      <span aria-hidden="true" className="companion-hover-ripple" />
      <span aria-hidden="true" className="companion-state-spark" />
      <span aria-hidden="true" className="companion-interference-slice interference-a" />
      <span aria-hidden="true" className="companion-interference-slice interference-b" />
      <span aria-hidden="true" className="companion-interference-slice interference-c" />
      <span aria-hidden="true" className="companion-interference-slice interference-d" />
      <span aria-hidden="true" className="companion-signal-fragment fragment-a" />
      <span aria-hidden="true" className="companion-signal-fragment fragment-b" />
      <span aria-hidden="true" className="companion-signal-fragment fragment-c" />
    </div>
  );
}

function resolveAssistantVisualState(stateId: string): CompanionVisualState {
  switch (stateId) {
    case "assistant.explaining":
    case "assistant.pointing":
      return "guiding";
    case "assistant.thinking":
      return "thinking";
    case "assistant.waiting":
      return "idle";
    case "assistant.success":
      return "success";
    case "assistant.warning":
    case "assistant.error":
      return "warning";
    default:
      return "idle";
  }
}

function resolveSceneCompanionVisualState(
  stateId: string,
  effectIds: ReadonlySet<string>,
): CompanionVisualState {
  if (stateId === "assistant.pointing") return "guiding";
  const semanticState = resolveAssistantVisualState(stateId);
  if (
    semanticState === "thinking" ||
    semanticState === "success" ||
    semanticState === "warning"
  ) {
    return semanticState;
  }
  if (effectIds.has("effect.focus") || effectIds.has("effect.spotlight")) {
    return "focusing";
  }
  return semanticState;
}

function VisualGuideCard({
  callout,
  caption,
  guide,
  hint,
  navigation,
  onControl,
  paused,
  phase,
  ref,
}: Readonly<{
  callout?: string;
  caption?: string;
  guide?: { title?: string; body: string; supportingItems?: string[] };
  hint?: string;
  navigation: {
    enabled: boolean;
    current: number;
    total: number;
    canGoPrevious: boolean;
    canGoNext: boolean;
    nextBlocked: boolean;
  };
  onControl?: (action: "next" | "previous") => Promise<unknown>;
  paused: boolean;
  phase: "teaching" | "interaction" | "validating" | "feedback" | "completed";
}> & { ref?: Ref<HTMLElement> }) {
  const [navigating, setNavigating] = useState(false);
  const navigate = async (action: "next" | "previous") => {
    if (!onControl || navigating) return;
    setNavigating(true);
    try {
      await onControl(action);
    } finally {
      setNavigating(false);
    }
  };
  return (
    <aside
      ref={ref}
      aria-label="Teaching guide"
      className={cn(
        "w-[min(19rem,calc(100vw-9rem))] rounded-2xl border border-primary/25 bg-card/96 text-card-foreground shadow-floating backdrop-blur-md",
        navigation.enabled ? "pointer-events-auto" : "pointer-events-none",
        phase === "interaction" ? "max-w-72 p-3" : "p-4",
      )}
      data-scene-phase={phase}
      data-slot="visual-guide"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-primary">
          Lessonique guide
        </p>
        {paused ? (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.62rem] font-semibold text-warning">
            Paused
          </span>
        ) : null}
      </div>
      {guide?.title ? <h2 className="text-sm font-bold">{guide.title}</h2> : null}
      {guide ? (
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {guide.body}
        </p>
      ) : null}
      {guide?.supportingItems?.length ? (
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[0.7rem] text-muted-foreground">
          {guide.supportingItems.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ol>
      ) : null}
      {callout ? (
        <p className="mt-3 rounded-xl border border-primary/20 bg-brand-soft/70 px-3 py-2 text-[0.72rem] font-medium leading-relaxed text-foreground">
          {callout}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-3 rounded-xl bg-warning/12 px-3 py-2 text-[0.7rem] leading-relaxed text-foreground">
          <span className="font-bold">Hint:</span> {hint}
        </p>
      ) : null}
      {caption ? (
        <p className="mt-3 border-t pt-2 text-[0.68rem] font-medium text-foreground">
          {caption}
        </p>
      ) : null}
      {navigation.enabled ? (
        <div
          aria-label="Teaching scene navigation"
          className="mt-3 flex items-center justify-between gap-2 border-t pt-3"
          data-slot="scene-navigation"
          role="group"
        >
          <button
            className="rounded-lg border px-2.5 py-1.5 text-[0.7rem] font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!navigation.canGoPrevious || navigating}
            onClick={() => void navigate("previous")}
            type="button"
          >
            Previous
          </button>
          <span aria-live="polite" className="text-[0.68rem] font-semibold text-muted-foreground">
            Step {navigation.current} of {navigation.total}
          </span>
          <button
            className="rounded-lg bg-primary px-3 py-1.5 text-[0.7rem] font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!navigation.canGoNext || navigation.nextBlocked || navigating}
            onClick={() => void navigate("next")}
            title={navigation.nextBlocked ? "Complete the required interaction first." : undefined}
            type="button"
          >
            Next
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function TargetSpotlight({ geometry }: Readonly<{ geometry: TargetGeometry }>) {
  return (
    <div
      aria-hidden="true"
      className="absolute rounded-xl border-2 border-primary/70 shadow-[0_0_0_9999px_rgb(18_16_38_/_0.46)] transition-[left,top,width,height] duration-150 motion-reduce:transition-none"
      data-guidance-effect="spotlight"
      style={targetStyle(geometry, 7)}
    />
  );
}

function TargetFocus({ geometry }: Readonly<{ geometry: TargetGeometry }>) {
  return (
    <div
      aria-hidden="true"
      className="absolute rounded-lg border-2 border-cyan-300 shadow-[0_0_0_4px_rgb(124_92_255_/_0.22),0_0_24px_rgb(83_224_255_/_0.45)] transition-[left,top,width,height] duration-150 motion-reduce:transition-none"
      data-guidance-effect="focus"
      style={targetStyle(geometry, 4)}
    />
  );
}

function TargetHighlight({ geometry }: Readonly<{ geometry: TargetGeometry }>) {
  return (
    <div
      aria-hidden="true"
      className="absolute rounded-lg border-2 border-dashed border-primary bg-primary/8 transition-[left,top,width,height] duration-150 motion-reduce:transition-none"
      data-guidance-effect="highlight"
      style={targetStyle(geometry, 3)}
    />
  );
}

function TargetPointer({
  companionLeft,
  companionTop,
  companionSize,
  guideGeometry,
  geometry,
}: Readonly<{
  companionLeft: number;
  companionTop: number;
  companionSize: { width: number; height: number };
  guideGeometry?: TargetGeometry;
  geometry: TargetGeometry;
}>) {
  const points = calculatePointerPath({
    assistant: {
      left: companionLeft,
      top: companionTop,
      width: companionSize.width,
      height: companionSize.height,
    },
    ...(guideGeometry ? { guide: guideGeometry } : {}),
    target: geometry,
  });
  const serializedPoints = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const start = points[0]!;
  const end = points.at(-1)!;
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 size-full overflow-visible"
      data-pointer-end={`${end.x},${end.y}`}
      data-pointer-start={`${start.x},${start.y}`}
      data-guidance-effect="point"
    >
      <defs>
        <linearGradient id="lessonique-pointer-gradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="rgb(124 92 255)" />
          <stop offset="1" stopColor="rgb(103 232 249)" />
        </linearGradient>
        <marker
          id="lessonique-pointer-head"
          markerHeight="8"
          markerUnits="strokeWidth"
          markerWidth="8"
          orient="auto"
          refX="7"
          refY="4"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="rgb(165 243 252)" />
        </marker>
      </defs>
      <polyline
        fill="none"
        markerEnd="url(#lessonique-pointer-head)"
        points={serializedPoints}
        stroke="url(#lessonique-pointer-gradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

const overlayPlacement = new PlacementEngine();

function useMeasuredSceneLayout({
  assistant,
  beatId,
  companionRef,
  guideRef,
  presentationStore,
  target,
}: {
  assistant: ReturnType<ScenePresentationStore["getSnapshot"]>["assistant"];
  beatId?: string;
  companionRef: { current: HTMLDivElement | null };
  guideRef: { current: HTMLElement | null };
  presentationStore: ScenePresentationStore;
  target?: TargetGeometry;
}) {
  const [measurement, setMeasurement] = useState<{
    companionSize: { width: number; height: number };
    guideGeometry?: TargetGeometry;
  }>({ companionSize: { width: 112, height: 112 } });
  const targetHeight = target?.height;
  const targetLeft = target?.left;
  const targetTop = target?.top;
  const targetWidth = target?.width;

  useEffect(() => {
    let animationFrame = 0;
    let followUpFrame = 0;
    const synchronize = () => {
      animationFrame = 0;
      const companionRect = companionRef.current?.getBoundingClientRect();
      const guideRect = guideRef.current?.getBoundingClientRect();
      const companionSize = {
        width: companionRect?.width || 112,
        height: companionRect?.height || 112,
      };
      const guideSize = {
        width: guideRect?.width || 0,
        height: guideRect?.height || 0,
      };
      const obstructions = Array.from(
        document.querySelectorAll<HTMLElement>('[data-scene-obstruction="true"]'),
      ).map((element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, top: value.top, width: value.width, height: value.height };
      });
      const position = overlayPlacement.calculate({
        placementId: assistant.placementId,
        ...(targetLeft !== undefined &&
        targetTop !== undefined &&
        targetWidth !== undefined &&
        targetHeight !== undefined
          ? {
              target: {
                left: targetLeft,
                top: targetTop,
                width: targetWidth,
                height: targetHeight,
              },
            }
          : {}),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        assistantSize: companionSize,
        guideSize,
        obstructions,
      });
      presentationStore.patch((current) =>
        positionsEqual(current.assistant.position, position)
          ? current
          : {
              ...current,
              assistant: { ...current.assistant, position },
            },
      );
      const nextGuideGeometry = guideRef.current
        ? (() => {
            const value = guideRef.current!.getBoundingClientRect();
            return { left: value.left, top: value.top, width: value.width, height: value.height };
          })()
        : undefined;
      setMeasurement((current) =>
        measurementsEqual(current, companionSize, nextGuideGeometry)
          ? current
          : {
              companionSize,
              ...(nextGuideGeometry ? { guideGeometry: nextGuideGeometry } : {}),
            },
      );
      followUpFrame = window.requestAnimationFrame(() => {
        const value = guideRef.current?.getBoundingClientRect();
        if (!value) return;
        const guideGeometry = {
          left: value.left,
          top: value.top,
          width: value.width,
          height: value.height,
        };
        setMeasurement((current) =>
          measurementsEqual(current, current.companionSize, guideGeometry)
            ? current
            : { ...current, guideGeometry },
        );
      });
    };
    const schedule = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(synchronize);
    };
    const observer = new ResizeObserver(schedule);
    if (companionRef.current) observer.observe(companionRef.current);
    if (guideRef.current) observer.observe(guideRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (followUpFrame) window.cancelAnimationFrame(followUpFrame);
    };
  }, [
    assistant.placementId,
    beatId,
    companionRef,
    guideRef,
    presentationStore,
    targetHeight,
    targetLeft,
    targetTop,
    targetWidth,
  ]);

  return measurement;
}

function positionsEqual(
  left: ReturnType<ScenePresentationStore["getSnapshot"]>["assistant"]["position"],
  right: ReturnType<ScenePresentationStore["getSnapshot"]>["assistant"]["position"],
): boolean {
  return (
    left.left === right.left &&
    left.top === right.top &&
    left.docked === right.docked &&
    left.side === right.side &&
    left.facing === right.facing &&
    left.companionOffsetLeft === right.companionOffsetLeft &&
    left.companionOffsetTop === right.companionOffsetTop
  );
}

function measurementsEqual(
  current: { companionSize: { width: number; height: number }; guideGeometry?: TargetGeometry },
  companionSize: { width: number; height: number },
  guideGeometry?: TargetGeometry,
): boolean {
  return (
    current.companionSize.width === companionSize.width &&
    current.companionSize.height === companionSize.height &&
    current.guideGeometry?.left === guideGeometry?.left &&
    current.guideGeometry?.top === guideGeometry?.top &&
    current.guideGeometry?.width === guideGeometry?.width &&
    current.guideGeometry?.height === guideGeometry?.height
  );
}

function targetStyle(geometry: TargetGeometry, padding: number) {
  return {
    left: geometry.left - padding,
    top: geometry.top - padding,
    width: geometry.width + padding * 2,
    height: geometry.height + padding * 2,
  };
}
