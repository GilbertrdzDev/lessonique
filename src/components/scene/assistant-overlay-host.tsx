"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { createPortal } from "react-dom";

import {
  calculatePointerPath,
  PlacementEngine,
  type SceneControlAction,
  type ScenePresentationVisibility,
  type ScenePresentationStore,
} from "@/core/scene";
import type {
  TargetGeometry,
  TargetRectangle,
} from "@/core/workspace/targeting";
import { cn } from "@/lib/utils";

const subscribeToPortalHost = () => () => undefined;
const getPortalHost = (): HTMLElement | null => document.body;
const getServerPortalHost = (): HTMLElement | null => null;

export function AssistantOverlayHost({
  onControl,
  onReturnToStep,
  presentationStore,
}: Readonly<{
  onControl?: (action: Extract<SceneControlAction, "next" | "previous">) => Promise<unknown>;
  onReturnToStep?: () => Promise<unknown>;
  presentationStore: ScenePresentationStore;
}>) {
  const portalHost = useSyncExternalStore(
    subscribeToPortalHost,
    getPortalHost,
    getServerPortalHost,
  );
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
  const visibility = presentation.visibility;
  const companionRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const measured = useMeasuredSceneLayout({
    assistant,
    beatId: presentation.beatId,
    companionRef,
    generation: presentation.generation,
    guideRef,
    presentationStore,
    target,
    visibility,
  });
  const companionVisualState = resolveSceneCompanionVisualState(
    assistant.stateId,
    effectIds,
  );

  useEffect(() => {
    if (!presentation.sceneId || visibility === "hidden-by-user") return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      presentationStore.patch((current) => ({
        ...current,
        visibility: "hidden-by-user",
      }));
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [presentation.sceneId, presentationStore, visibility]);

  const hideGuide = () => {
    presentationStore.patch((current) => ({
      ...current,
      visibility: "hidden-by-user",
    }));
  };

  const resumeGuide = async () => {
    presentationStore.patch((current) => ({
      ...current,
      visibility: "transitioning",
      navigation: { ...current.navigation, transitioning: true },
    }));
    try {
      await onReturnToStep?.();
    } finally {
      const current = presentationStore.getSnapshot();
      if (current.visibility === "transitioning") {
        presentationStore.patch((snapshot) => ({
          ...snapshot,
          visibility:
            snapshot.target && snapshot.targetSnapshot?.status !== "resolved"
              ? "out-of-view"
              : "visible",
          navigation: { ...snapshot.navigation, transitioning: false },
        }));
      }
    }
  };

  if (
    !assistant.visible &&
    !presentation.guide &&
    !presentation.caption &&
    !presentation.hint &&
    !calloutText
  ) {
    return null;
  }

  const content = visibility === "hidden-by-user" ? (
    <button
      aria-label="Resume guide"
      className="pointer-events-auto fixed bottom-4 left-4 z-50 rounded-full border border-primary/30 bg-card px-4 py-2 text-xs font-semibold text-primary shadow-floating"
      data-guidance-visibility="hidden-by-user"
      onClick={() => void resumeGuide()}
      type="button"
    >
      Resume guide
    </button>
  ) : (
    <div
      aria-label="Lessonique visual guidance"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      data-guidance-generation={presentation.generation}
      data-guidance-visibility={visibility}
      data-reduced-motion={assistant.reducedMotion}
      data-scene-id={presentation.sceneId}
      data-slot="assistant-overlay-host"
    >
      {visibility === "visible" && target && effectIds.has("effect.spotlight") ? (
        <TargetSpotlight geometry={target} />
      ) : null}
      {visibility === "visible" && target && effectIds.has("effect.focus") ? (
        <TargetFocus geometry={target} />
      ) : null}
      {visibility === "visible" && target && effectIds.has("effect.highlight") ? (
        <TargetHighlight geometry={target} />
      ) : null}
      {visibility === "visible" && target &&
      (effectIds.has("effect.point") || effectIds.has("effect.pointer")) &&
      assistant.visible &&
      measured.ready &&
      !assistant.position.companionSuppressed ? (
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

      {visibility === "out-of-view" ? (
        <OutOfViewGuide
          current={presentation.navigation.current}
          onHide={hideGuide}
          onReturn={() => void resumeGuide()}
          title={presentation.guide?.title}
          total={presentation.navigation.total}
        />
      ) : null}

      {visibility === "visible" ? (
        <>
          {assistant.visible && !assistant.position.companionSuppressed ? (
            <div
              className="lessonique-companion-presentation absolute"
              data-assistant-docked={assistant.position.docked}
              data-assistant-facing={assistant.position.facing}
              data-assistant-side={assistant.position.side}
              style={{
                transform: `translate3d(${assistant.position.left + assistant.position.companionOffsetLeft}px, ${assistant.position.top + assistant.position.companionOffsetTop}px, 0)`,
                transition: "none",
                visibility: measured.ready ? "visible" : "hidden",
              }}
            >
          <LessoniqueCompanion
            facing={assistant.position.facing}
            containerRef={companionRef}
            paused={presentation.paused}
            stateId={assistant.stateId}
            status={assistant.status}
            visualState={companionVisualState}
          />
            </div>
          ) : null}
          {!assistant.position.guideSuppressed && (presentation.guide ||
          presentation.caption ||
          presentation.hint ||
          calloutText) ? (
            <div
              className="lessonique-guide-presentation absolute"
              style={{
                transform: `translate3d(${assistant.position.left + assistant.position.guideOffsetLeft}px, ${assistant.position.top + assistant.position.guideOffsetTop}px, 0)`,
                transition: "none",
                visibility: measured.ready ? "visible" : "hidden",
              }}
            >
              <VisualGuideCard
                callout={calloutText}
                caption={presentation.caption}
                guide={presentation.guide}
                hint={presentation.hint}
                navigation={presentation.navigation}
                onControl={onControl}
                onHide={hideGuide}
                paused={presentation.paused}
                phase={presentation.phase}
                ref={guideRef}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
  return portalHost ? createPortal(content, portalHost) : content;
}

function OutOfViewGuide({
  current,
  onHide,
  onReturn,
  title,
  total,
}: Readonly<{
  current: number;
  onHide(): void;
  onReturn(): void;
  title?: string;
  total: number;
}>) {
  return (
    <aside
      aria-label="Teaching guide paused"
      className="pointer-events-auto fixed bottom-4 left-1/2 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-warning/35 bg-card p-4 text-card-foreground shadow-floating"
    >
      <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-warning">
        Step paused
      </p>
      {title ? <h2 className="mt-1 text-sm font-bold">{title}</h2> : null}
      <p className="mt-1 text-xs text-muted-foreground">
        The explained element is out of view. The step and progress are unchanged.
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[0.68rem] font-semibold text-muted-foreground">
          Step {current} of {total}
        </span>
        <div className="flex gap-2">
          <button className="rounded-lg border px-3 py-1.5 text-[0.7rem] font-semibold" onClick={onHide} type="button">
            Hide guide
          </button>
          <button className="rounded-lg bg-primary px-3 py-1.5 text-[0.7rem] font-semibold text-primary-foreground" onClick={onReturn} type="button">
            Return to step
          </button>
        </div>
      </div>
    </aside>
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
  onHide,
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
    transitioning: boolean;
  };
  onControl?: (action: "next" | "previous") => Promise<unknown>;
  onHide(): void;
  paused: boolean;
  phase: "teaching" | "interaction" | "validating" | "feedback" | "completed";
}> & { ref?: Ref<HTMLElement> }) {
  const [navigating, setNavigating] = useState(false);
  const navigate = async (action: "next" | "previous") => {
    if (!onControl || navigating || navigation.transitioning) return;
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
        "max-h-[calc(100dvh-2rem)] w-[min(18rem,calc(100vw-9rem))] overflow-y-auto rounded-2xl border border-primary/25 bg-card/96 text-card-foreground shadow-floating backdrop-blur-md",
        "pointer-events-auto",
        phase === "interaction" ? "max-w-72 p-3" : "p-4",
      )}
      data-scene-phase={phase}
      data-slot="visual-guide"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-primary">
          Lessonique guide
        </p>
        <button
          aria-label="Hide guide"
          className="rounded-md px-2 py-1 text-[0.65rem] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onHide}
          type="button"
        >
          Hide
        </button>
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
            disabled={!navigation.canGoPrevious || navigating || navigation.transitioning}
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
            disabled={!navigation.canGoNext || navigation.nextBlocked || navigating || navigation.transitioning}
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
  const maskId = `lessonique-spotlight-${useId().replaceAll(":", "")}`;
  const fragments = targetFragments(geometry);
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 size-full"
      data-guidance-effect="spotlight"
    >
      <defs>
        <mask id={maskId}>
          <rect fill="white" height="100%" width="100%" />
          {fragments.map((fragment, index) => (
            <rect
              fill="black"
              key={index}
              rx="6"
              {...svgTargetRect(fragment, 6)}
            />
          ))}
        </mask>
      </defs>
      <rect fill="rgb(18 16 38 / 0.46)" height="100%" mask={`url(#${maskId})`} width="100%" />
      {fragments.map((fragment, index) => (
        <rect
          fill="none"
          key={index}
          rx="6"
          stroke="rgb(124 92 255 / 0.8)"
          strokeWidth="2"
          {...svgTargetRect(fragment, 6)}
        />
      ))}
    </svg>
  );
}

function TargetFocus({ geometry }: Readonly<{ geometry: TargetGeometry }>) {
  return (
    <>
      {targetFragments(geometry).map((fragment, index) => (
        <div
          aria-hidden="true"
          className="absolute rounded-lg border-2 border-cyan-300 shadow-[0_0_0_4px_rgb(124_92_255_/_0.22),0_0_24px_rgb(83_224_255_/_0.45)]"
          data-guidance-effect="focus"
          data-guidance-fragment={index}
          key={index}
          style={targetStyle(fragment, 4)}
        />
      ))}
    </>
  );
}

function TargetHighlight({ geometry }: Readonly<{ geometry: TargetGeometry }>) {
  return (
    <>
      {targetFragments(geometry).map((fragment, index) => (
        <div
          aria-hidden="true"
          className="absolute rounded-lg border-2 border-dashed border-primary bg-primary/8"
          data-guidance-effect="highlight"
          data-guidance-fragment={index}
          key={index}
          style={targetStyle(fragment, 3)}
        />
      ))}
    </>
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
  generation,
  guideRef,
  presentationStore,
  target,
  visibility,
}: {
  assistant: ReturnType<ScenePresentationStore["getSnapshot"]>["assistant"];
  beatId?: string;
  companionRef: { current: HTMLDivElement | null };
  generation: number;
  guideRef: { current: HTMLElement | null };
  presentationStore: ScenePresentationStore;
  target?: TargetGeometry;
  visibility: ScenePresentationVisibility;
}) {
  const [measurement, setMeasurement] = useState<{
    companionSize: { width: number; height: number };
    guideGeometry?: TargetGeometry;
    layoutKey: string | undefined;
  }>({ companionSize: { width: 112, height: 112 }, layoutKey: undefined });
  const targetHeight = target?.height;
  const targetLeft = target?.left;
  const targetTop = target?.top;
  const targetWidth = target?.width;
  const layoutKey = [
    generation,
    beatId ?? "idle",
    targetLeft ?? "none",
    targetTop ?? "none",
    targetWidth ?? "none",
    targetHeight ?? "none",
  ].join(":");

  useEffect(() => {
    if (visibility !== "visible") return;
    let settleFrame = 0;
    let animationFrame = 0;
    let followUpFrame = 0;
    const synchronize = () => {
      animationFrame = 0;
      const activePresentation = presentationStore.getSnapshot();
      if (
        activePresentation.generation !== generation ||
        activePresentation.beatId !== beatId ||
        activePresentation.visibility !== "visible"
      ) {
        return;
      }
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
      const obstructionElements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-scene-obstruction="true"]'),
      ).filter((element) => element.offsetWidth > 0 && element.offsetHeight > 0);
      const obstructions = obstructionElements.map((element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, top: value.top, width: value.width, height: value.height };
      });
      const viewport = window.visualViewport;
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
        viewport: {
          width: Math.min(window.innerWidth, viewport?.width ?? window.innerWidth),
          height: Math.min(window.innerHeight, viewport?.height ?? window.innerHeight),
        },
        assistantSize: companionSize,
        guideSize,
        obstructions,
      });
      presentationStore.patch((current) =>
        current.generation !== generation || current.beatId !== beatId
          ? current
          : positionsEqual(current.assistant.position, position)
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
              layoutKey: current.layoutKey,
            },
      );
      followUpFrame = window.requestAnimationFrame(() => {
        const active = presentationStore.getSnapshot();
        if (active.generation !== generation || active.beatId !== beatId) return;
        const value = guideRef.current?.getBoundingClientRect();
        if (!value) return;
        const guideGeometry = {
          left: value.left,
          top: value.top,
          width: value.width,
          height: value.height,
        };
        setMeasurement((current) =>
          measurementsEqual(current, current.companionSize, guideGeometry) &&
          current.layoutKey === layoutKey
            ? current
            : { ...current, guideGeometry, layoutKey },
        );
      });
    };
    const schedule = () => {
      if (settleFrame || animationFrame) return;
      setMeasurement((current) =>
        current.layoutKey === undefined
          ? current
          : { ...current, layoutKey: undefined },
      );
      settleFrame = window.requestAnimationFrame(() => {
        settleFrame = 0;
        animationFrame = window.requestAnimationFrame(synchronize);
      });
    };
    const observer = new ResizeObserver(schedule);
    if (companionRef.current) observer.observe(companionRef.current);
    if (guideRef.current) observer.observe(guideRef.current);
    document
      .querySelectorAll<HTMLElement>('[data-scene-obstruction="true"]')
      .forEach((element) => observer.observe(element));
    const mutationRoot = document.querySelector<HTMLElement>('[data-slot="app-shell"]');
    const mutationObserver = new MutationObserver((records) => {
      const obstructionChanged = records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some(
          (node) =>
            node instanceof HTMLElement &&
            (node.matches('[data-scene-obstruction="true"]') ||
              Boolean(node.querySelector('[data-scene-obstruction="true"]'))),
        ),
      );
      if (obstructionChanged) schedule();
    });
    if (mutationRoot) {
      mutationObserver.observe(mutationRoot, {
        childList: true,
        subtree: true,
      });
    }
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    schedule();
    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (settleFrame) window.cancelAnimationFrame(settleFrame);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (followUpFrame) window.cancelAnimationFrame(followUpFrame);
    };
  }, [
    assistant.placementId,
    beatId,
    companionRef,
    generation,
    guideRef,
    layoutKey,
    presentationStore,
    targetHeight,
    targetLeft,
    targetTop,
    targetWidth,
    visibility,
  ]);

  return { ...measurement, ready: measurement.layoutKey === layoutKey };
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
    left.companionOffsetTop === right.companionOffsetTop &&
    left.guideOffsetLeft === right.guideOffsetLeft &&
    left.guideOffsetTop === right.guideOffsetTop &&
    left.companionSuppressed === right.companionSuppressed &&
    left.guideSuppressed === right.guideSuppressed
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

function targetFragments(geometry: TargetGeometry): readonly TargetRectangle[] {
  return geometry.fragments?.length ? geometry.fragments : [geometry];
}

function targetStyle(geometry: TargetRectangle, padding: number) {
  return {
    left: geometry.left - padding,
    top: geometry.top - padding,
    width: geometry.width + padding * 2,
    height: geometry.height + padding * 2,
  };
}

function svgTargetRect(geometry: TargetRectangle, padding: number) {
  return {
    x: geometry.left - padding,
    y: geometry.top - padding,
    width: geometry.width + padding * 2,
    height: geometry.height + padding * 2,
  };
}
