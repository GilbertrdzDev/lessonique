import type { TargetRefInput, ToolResult } from "@/core/webmcp";
import { targetRefSchema } from "@/core/webmcp";
import type { ToolRegistry } from "@/core/webmcp/tool-registry";
import type { WebMCPToolName } from "@/core/webmcp/tool-names";

import {
  ARRAY_MAP_DEMO_IDS,
  ARRAY_MAP_TARGET_CATALOG,
  createArrayMapLessonFixture,
} from "./array-map-fixture";
import { createArrayMapScene } from "./array-map-scene";

export const ARRAY_MAP_DEMO_STAGE = {
  id: "array-map",
  title: "Run Array.map() demo",
  description:
    "Replace the class, switch to JavaScript Console, run the script, and validate output.",
} as const;

export type ArrayMapDemoInvocation = Readonly<{
  toolName: WebMCPToolName;
  result: ToolResult<unknown>;
}>;

export type ArrayMapDemoStageRun = Readonly<{
  stageId: typeof ARRAY_MAP_DEMO_STAGE.id;
  accepted: boolean;
  invocations: readonly ArrayMapDemoInvocation[];
  error?: string;
}>;

type ToolInvoker = Pick<ToolRegistry, "invoke">;

export async function runArrayMapDemoStage(
  registry: ToolInvoker,
): Promise<ArrayMapDemoStageRun> {
  const invocations: ArrayMapDemoInvocation[] = [];
  const created = await registry.invoke(
    "create_guided_lesson",
    createArrayMapLessonFixture(),
  );
  invocations.push({ toolName: "create_guided_lesson", result: created });
  if (!created.ok) return createStageRun(invocations);

  const resolved = await resolveMapTarget(registry);
  invocations.push({ toolName: "inspect_classroom", result: resolved.result });
  if (!resolved.target) {
    return createStageRun(
      invocations,
      "The Array.map() source target could not be resolved.",
    );
  }

  const sourceEvaluation = await registry.invoke("evaluate_current_step", {
    stepId: ARRAY_MAP_DEMO_IDS.mapStep,
    advanceOnPass: true,
    showFeedback: false,
  });
  invocations.push({ toolName: "evaluate_current_step", result: sourceEvaluation });
  if (!isPassingEvaluation(sourceEvaluation)) {
    return createStageRun(
      invocations,
      "The Array.map() source validation did not pass.",
    );
  }

  const runtimeAction = await registry.invoke("execute_environment_action", {
    actionId: "runtime.run",
    waitForCompletion: true,
  });
  invocations.push({ toolName: "execute_environment_action", result: runtimeAction });
  if (!runtimeAction.ok) return createStageRun(invocations);

  const scene = await registry.invoke(
    "play_teaching_scene",
    createArrayMapScene(resolved.target),
  );
  invocations.push({ toolName: "play_teaching_scene", result: scene });
  return createStageRun(invocations);
}

async function resolveMapTarget(
  registry: ToolInvoker,
): Promise<Readonly<{ result: ToolResult<unknown>; target?: TargetRefInput }>> {
  const entry = ARRAY_MAP_TARGET_CATALOG.mapCall;
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
  invocations: readonly ArrayMapDemoInvocation[],
  error?: string,
): ArrayMapDemoStageRun {
  return {
    stageId: ARRAY_MAP_DEMO_STAGE.id,
    accepted:
      !error && invocations.length > 0 && invocations.every(({ result }) => result.ok),
    invocations,
    ...(error ? { error } : {}),
  };
}

function isPassingEvaluation(result: ToolResult<unknown>): boolean {
  return result.ok && isRecord(result.data) && result.data.passed === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
