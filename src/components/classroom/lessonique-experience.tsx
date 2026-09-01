"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { AgentSidebar } from "@/components/classroom/agent-sidebar";
import { AppShell } from "@/components/classroom/app-shell";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import { ExperienceHeader } from "@/components/classroom/experience-header";
import { ExperienceLobby } from "@/components/classroom/experience-lobby";
import { LessoniqueCompanion } from "@/components/scene/assistant-overlay-host";
import { useWebMCPRuntime } from "@/components/webmcp/webmcp-registration-provider";
import { ClassroomWorkspace } from "@/components/workspace/classroom-workspace";
import { useWorkspaceRuntime } from "@/components/workspace/workspace-runtime-provider";
import { LessonPersistence } from "@/core/lesson";
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
  }, [classroomHasOpened, hasSession, shouldReduceMotion]);

  const classroomTransitionComplete = hasSession && classroomHasOpened;

  const experienceState = resolveLessoniqueExperienceState({
    agentConnection: webMCP.agentConnection.status,
    classroomTransitionComplete,
    hasWorkspaceEnvironment: Boolean(workspaceState.profileId),
    lessonStatus: lesson.status,
    webMCPAvailability: webMCP.availability,
    workspaceStatus: workspaceState.status,
  });
  const sceneOwnsCompanion = presentation.assistant.visible;

  return (
    <div
      className="min-h-svh overflow-x-hidden p-2 sm:p-2.5"
      data-experience-state={experienceState}
      data-slot="lessonique-experience"
    >
      <ExperienceHeader experienceState={experienceState} />
      <PersistentCompanion
        experienceState={experienceState}
        hidden={sceneOwnsCompanion}
      />
      <AnimatePresence initial={false} mode="wait">
        {experienceState === "classroom" ? (
          <motion.div
            animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
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
          <ExperienceLobby key={experienceState} state={experienceState} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PersistentCompanion({
  experienceState,
  hidden,
}: Readonly<{
  experienceState: LessoniqueExperienceState;
  hidden: boolean;
}>) {
  const assistantState =
    experienceState === "unsupported"
      ? "assistant.warning"
      : experienceState === "supported-disconnected"
        ? "assistant.thinking"
        : experienceState === "connected" ||
            experienceState === "starting-session"
          ? "assistant.success"
          : "assistant.idle";

  return (
    <div
      aria-label={`Lessonique AI companion, ${experienceState}`}
      className={cn(
        "experience-companion pointer-events-none fixed z-20",
        hidden && "experience-companion-hidden",
      )}
      data-companion-experience-state={experienceState}
      role="img"
    >
      <span aria-hidden="true" className="experience-companion-orbit" />
      <LessoniqueCompanion
        className="size-36 sm:size-44"
        decorative
        facing={experienceState === "classroom" ? "left" : "right"}
        paused={false}
        stateId={assistantState}
        status={experienceState}
      />
      <span aria-hidden="true" className="experience-companion-particle particle-one" />
      <span aria-hidden="true" className="experience-companion-particle particle-two" />
      <span aria-hidden="true" className="experience-companion-particle particle-three" />
    </div>
  );
}
