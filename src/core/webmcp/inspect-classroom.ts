import type {
  CodeIntelligenceService,
  DiagnosticSnapshotStore,
  ValidationResultSnapshotStore,
} from "@/core/code-intelligence";
import type {
  ClassroomLifecycleService,
  LessonStateReader,
} from "@/core/lesson";
import { CapabilityCatalog } from "@/core/platform/capability-catalog";
import type { TargetRef } from "@/core/platform/contracts";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type { SceneStore } from "@/core/scene";
import type { WorkspaceStateReader } from "@/core/workspace";

import type {
  InspectClassroomInput,
  ToolExecutionResult,
} from "./contracts";
import type { ToolActivityLogger } from "./tool-activity-logger";
import { ToolInvocationError } from "./tool-invocation-service";

const DEFAULT_SECTIONS = [
  "lesson",
  "environment",
  "workspace",
  "runtime",
  "scene",
  "assistant",
  "interaction_targets",
] as const satisfies readonly NonNullable<
  InspectClassroomInput["include"]
>[number][];

export interface InspectClassroomDependencies {
  registries: ProviderPlatformRegistries;
  lesson: LessonStateReader;
  workspace: WorkspaceStateReader;
  lifecycle: ClassroomLifecycleService;
  intelligence: CodeIntelligenceService;
  diagnostics: DiagnosticSnapshotStore;
  validationResults: ValidationResultSnapshotStore;
  activity: ToolActivityLogger;
  scene?: SceneStore;
}

export class InspectClassroomService {
  readonly #dependencies: InspectClassroomDependencies;
  readonly #capabilities: CapabilityCatalog;

  constructor(dependencies: InspectClassroomDependencies) {
    this.#dependencies = dependencies;
    this.#capabilities = new CapabilityCatalog(dependencies.registries);
  }

