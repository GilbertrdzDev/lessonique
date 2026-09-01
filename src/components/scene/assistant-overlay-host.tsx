"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

import type { ScenePresentationStore } from "@/core/scene";
import type { TargetGeometry } from "@/core/workspace/targeting";
import { cn } from "@/lib/utils";

export function AssistantOverlayHost({
  presentationStore,
}: Readonly<{ presentationStore: ScenePresentationStore }>) {
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
          facing={assistant.position.facing}
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
            paused={presentation.paused}
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
  decorative = false,
  facing,
  paused,
  stateId,
  status,
  visualState,
}: Readonly<{
  className?: string;
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
    case "assistant.success":
      return "success";
    case "assistant.warning":
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
  paused,
}: Readonly<{
  callout?: string;
  caption?: string;
  guide?: { title?: string; body: string; supportingItems?: string[] };
  hint?: string;
  paused: boolean;
}>) {
  return (
    <aside
      aria-label="Teaching guide"
      className="pointer-events-none w-[min(19rem,calc(100vw-9rem))] rounded-2xl border border-primary/25 bg-card/96 p-4 text-card-foreground shadow-floating backdrop-blur-md"
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
  facing,
  geometry,
}: Readonly<{
  companionLeft: number;
  companionTop: number;
  facing: "left" | "right";
  geometry: TargetGeometry;
}>) {
  const start = {
    x: companionLeft + (facing === "left" ? 17 : 95),
    y: companionTop + 62,
  };
  const end = {
    x: geometry.left + geometry.width / 2,
    y: geometry.top + geometry.height / 2,
  };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
  return (
    <div
      aria-hidden="true"
      className="absolute h-0.5 origin-left bg-gradient-to-r from-primary via-cyan-300 to-cyan-200 shadow-[0_0_10px_rgb(83_224_255_/_0.8)]"
      data-guidance-effect="point"
      style={{
        left: start.x,
        top: start.y,
        width: length,
        transform: `rotate(${angle}deg)`,
      }}
    >
      <span className="absolute -right-1 -top-1 size-2.5 rotate-45 border-r-2 border-t-2 border-cyan-200" />
    </div>
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
