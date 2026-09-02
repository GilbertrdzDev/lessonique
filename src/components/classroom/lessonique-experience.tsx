"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

import { AgentSidebar } from "@/components/classroom/agent-sidebar";
import {
  AppShell,
  ClassroomSkipLink,
} from "@/components/classroom/app-shell";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import { ExperienceHeader } from "@/components/classroom/experience-header";
import { ExperienceLobby } from "@/components/classroom/experience-lobby";
import {
  ConstructionPet,
  preloadConstructionPetSprite,
  type ConstructionPetStep,
} from "@/components/scene/construction-pet";
import {
  LessoniqueCompanion,
  useBoundedPointerDrag,
} from "@/components/scene/assistant-overlay-host";
import { useWebMCPRuntime } from "@/components/webmcp/webmcp-registration-provider";
import { ClassroomWorkspace } from "@/components/workspace/classroom-workspace";
import { useWorkspaceRuntime } from "@/components/workspace/workspace-runtime-provider";
import { LessonPersistence } from "@/core/lesson";
import type { GuideBuildStageId } from "@/core/guide-build";
import { WorkspacePersistence } from "@/core/workspace";
import {
  resolveLessoniqueExperienceState,
  type LessoniqueExperienceState,
} from "@/features/classroom/experience-state";
import { cn } from "@/lib/utils";

const CLASSROOM_TRANSITION_DURATION_MS = 850;

