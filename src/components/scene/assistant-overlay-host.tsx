"use client";

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
          assistantLeft={assistant.position.left}
          assistantTop={assistant.position.top}
          geometry={target}
        />
      ) : null}

      <div
        className={cn(
          "absolute flex items-center gap-3 transition-transform duration-300 ease-out motion-reduce:transition-none",
          assistant.position.docked && "items-end",
        )}
        data-assistant-docked={assistant.position.docked}
        style={{
          transform: `translate3d(${assistant.position.left}px, ${assistant.position.top}px, 0)`,
        }}
      >
        {assistant.visible ? (
          <LessoniqueCompanion
            paused={presentation.paused}
            stateId={assistant.stateId}
            status={assistant.status}
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

function LessoniqueCompanion({
  paused,
  stateId,
  status,
}: Readonly<{
  paused: boolean;
  stateId: string;
  status: string;
}>) {
  const stateLabel = stateId.replace("assistant.", "");
  return (
    <div
      aria-live="polite"
      aria-label={`Lessonique companion: ${stateLabel}${paused ? ", paused" : ""}`}
      className="lessonique-companion relative size-28 shrink-0"
      data-assistant-state={stateId}
      data-assistant-status={status}
      role="status"
    >
      <svg
        aria-hidden="true"
        className="size-full overflow-visible drop-shadow-[0_14px_22px_rgb(92_70_210_/_0.3)]"
        viewBox="0 0 120 132"
      >
        <defs>
          <linearGradient id="companion-shell" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.58" stopColor="#eeeaff" />
            <stop offset="1" stopColor="#b9adff" />
          </linearGradient>
          <linearGradient id="companion-face" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#2d285c" />
            <stop offset="1" stopColor="#11172f" />
          </linearGradient>
          <linearGradient id="companion-leaf" x1="0" x2="1">
            <stop stopColor="#7c4dff" />
            <stop offset="1" stopColor="#c778ff" />
          </linearGradient>
        </defs>
        <ellipse className="companion-shadow" cx="60" cy="124" fill="#7664f4" opacity=".2" rx="33" ry="5" />
        <g className="companion-body">
          <ellipse cx="60" cy="76" fill="url(#companion-shell)" rx="43" ry="39" stroke="#ffffff" strokeWidth="2" />
          <path d="M18 67c-12 7-14 22-4 30 8 6 14-4 18-13" fill="url(#companion-shell)" stroke="#c9c0ff" strokeWidth="2" />
          <path className="companion-arm companion-arm-point" d="M102 67c12 7 14 22 4 30-8 6-14-4-18-13" fill="url(#companion-shell)" stroke="#c9c0ff" strokeWidth="2" />
          <rect x="25" y="43" width="70" height="55" rx="28" fill="url(#companion-face)" stroke="#8f7cf6" strokeWidth="2" />
          <ellipse className="companion-eye companion-eye-left" cx="46" cy="68" fill="#78f1ff" rx="5" ry="10" />
          <ellipse className="companion-eye companion-eye-right" cx="74" cy="68" fill="#78f1ff" rx="5" ry="10" />
          <path className="companion-mouth" d="M53 82q7 8 14 0" fill="none" stroke="#9befff" strokeLinecap="round" strokeWidth="3" />
          <circle cx="60" cy="105" fill="#7c5cff" r="10" stroke="#bdf7ff" strokeWidth="2" />
          <path d="m55 105 4-4 2 4 5-1-4 7-2-4z" fill="#d9fbff" />
          <path d="M57 39c-8-13-3-22 7-25 5 9 2 18-7 25Z" fill="url(#companion-leaf)" />
          <path d="M63 39c1-12 9-18 18-14-1 10-7 15-18 14Z" fill="#8f78ff" />
        </g>
        <g className="companion-rings" fill="none" stroke="#8ceeff" strokeWidth="2">
          <ellipse cx="60" cy="118" rx="25" ry="5" opacity=".7" />
          <ellipse cx="60" cy="126" rx="17" ry="3" opacity=".4" />
        </g>
      </svg>
    </div>
  );
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
  assistantLeft,
  assistantTop,
  geometry,
}: Readonly<{
  assistantLeft: number;
  assistantTop: number;
  geometry: TargetGeometry;
}>) {
  const start = { x: assistantLeft + 86, y: assistantTop + 62 };
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
