"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  calculatePointerPath,
  createRoundedConnectorPath,
  PlacementEngine,
  type SceneControlAction,
  type ScenePresentationVisibility,
  type ScenePresentationStore,
} from "@/core/scene";
import type {
  TargetGeometry,
  TargetRectangle,
} from "@/core/workspace/targeting";
import { InlineCodeText } from "@/components/ui/inline-code-text";
import { cn } from "@/lib/utils";

const subscribeToPortalHost = () => () => undefined;
const getPortalHost = (): HTMLElement | null => document.body;
const getServerPortalHost = (): HTMLElement | null => null;
const DRAG_VIEWPORT_MARGIN = 12;

type DragOffset = Readonly<{ x: number; y: number }>;
type PointerDragBindings = Readonly<{
  onLostPointerCapture(event: ReactPointerEvent<HTMLElement>): void;
  onPointerCancel(event: ReactPointerEvent<HTMLElement>): void;
  onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLElement>): void;
}>;

export function useBoundedPointerDrag(
  elementRef: RefObject<HTMLElement | null>,
  resetKey: string | number,
  ignoreInteractiveChildren = false,
) {
  const [dragState, setDragState] = useState<{
    dragging: boolean;
    offset: DragOffset;
    resetKey: string | number;
  }>({ dragging: false, offset: { x: 0, y: 0 }, resetKey });
  const offset =
    dragState.resetKey === resetKey ? dragState.offset : { x: 0, y: 0 };
  const dragging =
    dragState.resetKey === resetKey ? dragState.dragging : false;
  const sessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffset: DragOffset;
    startRect: DOMRect;
  } | null>(null);

  const reset = useCallback(() => {
    sessionRef.current = null;
    setDragState({ dragging: false, offset: { x: 0, y: 0 }, resetKey });
  }, [resetKey]);

  const updateOffset = useCallback(
    (update: DragOffset | ((current: DragOffset) => DragOffset)) => {
      setDragState((current) => {
        const currentOffset =
          current.resetKey === resetKey ? current.offset : { x: 0, y: 0 };
        return {
          dragging: current.resetKey === resetKey ? current.dragging : false,
          offset:
            typeof update === "function" ? update(currentOffset) : update,
          resetKey,
        };
      });
    },
    [resetKey],
  );

  const updateDragging = useCallback(
    (nextDragging: boolean) => {
      setDragState((current) => ({
        dragging: nextDragging,
        offset: current.resetKey === resetKey ? current.offset : { x: 0, y: 0 },
        resetKey,
      }));
    },
    [resetKey],
  );

  useEffect(() => {
    const keepInsideViewport = () => {
      if (!dragging && offset.x === 0 && offset.y === 0) return;
      const element = elementRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const bounds = dragViewportBounds();
      const correctionX =
        rect.left < bounds.left
          ? bounds.left - rect.left
          : rect.right > bounds.right
            ? bounds.right - rect.right
            : 0;
      const correctionY =
        rect.top < bounds.top
          ? bounds.top - rect.top
          : rect.bottom > bounds.bottom
            ? bounds.bottom - rect.bottom
            : 0;
      if (correctionX || correctionY) {
        updateOffset((current) => ({
          x: current.x + correctionX,
          y: current.y + correctionY,
        }));
      }
    };
    window.addEventListener("resize", keepInsideViewport);
    window.visualViewport?.addEventListener("resize", keepInsideViewport);
    return () => {
      window.removeEventListener("resize", keepInsideViewport);
      window.visualViewport?.removeEventListener("resize", keepInsideViewport);
    };
  }, [dragging, elementRef, offset.x, offset.y, updateOffset]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if (
      ignoreInteractiveChildren &&
      event.target instanceof Element &&
      event.target.closest("button, a, input, select, textarea, [role='button']")
    ) {
      return;
    }
    const element = elementRef.current;
    if (!element) return;
    event.preventDefault();
    sessionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffset: offset,
      startRect: element.getBoundingClientRect(),
    };
    updateDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    const bounds = dragViewportBounds();
    const deltaX = event.clientX - session.startClientX;
    const deltaY = event.clientY - session.startClientY;
    const minimumX =
      session.startOffset.x + bounds.left - session.startRect.left;
    const maximumX =
      session.startOffset.x + bounds.right - session.startRect.right;
    const minimumY =
      session.startOffset.y + bounds.top - session.startRect.top;
    const maximumY =
      session.startOffset.y + bounds.bottom - session.startRect.bottom;
    updateOffset({
      x: clamp(session.startOffset.x + deltaX, minimumX, maximumX),
      y: clamp(session.startOffset.y + deltaY, minimumY, maximumY),
    });
  };

  const finish = (event: ReactPointerEvent<HTMLElement>) => {
    if (sessionRef.current?.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    updateDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const bindings: PointerDragBindings = {
    onLostPointerCapture: finish,
    onPointerCancel: finish,
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
  };
  return { bindings, dragging, offset, reset };
}

function dragViewportBounds() {
  const viewport = window.visualViewport;
  const left = (viewport?.offsetLeft ?? 0) + DRAG_VIEWPORT_MARGIN;
  const top = (viewport?.offsetTop ?? 0) + DRAG_VIEWPORT_MARGIN;
  return {
    left,
    top,
    right:
      (viewport?.offsetLeft ?? 0) +
      (viewport?.width ?? window.innerWidth) -
      DRAG_VIEWPORT_MARGIN,
    bottom:
      (viewport?.offsetTop ?? 0) +
      (viewport?.height ?? window.innerHeight) -
      DRAG_VIEWPORT_MARGIN,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function AssistantOverlayHost({
  onControl,
  onReturnToStep,
  onValidateExercise,
  presentationStore,
}: Readonly<{
  onControl?: (action: Extract<SceneControlAction, "next" | "previous">) => Promise<unknown>;
  onReturnToStep?: () => Promise<unknown>;
  onValidateExercise?: () => Promise<unknown>;
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
  const companionDragRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLElement>(null);
  const guideDragRef = useRef<HTMLDivElement>(null);
  const companionDrag = useBoundedPointerDrag(
    companionDragRef,
    presentation.generation,
  );
  const guideDrag = useBoundedPointerDrag(
    guideDragRef,
    presentation.generation,
    true,
  );
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
  const connectorGuideGeometry = offsetGeometry(
    measured.guideGeometry,
    guideDrag.offset,
  );
  const companionVisualState = resolveSceneCompanionVisualState(
    assistant.stateId,
    effectIds,
  );

  const hideGuide = useCallback(() => {
    companionDrag.reset();
    guideDrag.reset();
    presentationStore.patch((current) => ({
      ...current,
      visibility: "hidden-by-user",
    }));
  }, [companionDrag, guideDrag, presentationStore]);

  useEffect(() => {
    if (!presentation.sceneId || visibility === "hidden-by-user") return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      hideGuide();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [hideGuide, presentation.sceneId, visibility]);

  const resumeGuide = async () => {
    companionDrag.reset();
    guideDrag.reset();
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
    <div
      aria-label="Lessonique hidden guidance"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      data-guidance-generation={presentation.generation}
      data-guidance-visibility="hidden-by-user"
    >
      {assistant.visible && !assistant.position.companionSuppressed ? (
        <div
          {...companionDrag.bindings}
          aria-label="Move Lessonique companion"
          className={cn(
            "pointer-events-auto fixed left-0 top-0 touch-none select-none cursor-grab transition-[filter] hover:drop-shadow-[0_10px_16px_rgb(64_45_140_/_0.22)]",
            companionDrag.dragging &&
              "cursor-grabbing drop-shadow-[0_14px_18px_rgb(64_45_140_/_0.3)]",
          )}
          data-dragging={companionDrag.dragging}
          data-manual-offset-x={companionDrag.offset.x}
          data-manual-offset-y={companionDrag.offset.y}
          data-slot="draggable-companion"
          ref={companionDragRef}
          role="group"
          style={{
            transform: `translate3d(${assistant.position.left + assistant.position.companionOffsetLeft + companionDrag.offset.x}px, ${assistant.position.top + assistant.position.companionOffsetTop + companionDrag.offset.y}px, 0)`,
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
      <button
        aria-label="Resume guide"
        className="pointer-events-auto fixed bottom-4 left-4 rounded-full border border-primary/30 bg-card px-4 py-2 text-xs font-semibold text-primary shadow-floating transition-colors hover:bg-brand-soft"
        onClick={() => void resumeGuide()}
        type="button"
      >
        Resume guide
      </button>
    </div>
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
        <TargetHighlight
          geometry={target}
          spotlightActive={effectIds.has("effect.spotlight")}
        />
      ) : null}
      {visibility === "visible" && target &&
      (effectIds.has("effect.point") || effectIds.has("effect.pointer")) &&
      measured.ready &&
      connectorGuideGeometry &&
      !assistant.position.guideSuppressed ? (
        <TargetPointer
          guideGeometry={connectorGuideGeometry}
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
              {...companionDrag.bindings}
              aria-label="Move Lessonique companion"
              className={cn(
                "lessonique-companion-presentation pointer-events-auto absolute touch-none select-none cursor-grab transition-[filter] hover:drop-shadow-[0_10px_16px_rgb(64_45_140_/_0.22)]",
                companionDrag.dragging &&
                  "cursor-grabbing drop-shadow-[0_14px_18px_rgb(64_45_140_/_0.3)]",
              )}
              data-assistant-docked={assistant.position.docked}
              data-assistant-facing={assistant.position.facing}
              data-assistant-side={assistant.position.side}
              data-dragging={companionDrag.dragging}
              data-manual-offset-x={companionDrag.offset.x}
              data-manual-offset-y={companionDrag.offset.y}
              data-slot="draggable-companion"
              ref={companionDragRef}
              role="group"
              style={{
                transform: `translate3d(${assistant.position.left + assistant.position.companionOffsetLeft + companionDrag.offset.x}px, ${assistant.position.top + assistant.position.companionOffsetTop + companionDrag.offset.y}px, 0)`,
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
              data-dragging={guideDrag.dragging}
              data-manual-offset-x={guideDrag.offset.x}
              data-manual-offset-y={guideDrag.offset.y}
              data-slot="draggable-guide"
              ref={guideDragRef}
              style={{
                transform: `translate3d(${assistant.position.left + assistant.position.guideOffsetLeft + guideDrag.offset.x}px, ${assistant.position.top + assistant.position.guideOffsetTop + guideDrag.offset.y}px, 0)`,
                transition: "none",
                visibility: measured.ready ? "visible" : "hidden",
              }}
            >
              <VisualGuideCard
                callout={calloutText}
                caption={presentation.caption}
                guide={presentation.guide}
                hint={presentation.hint}
                dragBindings={guideDrag.bindings}
                dragging={guideDrag.dragging}
                navigation={presentation.navigation}
                onControl={onControl}
                onHide={hideGuide}
                onValidateExercise={onValidateExercise}
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
        resolvedVisualState === "incompatible"
          ? "incompatible"
            : "normal"
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
  dragBindings,
  dragging,
  navigation,
  onControl,
  onHide,
  onValidateExercise,
  paused,
  phase,
  ref,
}: Readonly<{
  callout?: string;
  caption?: string;
  guide?: { title?: string; body: string; supportingItems?: string[] };
  hint?: string;
  dragBindings: PointerDragBindings;
  dragging: boolean;
  navigation: {
    enabled: boolean;
    current: number;
    total: number;
    canGoPrevious: boolean;
    canGoNext: boolean;
    nextBlocked: boolean;
    transitioning: boolean;
    exerciseValidation?: {
      status: "idle" | "validating" | "passed" | "failed" | "error";
      message?: string;
    };
  };
  onControl?: (action: "next" | "previous") => Promise<unknown>;
  onHide(): void;
  onValidateExercise?: () => Promise<unknown>;
  paused: boolean;
  phase: "teaching" | "interaction" | "validating" | "feedback" | "completed";
}> & { ref?: Ref<HTMLElement> }) {
  const [navigating, setNavigating] = useState(false);
  const [validating, setValidating] = useState(false);
  const navigate = async (action: "next" | "previous") => {
    if (!onControl || navigating || navigation.transitioning) return;
    setNavigating(true);
    try {
      await onControl(action);
    } finally {
      setNavigating(false);
    }
  };
  const validateExercise = async () => {
    if (!onValidateExercise || validating || navigation.transitioning) return;
    setValidating(true);
    try {
      await onValidateExercise();
    } finally {
      setValidating(false);
    }
  };
  return (
    <aside
      ref={ref}
      aria-label="Teaching guide"
      className={cn(
        "max-h-[calc(100dvh-2rem)] w-[min(18rem,calc(100vw-9rem))] overflow-y-auto rounded-2xl border border-primary/25 bg-card/96 text-card-foreground shadow-floating backdrop-blur-md",
        "pointer-events-auto",
        dragging && "ring-1 ring-primary/30 shadow-2xl",
        phase === "interaction" ? "max-w-72 p-3" : "p-4",
      )}
      data-dragging={dragging}
      data-scene-phase={phase}
      data-slot="visual-guide"
    >
      <div
        {...dragBindings}
        aria-label="Move guide panel"
        className={cn(
          "-m-1 mb-1 flex touch-none select-none items-center justify-between gap-3 rounded-lg p-1 transition-colors hover:bg-muted/45",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        role="group"
      >
        <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-primary">
          Lessonique guide
        </p>
        <div className="flex items-center gap-1">
          {paused ? (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.62rem] font-semibold text-warning">
              Paused
            </span>
          ) : null}
          <button
            aria-label="Hide guide"
            className="rounded-md px-2 py-1 text-[0.65rem] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45"
            onClick={onHide}
            type="button"
          >
            Hide
          </button>
        </div>
      </div>
      {guide?.title ? (
        <h2 className="text-sm font-bold">
          <InlineCodeText dataSlot="guide-inline-code" text={guide.title} />
        </h2>
      ) : null}
      {guide ? (
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          <InlineCodeText dataSlot="guide-inline-code" text={guide.body} />
        </p>
      ) : null}
      {guide?.supportingItems?.length ? (
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[0.7rem] text-muted-foreground">
          {guide.supportingItems.map((item, index) => (
            <li key={`${index}-${item}`}>
              <InlineCodeText dataSlot="guide-inline-code" text={item} />
            </li>
          ))}
        </ol>
      ) : null}
      {callout ? (
        <p className="mt-3 rounded-xl border border-primary/20 bg-brand-soft/70 px-3 py-2 text-[0.72rem] font-medium leading-relaxed text-foreground">
          <InlineCodeText dataSlot="guide-inline-code" text={callout} />
        </p>
      ) : null}
      {hint ? (
        <p className="mt-3 rounded-xl bg-warning/12 px-3 py-2 text-[0.7rem] leading-relaxed text-foreground">
          <span className="font-bold">Hint:</span>{" "}
          <InlineCodeText dataSlot="guide-inline-code" text={hint} />
        </p>
      ) : null}
      {caption ? (
        <p className="mt-3 border-t pt-2 text-[0.68rem] font-medium text-foreground">
          <InlineCodeText dataSlot="guide-inline-code" text={caption} />
        </p>
      ) : null}
      {navigation.exerciseValidation ? (
        <div
          className="mt-3 space-y-2 border-t pt-3"
          data-slot="exercise-validation"
        >
          <button
            className="w-full rounded-lg border border-primary/35 bg-brand-soft/70 px-3 py-2 text-[0.72rem] font-semibold text-primary transition-colors hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              !onValidateExercise ||
              validating ||
              navigation.exerciseValidation.status === "validating" ||
              navigation.transitioning
            }
            onClick={() => void validateExercise()}
            type="button"
          >
            {validating || navigation.exerciseValidation.status === "validating"
              ? "Validating..."
              : "Validate Exercise"}
          </button>
          {navigation.exerciseValidation.message ? (
            <p
              aria-live="polite"
              className={cn(
                "text-[0.68rem] font-medium",
                navigation.exerciseValidation.status === "passed"
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-muted-foreground",
              )}
              role="status"
            >
              {navigation.exerciseValidation.message}
            </p>
          ) : null}
        </div>
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
            {navigation.current === navigation.total ? "Finish" : "Next"}
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function TargetSpotlight({ geometry }: Readonly<{ geometry: TargetGeometry }>) {
  const maskId = `lessonique-spotlight-${useId().replaceAll(":", "")}`;
  const block = continuousTargetBlock(geometry);
  const fragmentCount = targetFragments(geometry).length;
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 size-full"
      data-guidance-fragment-count={fragmentCount}
      data-guidance-effect="spotlight"
      data-guidance-spotlight-outline="none"
      data-guidance-shape="continuous"
    >
      <defs>
        <mask id={maskId}>
          <rect fill="white" height="100%" width="100%" />
          <rect fill="black" rx="6" {...svgTargetRect(block, 6)} />
        </mask>
      </defs>
      <rect fill="rgb(18 16 38 / 0.46)" height="100%" mask={`url(#${maskId})`} width="100%" />
    </svg>
  );
}

function TargetFocus({ geometry }: Readonly<{ geometry: TargetGeometry }>) {
  const block = continuousTargetBlock(geometry);
  return (
    <div
      aria-hidden="true"
      className="absolute rounded-lg border-2 border-cyan-300 shadow-[0_0_0_4px_rgb(124_92_255_/_0.22),0_0_24px_rgb(83_224_255_/_0.45)]"
      data-guidance-effect="focus"
      data-guidance-fragment-count={targetFragments(geometry).length}
      data-guidance-shape="continuous"
      style={targetStyle(block, 4)}
    />
  );
}

function TargetHighlight({
  geometry,
  spotlightActive,
}: Readonly<{ geometry: TargetGeometry; spotlightActive: boolean }>) {
  const block = continuousTargetBlock(geometry);
  const padding = spotlightActive ? 0 : 4;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute rounded-md",
        spotlightActive
          ? "border-0 bg-transparent shadow-none"
          : "border-2 border-primary/85 bg-primary/10 shadow-[0_0_0_1px_rgb(255_255_255_/_0.72),0_0_14px_rgb(124_92_255_/_0.42)]",
      )}
      data-guidance-effect="highlight"
      data-guidance-fragment-count={targetFragments(geometry).length}
      data-guidance-highlight-appearance={
        spotlightActive ? "spotlight" : "standalone"
      }
      data-guidance-highlight-padding={padding}
      data-guidance-shape="continuous"
      style={targetStyle(block, padding)}
    />
  );
}

function TargetPointer({
  guideGeometry,
  geometry,
}: Readonly<{
  guideGeometry: TargetGeometry;
  geometry: TargetGeometry;
}>) {
  const points = calculatePointerPath({
    guide: guideGeometry,
    target: geometry,
  });
  const serializedPoints = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const connectorPath = createRoundedConnectorPath(points);
  const targetPoint = points[0]!;
  const guidePoint = points.at(-1)!;
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 size-full overflow-visible"
      data-connector-guide={`${guidePoint.x},${guidePoint.y}`}
      data-connector-target={`${targetPoint.x},${targetPoint.y}`}
      data-guidance-effect="point"
      data-guidance-presentation="guide-connector"
      data-pointer-end={`${guidePoint.x},${guidePoint.y}`}
      data-pointer-start={`${targetPoint.x},${targetPoint.y}`}
    >
      <path
        d={connectorPath}
        data-guidance-connector-line="true"
        data-guidance-connector-points={serializedPoints}
        fill="none"
        stroke="rgb(102 61 244 / 0.98)"
        strokeDasharray="2 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.75"
        style={{ filter: "drop-shadow(0 0 3px rgb(111 76 255 / 0.52))" }}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={targetPoint.x}
        cy={targetPoint.y}
        data-guidance-connector-endpoint-halo="target"
        fill="rgb(111 76 255 / 0.2)"
        r="7"
      />
      <circle
        cx={targetPoint.x}
        cy={targetPoint.y}
        data-guidance-connector-endpoint="target"
        fill="rgb(102 61 244)"
        r="4.25"
        stroke="rgb(255 255 255 / 0.96)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
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

function continuousTargetBlock(geometry: TargetGeometry): TargetRectangle {
  const fragments = targetFragments(geometry);
  const left = Math.min(...fragments.map((fragment) => fragment.left));
  const top = Math.min(...fragments.map((fragment) => fragment.top));
  const right = Math.max(
    ...fragments.map((fragment) => fragment.left + fragment.width),
  );
  const bottom = Math.max(
    ...fragments.map((fragment) => fragment.top + fragment.height),
  );
  return { left, top, width: right - left, height: bottom - top };
}

function offsetGeometry(
  geometry: TargetGeometry | undefined,
  offset: DragOffset,
): TargetGeometry | undefined {
  return geometry
    ? {
        ...geometry,
        left: geometry.left + offset.x,
        top: geometry.top + offset.y,
      }
    : undefined;
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
