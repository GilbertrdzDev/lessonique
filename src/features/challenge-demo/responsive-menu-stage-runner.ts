import type {
  TargetRefInput,
  ToolResult,
} from "@/core/webmcp";
import { targetRefSchema } from "@/core/webmcp";
import type { ToolRegistry } from "@/core/webmcp/tool-registry";
import type { WebMCPToolName } from "@/core/webmcp/tool-names";

import {
  createResponsiveMenuLessonFixture,
  RESPONSIVE_MENU_DEMO_IDS,
  RESPONSIVE_MENU_TARGET_CATALOG,
  type ResponsiveMenuDemoTopicId,
  type ResponsiveMenuTargetCatalogEntry,
} from "./responsive-menu-fixture";
import {
  createResponsiveMenuCompletionScene,
  createResponsiveMenuCssScene,
  createResponsiveMenuHtmlScene,
  createResponsiveMenuJavascriptScene,
  createResponsiveMenuWarningScene,
} from "./responsive-menu-scenes";

export const RESPONSIVE_MENU_DEMO_STAGES = [
  {
    id: "setup",
    title: "Set up responsive menu",
    description: "Create the three-file lesson, semantic anchors, and learning plan.",
  },
  {
    id: "html",
    title: "Run HTML scene",
    description: "Resolve the HTML target and start the local learner-action scene.",
  },
  {
    id: "css",
    title: "Run CSS and mobile scene",
    description: "Resolve the breakpoint and move guidance into the mobile preview.",
  },
  {
    id: "javascript",
    title: "Run JavaScript scene",
    description: "Resolve the click handler and wait for the normalized mobile interaction.",
  },
  {
    id: "warning",
    title: "Preview warning fixture",
    description: "Show bounded warning feedback without changing learner work or progress.",
  },
  {
    id: "complete",
    title: "Validate and close responsive menu",
    description: "Evaluate every lesson step, celebrate success, and return to idle.",
  },
] as const;

export type ResponsiveMenuDemoStageId =
  (typeof RESPONSIVE_MENU_DEMO_STAGES)[number]["id"];

export type ResponsiveMenuDemoInvocation = Readonly<{
  toolName: WebMCPToolName;
  result: ToolResult<unknown>;
}>;

export type ResponsiveMenuDemoStageRun = Readonly<{
  stageId: ResponsiveMenuDemoStageId;
  accepted: boolean;
  invocations: readonly ResponsiveMenuDemoInvocation[];
  error?: string;
}>;

type ToolInvoker = Pick<ToolRegistry, "invoke">;

export async function runResponsiveMenuDemoStage(
  registry: ToolInvoker,
  stageId: ResponsiveMenuDemoStageId,
  topicId: ResponsiveMenuDemoTopicId = "trails",
): Promise<ResponsiveMenuDemoStageRun> {
  if (stageId === "setup") {
    const result = await registry.invoke(
      "create_guided_lesson",
      createResponsiveMenuLessonFixture(topicId),
    );
    return createStageRun(stageId, [
      { toolName: "create_guided_lesson", result },
    ]);
  }

  if (stageId === "warning") {
    const result = await registry.invoke(
      "play_teaching_scene",
      createResponsiveMenuWarningScene(),
    );
    return createStageRun(stageId, [
      { toolName: "play_teaching_scene", result },
    ]);
  }

  if (stageId === "complete") {
    return runResponsiveMenuCompletionStage(registry);
  }

  const sourceEntry = stageId === "html"
    ? RESPONSIVE_MENU_TARGET_CATALOG.htmlNavigation
    : stageId === "css"
      ? RESPONSIVE_MENU_TARGET_CATALOG.cssMobileQuery
      : RESPONSIVE_MENU_TARGET_CATALOG.javascriptToggleHandler;
  const invocations: ResponsiveMenuDemoInvocation[] = [];
  const resolved = await resolveSourceTarget(
    registry,
    sourceEntry,
  );
  invocations.push({ toolName: "inspect_classroom", result: resolved.result });
  if (!resolved.target) {
    return createStageRun(
      stageId,
      invocations,
      `The responsive menu ${stageId.toUpperCase()} target could not be resolved.`,
    );
  }
  const sceneInput = stageId === "html"
    ? createResponsiveMenuHtmlScene(resolved.target)
    : stageId === "css"
      ? createResponsiveMenuCssScene(resolved.target)
      : createResponsiveMenuJavascriptScene(resolved.target);
  const scene = await registry.invoke("play_teaching_scene", sceneInput);
  invocations.push({ toolName: "play_teaching_scene", result: scene });
  return createStageRun(stageId, invocations);
}

const RESPONSIVE_MENU_STEP_IDS = [
  RESPONSIVE_MENU_DEMO_IDS.htmlStep,
  RESPONSIVE_MENU_DEMO_IDS.accessibilityStep,
  RESPONSIVE_MENU_DEMO_IDS.cssStep,
  RESPONSIVE_MENU_DEMO_IDS.javascriptStep,
  RESPONSIVE_MENU_DEMO_IDS.verificationStep,
] as const;

async function runResponsiveMenuCompletionStage(
  registry: ToolInvoker,
): Promise<ResponsiveMenuDemoStageRun> {
  const stageId = "complete" as const;
  const invocations: ResponsiveMenuDemoInvocation[] = [];
  for (const stepId of RESPONSIVE_MENU_STEP_IDS) {
    const result = await registry.invoke("evaluate_current_step", {
      stepId,
      advanceOnPass: true,
      showFeedback: true,
    });
    invocations.push({ toolName: "evaluate_current_step", result });
    if (!isPassingEvaluation(result)) {
      const warning = await registry.invoke(
        "play_teaching_scene",
        createResponsiveMenuWarningScene(),
      );
      invocations.push({ toolName: "play_teaching_scene", result: warning });
      return createStageRun(
        stageId,
        invocations,
        `Responsive menu validation did not pass for step "${stepId}".`,
      );
    }
  }
  const completion = await registry.invoke(
    "play_teaching_scene",
    createResponsiveMenuCompletionScene(),
  );
  invocations.push({ toolName: "play_teaching_scene", result: completion });
  return createStageRun(stageId, invocations);
}

async function resolveSourceTarget(
  registry: ToolInvoker,
  entry: Extract<ResponsiveMenuTargetCatalogEntry, { kind: "source" }>,
): Promise<Readonly<{ result: ToolResult<unknown>; target?: TargetRefInput }>> {
  const result = await registry.invoke("inspect_classroom", {
    include: ["anchors"],
    anchorQuery: entry.query,
  });
  if (!result.ok) return { result };
  const data = isRecord(result.data) ? result.data : undefined;
  const anchors = Array.isArray(data?.anchors) ? data.anchors : [];
  for (const anchor of anchors) {
    if (!isRecord(anchor) || !Array.isArray(anchor.targets)) continue;
    for (const mapping of anchor.targets) {
      if (!isRecord(mapping) || mapping.representation !== entry.representation) {
        continue;
      }
      const target = targetRefSchema.safeParse(mapping.target);
      if (target.success) return { result, target: target.data };
    }
  }
  return { result };
}

function createStageRun(
  stageId: ResponsiveMenuDemoStageId,
  invocations: readonly ResponsiveMenuDemoInvocation[],
  error?: string,
): ResponsiveMenuDemoStageRun {
  const accepted = !error && invocations.length > 0 && invocations.every(
    ({ result }) => result.ok,
  );
  return {
    stageId,
    accepted,
    invocations,
    ...(error ? { error } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPassingEvaluation(result: ToolResult<unknown>): boolean {
  return result.ok && isRecord(result.data) && result.data.passed === true;
}