export function LessoniqueExperience() {
  const workspace = useWorkspaceRuntime();
  const webMCP = useWebMCPRuntime();
  const shouldReduceMotion = useReducedMotion();
  const lesson = useSyncExternalStore(
    workspace.lessonStore.subscribe,
    workspace.lessonStore.getSnapshot,
    workspace.lessonStore.getSnapshot,
  );
  const workspaceState = useSyncExternalStore(
    workspace.store.subscribe,
    workspace.store.getSnapshot,
    workspace.store.getSnapshot,
  );
  const presentation = useSyncExternalStore(
    workspace.scene.presentation.subscribe,
    workspace.scene.presentation.getSnapshot,
    workspace.scene.presentation.getSnapshot,
  );
  const scene = useSyncExternalStore(
    workspace.scene.store.subscribe,
    workspace.scene.store.getSnapshot,
    workspace.scene.store.getSnapshot,
  );
  const guideBuild = useSyncExternalStore(
    workspace.guideBuild.store.subscribe,
    workspace.guideBuild.store.getSnapshot,
    workspace.guideBuild.store.getSnapshot,
  );
  const hasSession = Boolean(lesson.lesson && workspaceState.profileId);
  const [classroomHasOpened, setClassroomHasOpened] = useState(false);

  useEffect(() => {
    const workspacePersistence = new WorkspacePersistence(window.localStorage);
    const lessonPersistence = new LessonPersistence(window.sessionStorage);
    let isCurrent = true;
    let unsubscribeWorkspace: (() => void) | undefined;
    let unsubscribeLesson: (() => void) | undefined;

    const persistWorkspace = () => {
      if (!workspacePersistence.save(workspace.store.getSnapshot())) {
        workspacePersistence.clear();
      }
    };
    const persistLesson = () => {
      if (!lessonPersistence.save(workspace.lessonStore.getSnapshot())) {
        lessonPersistence.clear();
      }
    };
    const restore = async () => {
      const currentWorkspace = workspace.store.getSnapshot();
      const currentLesson = workspace.lessonStore.getSnapshot();
      if (currentWorkspace.status === "idle" && currentLesson.status === "idle") {
        const storedWorkspace = workspacePersistence.load();
        const storedLesson = lessonPersistence.load();
        if (storedWorkspace && storedLesson) {
          try {
            await workspace.controller.restore(storedWorkspace);
            if (isCurrent) workspace.lessonStore.commit(storedLesson);
          } catch {
            workspacePersistence.clear();
            lessonPersistence.clear();
            await workspace.controller.clearEnvironment();
          }
        } else if (storedWorkspace || storedLesson) {
          workspacePersistence.clear();
          lessonPersistence.clear();
        }
      }
      if (!isCurrent) return;
      persistWorkspace();
      persistLesson();
      unsubscribeWorkspace = workspace.store.subscribe(persistWorkspace);
      unsubscribeLesson = workspace.lessonStore.subscribe(persistLesson);
    };

    void restore();
    return () => {
      isCurrent = false;
      unsubscribeWorkspace?.();
      unsubscribeLesson?.();
    };
  }, [workspace]);

  useEffect(() => {
    if (guideBuild.status === "building" || guideBuild.status === "error") {
      if (!hasSession) {
        const resetTimer = setTimeout(() => setClassroomHasOpened(false), 0);
        return () => clearTimeout(resetTimer);
      }
      return;
    }
    if (!hasSession) {
      const resetTimer = setTimeout(() => setClassroomHasOpened(false), 0);
      return () => clearTimeout(resetTimer);
    }
    if (classroomHasOpened) return;
    const timer = setTimeout(
      () => setClassroomHasOpened(true),
      shouldReduceMotion ? 0 : CLASSROOM_TRANSITION_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [
    classroomHasOpened,
    guideBuild.status,
    hasSession,
    shouldReduceMotion,
  ]);

  const classroomTransitionComplete = hasSession && classroomHasOpened;

  const experienceState = resolveLessoniqueExperienceState({
    agentConnection: webMCP.agentConnection.status,
    classroomTransitionComplete,
    guideBuildStatus: guideBuild.status,
    hasWorkspaceEnvironment: Boolean(workspaceState.profileId),
    lessonStatus: lesson.status,
    webMCPAvailability: webMCP.availability,
    workspaceStatus: workspaceState.status,
  });
  const sceneOwnsCompanion = presentation.assistant.visible;

  useEffect(() => {
    if (
      experienceState === "connected" ||
      experienceState === "building-guide"
    ) {
      preloadConstructionPetSprite();
    }
  }, [experienceState]);

  return (
    <div
      className="flex min-h-dvh flex-col overflow-x-hidden p-2 sm:p-2.5 2xl:h-dvh 2xl:overflow-y-hidden"
      data-experience-state={experienceState}
      data-slot="lessonique-experience"
    >
      {experienceState === "classroom" ? <ClassroomSkipLink /> : null}
      <ExperienceHeader experienceState={experienceState} />
      <PersistentCompanion
        buildStage={guideBuild.stage}
        buildStatus={guideBuild.status}
        canResumeGuide={workspace.scene.runner.canReplayLast()}
        experienceState={experienceState}
        hidden={sceneOwnsCompanion}
        onResumeGuide={() => workspace.scene.runner.replayLast()}
        resetKey={`${lesson.lesson?.id ?? "idle"}:${scene.revision}`}
      />
      <AnimatePresence initial={false} mode="wait">
        {experienceState === "classroom" ? (
          <motion.div
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
            className="flex min-h-0 flex-1 flex-col"
            data-slot="classroom-transition"
            initial={
              shouldReduceMotion
                ? false
                : { filter: "blur(4px)", opacity: 0, scale: 0.992 }
            }
            key="classroom"
            transition={{ duration: shouldReduceMotion ? 0 : 0.7 }}
          >
            <AppShell
              agent={<AgentSidebar />}
              className="mt-2 sm:mt-2.5"
              sessionInfo={<ClassroomHeader />}
              workspace={<ClassroomWorkspace />}
            />
          </motion.div>
        ) : (
          <ExperienceLobby
            build={guideBuild}
            key={experienceState}
            state={experienceState}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PersistentCompanion({
  buildStage,
  buildStatus,
  canResumeGuide,
  experienceState,
  hidden,
  onResumeGuide,
  resetKey,
}: Readonly<{
  buildStage?: GuideBuildStageId;
  buildStatus: "idle" | "building" | "completed" | "error";
  canResumeGuide: boolean;
  experienceState: LessoniqueExperienceState;
  hidden: boolean;
  onResumeGuide(): Promise<unknown>;
  resetKey: string;
}>) {
  const companionRef = useRef<HTMLDivElement>(null);
  const {
    bindings: dragBindings,
    dragging,
    offset,
    reset: resetDrag,
  } = useBoundedPointerDrag(companionRef, resetKey);
  const [resuming, setResuming] = useState(false);
  const interactive = experienceState === "classroom";
  const shouldReduceMotion = useReducedMotion();
  const constructionActive =
    experienceState === "building-guide" && buildStatus === "building";
  const completionTransitionActive =
    experienceState !== "classroom" && buildStatus === "completed";
  const assistantState =
    experienceState === "unsupported"
      ? "assistant.warning"
      : experienceState === "supported-disconnected"
        ? "assistant.thinking"
        : experienceState === "connected" ||
            experienceState === "starting-session"
          ? "assistant.success"
          : "assistant.idle";

  useEffect(() => {
    if (hidden) resetDrag();
  }, [hidden, resetDrag]);

  const resumeGuide = async () => {
    if (resuming) return;
    setResuming(true);
    resetDrag();
    try {
      await onResumeGuide();
    } finally {
      setResuming(false);
    }
  };

  return (
    <>
      <div
        {...(interactive ? dragBindings : {})}
        aria-hidden={hidden || undefined}
        aria-label={
          interactive
            ? "Move Lessonique companion"
            : `Lessonique AI companion, ${experienceState}`
        }
        className={cn(
          "experience-companion fixed z-20",
          interactive
            ? "experience-companion-interactive pointer-events-auto touch-none select-none cursor-grab"
            : "pointer-events-none",
          dragging && "experience-companion-dragging cursor-grabbing",
          hidden && "experience-companion-hidden pointer-events-none",
        )}
        data-companion-experience-state={experienceState}
        data-companion-renderer={
          constructionActive ? "construction-sprite" : "standard"
        }
        data-dragging={dragging}
        data-manual-offset-x={offset.x}
        data-manual-offset-y={offset.y}
        data-slot="persistent-companion"
        ref={companionRef}
        role={interactive ? "group" : "img"}
        style={
          {
            "--experience-companion-offset-x": `${offset.x}px`,
            "--experience-companion-offset-y": `${offset.y}px`,
          } as CSSProperties
        }
      >
        <div className="experience-companion-content" data-slot="persistent-companion-content">
          <span aria-hidden="true" className="experience-companion-orbit" />
          {constructionActive ? (
            <ConstructionPet
              builderStep={resolveBuilderStep(buildStage)}
              className="w-[16.5rem] sm:w-[21rem]"
              reducedMotion={Boolean(shouldReduceMotion)}
            />
          ) : completionTransitionActive ? null : (
            <LessoniqueCompanion
              className={
                experienceState === "classroom"
                  ? "size-36 sm:size-40"
                  : "size-48 sm:size-64"
              }
              decorative
              facing={experienceState === "classroom" ? "left" : "right"}
              paused={false}
              stateId={assistantState}
              status={experienceState}
              visualState={
                experienceState === "unsupported"
                  ? "incompatible"
                  : experienceState === "connected" ||
                      experienceState === "starting-session"
                    ? "connected"
                    : experienceState === "supported-disconnected" ||
                        experienceState === "guide-build-error"
                      ? "thinking"
                      : "idle"
              }
            />
          )}
          <span aria-hidden="true" className="experience-companion-particle particle-one" />
          <span aria-hidden="true" className="experience-companion-particle particle-two" />
          <span aria-hidden="true" className="experience-companion-particle particle-three" />
        </div>
      </div>
      {interactive && !hidden && canResumeGuide ? (
        <button
          aria-label="Resume guide"
          className="fixed bottom-4 left-4 z-30 rounded-full border border-primary/30 bg-card px-4 py-2 text-xs font-semibold text-primary shadow-floating transition-colors hover:bg-brand-soft disabled:cursor-wait disabled:opacity-60"
          disabled={resuming}
          onClick={() => void resumeGuide()}
          type="button"
        >
          {resuming ? "Resuming guide..." : "Resume guide"}
        </button>
      ) : null}
    </>
  );
}

function resolveBuilderStep(stage?: GuideBuildStageId): ConstructionPetStep {
  switch (stage) {
    case "preparing-lesson":
      return 2;
    case "setting-up-classroom":
      return 3;
    default:
      return 1;
  }
}