  async execute(
    input: InspectClassroomInput,
    signal: AbortSignal,
  ): Promise<ToolExecutionResult<Record<string, unknown>>> {
    const lesson = this.#dependencies.lesson.getSnapshot();
    const workspace = this.#dependencies.workspace.getSnapshot();
    const sections = new Set(input.include ?? DEFAULT_SECTIONS);
    const maxActivity = input.maxActivity ?? 20;
    const data: Record<string, unknown> = {};

    if (sections.has("capabilities")) {
      data.capabilities = this.#capabilities.getCapabilities(
        workspace.profileId ? { profileId: workspace.profileId } : {},
      );
    }
    if (sections.has("lesson")) data.lesson = inspectLesson(lesson);
    if (sections.has("environment")) {
      data.environment = {
        profileId: workspace.profileId ?? null,
        runtimeProviderId: workspace.runtimeProviderId ?? null,
        languageIds: [...workspace.languageIds],
        activeFilePath: workspace.activeFilePath ?? null,
        activeSurfaceId: workspace.activeSurfaceId ?? null,
        surfaces: workspace.surfaces.map(({ id, visible, order, placementId, modeId }) => ({
          id,
          visible,
          order,
          placementId: placementId ?? null,
          modeId: modeId ?? null,
        })),
      };
    }
    if (sections.has("workspace")) {
      data.workspace = {
        status: workspace.status,
        environmentRevision: workspace.environmentRevision,
        files: workspace.files.map(({ path, languageId, content, visible, readOnly }) => ({
          path,
          languageId,
          bytes: new TextEncoder().encode(content).byteLength,
          visible,
          readOnly: readOnly ?? false,
        })),
      };
    }
    if (sections.has("file_contents")) {
      const requestedFiles = input.files ??
        (workspace.activeFilePath ? [workspace.activeFilePath] : []);
      data.fileContents = requestedFiles.map((path) => {
        const file = workspace.files.find((candidate) => candidate.path === path);
        if (!file) {
          throw new ToolInvocationError({
            code: "workspace_file_not_found",
            message: `Workspace file "${path}" does not exist.`,
            recoverable: true,
            supportedAlternatives: workspace.files.map((candidate) => candidate.path),
          });
        }
        return { path: file.path, languageId: file.languageId, content: file.content };
      });
    }
    if (sections.has("diagnostics")) {
      data.diagnostics = filterByFiles(
        this.#dependencies.diagnostics.list(),
        input.files,
        ({ filePath }) => filePath,
      );
    }
    if (sections.has("anchors")) {
      data.anchors = input.anchorQuery
        ? await this.#inspectAnchors(input, workspace.environmentRevision, signal)
        : [];
    }
    if (sections.has("validation")) {
      data.validation = this.#dependencies.validationResults.list().map((result) => ({
        conditionId: result.conditionId,
        validatorId: result.validatorId,
        status: result.status,
        evidence: structuredClone(result.evidence),
        diagnosticIds: result.diagnostics.map(({ id }) => id),
        evaluatedAt: result.evaluatedAt,
      }));
    }
    if (sections.has("runtime")) {
      data.runtime = {
        status: workspace.runtime.status,
        providerId: workspace.runtime.providerId ?? null,
        revision: workspace.runtime.revision,
        errorMessage: workspace.runtime.errorMessage ?? null,
        consoleEntries: workspace.consoleEntries.slice(-maxActivity).map(
          ({ id, kind, message, occurredAt }) => ({ id, kind, message, occurredAt }),
        ),
      };
    }
    if (sections.has("scene")) {
      const lifecycle = this.#dependencies.lifecycle.getSnapshot();
      const scene = this.#dependencies.scene?.getSnapshot();
      data.scene = {
        status: scene?.status ?? (lifecycle.counts.scene > 0 ? "active" : "idle"),
        activeSceneId: scene?.id ?? null,
        activeBeatId: scene?.activeBeatId ?? null,
        activeTarget: scene?.target ? structuredClone(scene.target) : null,
        activeWait:
          (scene?.wait ? structuredClone(scene.wait) : undefined) ??
          lesson.waits.find(({ status }) => status === "pending")?.id ??
          null,
        error: scene?.error ? structuredClone(scene.error) : null,
        resources: {
          scenes: lifecycle.counts.scene,
          waits: lifecycle.counts.wait,
          overlays: lifecycle.counts.overlay,
        },
      };
    }
    if (sections.has("assistant")) {
      const sceneSnapshot = this.#dependencies.scene?.getSnapshot();
      const sceneAssistant =
        sceneSnapshot?.status !== "idle" ? sceneSnapshot?.assistant : undefined;
      data.assistant = {
        status: sceneAssistant?.status ?? lesson.agent.status,
        stateId:
          sceneAssistant?.stateId ?? lesson.agent.assistantIntent?.stateId ?? null,
        sceneId: sceneAssistant?.sceneId ?? null,
        beatId: sceneAssistant?.beatId ?? null,
        lessonStepId: lesson.agent.assistantIntent?.lessonStepId ?? null,
        visible:
          sceneAssistant?.visible ?? Boolean(lesson.agent.assistantIntent),
      };
    }
    if (sections.has("interaction_targets")) {
      data.interactionTargets = workspace.interactionEvents
        .slice(-maxActivity)
        .map(({ id, typeId, targetRef, surfaceId, lessonStepId, occurredAt, outcome }) => ({
          id,
          typeId,
          target: targetRef ? structuredClone(targetRef) : null,
          surfaceId: surfaceId ?? null,
          lessonStepId: lessonStepId ?? null,
          occurredAt,
          outcome: outcome ?? null,
        }));
    }
    if (sections.has("activity")) {
      data.activity = {
        lesson: lesson.activity.slice(-maxActivity).map(
          ({ id, typeId, source, occurredAt, lessonStepId, outcome, summary }) => ({
            id,
            typeId,
            source,
            occurredAt,
            lessonStepId: lessonStepId ?? null,
            outcome: outcome ?? null,
            summary: summary ?? null,
          }),
        ),
        tools: this.#dependencies.activity.getSnapshot().slice(-maxActivity),
      };
    }

    return {
      ok: true,
      status: "completed",
      revision: Math.max(lesson.revision, workspace.environmentRevision),
      data,
    };
  }

  async #inspectAnchors(
    input: InspectClassroomInput,
    environmentRevision: number,
    signal: AbortSignal,
  ): Promise<unknown> {
    const query = input.anchorQuery!;
    const locator = this.#dependencies.registries.locators.get(query.resolverId);
    if (locator) {
      const workspace = this.#dependencies.workspace.getSnapshot();
      const requestedPath = query.input.filePath;
      const filePath =
        typeof requestedPath === "string"
          ? requestedPath
          : input.files?.[0] ?? workspace.activeFilePath;
      const file = workspace.files.find(({ path }) => path === filePath);
      if (!file) {
        throw new ToolInvocationError({
          code: "anchor_source_not_found",
          message: "A registered source locator requires an available workspace file.",
          recoverable: true,
          supportedAlternatives: workspace.files.map(({ path }) => path),
        });
      }
      const locatorInput = Object.fromEntries(
        Object.entries(query.input).filter(([key]) => key !== "filePath"),
      );
      const result = await this.#dependencies.intelligence.query(
        {
          document: {
            path: file.path,
            languageId: file.languageId,
            content: file.content,
            revision: environmentRevision,
          },
          locator: { locatorId: locator.id, input: locatorInput },
        },
        signal,
      );
      return result.anchors.map((anchor) => ({
        id: anchor.id,
        languageId: anchor.languageProviderId,
        locatorId: anchor.locatorId,
        filePath: anchor.filePath,
        queryIntent: anchor.queryIntent,
        sourceRevision: anchor.sourceRevision,
        targets: result.targets
          .filter(({ anchorId }) => anchorId === anchor.id)
          .map(({ representation, target }) => ({
            representation,
            target: structuredClone(target),
          })),
      }));
    }

    const target: TargetRef = {
      resolverId: query.resolverId,
      input: structuredClone(query.input),
    };
    try {
      this.#dependencies.registries.targetResolvers.validateReference(target);
    } catch {
      throw new ToolInvocationError({
        code: "unsupported_anchor_query",
        message: `Anchor query resolver "${query.resolverId}" is not available.`,
        recoverable: true,
        supportedAlternatives: [
          ...this.#dependencies.registries.locators.list().map(({ id }) => id),
          ...this.#dependencies.registries.targetResolvers.list().map(({ id }) => id),
        ],
      });
    }
    return [{ resolverId: target.resolverId, target, registered: true }];
  }
}

function inspectLesson(lesson: ReturnType<LessonStateReader["getSnapshot"]>) {
  return {
    id: lesson.lesson?.id ?? null,
    title: lesson.lesson?.title ?? null,
    objective: lesson.lesson?.objective ?? null,
    status: lesson.status,
    revision: lesson.revision,
    activeStepId: lesson.plan.activeStepId ?? null,
    progress: { ...lesson.progress },
    steps: lesson.plan.steps.map(
      ({ id, title, status, attempts, revealedHintCount, criteria }) => ({
        id,
        title,
        status,
        attemptCount: attempts.length,
        revealedHintCount,
        criterionIds: criteria.map((criterion) => criterion.id),
      }),
    ),
    waits: lesson.waits.map(({ id, status, startedAt, timeoutAt, resolvedAt }) => ({
      id,
      status,
      startedAt,
      timeoutAt: timeoutAt ?? null,
      resolvedAt: resolvedAt ?? null,
    })),
  };
}

function filterByFiles<T>(
  values: readonly T[],
  files: readonly string[] | undefined,
  selectPath: (value: T) => string,
): T[] {
  return values
    .filter((value) => !files || files.includes(selectPath(value)))
    .map((value) => structuredClone(value));
}
