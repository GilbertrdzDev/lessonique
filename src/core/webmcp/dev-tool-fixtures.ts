import type { ToolResult, WebMCPToolInputMap } from "./contracts";
import type { ToolRegistry } from "./tool-registry";
import type { WebMCPToolName } from "./tool-names";

export const DEV_TOOL_FIXTURES = {
  get_system_capabilities: {
    include: [
      "profiles",
      "languages",
      "runtimes",
      "surfaces",
      "actions",
      "scene_effects",
      "target_resolvers",
      "assistant_states",
      "interaction_events",
      "locators",
      "validators",
      "limits",
    ],
  },
  create_guided_lesson: {
    lessonId: "lesson.dev-panel",
    lessonMode: "mixed",
    title: "Dev Panel lesson",
    objective: "Exercise every registered WebMCP tool without ChatGPT.",
    replaceExisting: true,
    environment: {
      profileId: "profile.vanilla-web",
      languageIds: ["language.javascript"],
      activeFile: "script.js",
      activeSurfaceId: "editor",
    },
    files: [
      {
        path: "script.js",
        languageId: "language.javascript",
        content: "const lessonReady = true;\nconsole.log('Lessonique ready');",
      },
    ],
    steps: [
      {
        id: "step.dev-panel",
        title: "Verify the fixture",
        objective: "Confirm the declared workspace value exists.",
        criteria: [
          {
            id: "criterion.dev-panel",
            validatorId: "validator.text-exists",
            input: { filePath: "script.js", text: "lessonReady" },
          },
        ],
        hints: ["Inspect script.js and keep the declared value."],
      },
    ],
  },
  reset_classroom: { scope: "all" },
  inspect_classroom: {
    include: [
      "capabilities",
      "lesson",
      "environment",
      "workspace",
      "scene",
      "assistant",
      "activity",
    ],
    maxActivity: 20,
  },
  configure_learning_environment: {
    activeFile: "script.js",
    activeSurfaceId: "editor",
    surfaces: [
      { id: "editor", visible: true },
      { id: "reference", visible: false },
    ],
  },
  apply_workspace_changes: {
    operations: [
      {
        type: "replace_file",
        path: "script.js",
        content:
          "const lessonReady = true;\nconsole.log('Lessonique fixture updated');",
      },
    ],
    openAfter: "script.js",
  },
  execute_environment_action: {
    actionId: "runtime.run",
    waitForCompletion: true,
  },
  play_teaching_scene: {
    id: "scene.dev-panel",
    title: "Dev Panel companion fixture",
    allowManualNavigation: true,
    beats: [
      {
        id: "beat.dev-panel-plan",
        type: "interaction",
        target: {
          resolverId: "target.surface-anchor",
          input: { anchorId: "anchor.learning-plan" },
        },
        assistant: {
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [
          { effectId: "effect.focus" },
          { effectId: "effect.highlight" },
          { effectId: "effect.pointer" },
          {
            effectId: "effect.callout",
            input: { text: "This target comes from the semantic registry." },
          },
        ],
        guide: {
          title: "Registered semantic target",
          body: "The companion and guide follow the learning plan through registered targets.",
          supportingItems: [
            "Provider-neutral target",
            "Structured visual content",
          ],
        },
        caption: "Dev Panel companion-assisted scene fixture.",
        wait: {
          kind: "interaction",
          eventTypeId: "interaction.surface-activate",
          target: {
            resolverId: "target.surface-anchor",
            input: { anchorId: "anchor.learning-plan" },
          },
          timeoutMs: 300_000,
        },
      },
    ],
  },
  control_teaching_scene: {
    action: "cancel",
    sceneId: "scene.dev-panel",
  },
  evaluate_current_step: {
    stepId: "step.dev-panel",
    advanceOnPass: true,
    showFeedback: true,
  },
  update_lesson_plan: {
    operations: [
      {
        type: "set_agent_message",
        message: "The Dev Panel invoked the production plan adapter.",
      },
    ],
  },
  show_reference_panel: {
    referenceId: "reference.dev-panel",
    title: "Dev Panel reference",
    content:
      "This structured reference is rendered as text and code, with no HTML or external URL input.",
    snippets: [
      {
        languageId: "language.javascript",
        code: "const lessonReady = true;",
      },
    ],
  },
} as const satisfies WebMCPToolInputMap;

export const DEV_TOOL_FIXTURE_ORDER = [
  "reset_classroom",
  "get_system_capabilities",
  "create_guided_lesson",
  "configure_learning_environment",
  "apply_workspace_changes",
  "execute_environment_action",
  "inspect_classroom",
  "update_lesson_plan",
  "show_reference_panel",
  "play_teaching_scene",
  "control_teaching_scene",
  "evaluate_current_step",
] as const satisfies readonly WebMCPToolName[];

export type DevToolFixtureRun = Readonly<{
  toolName: WebMCPToolName;
  result: ToolResult<unknown>;
}>;

export function isAcceptedDevToolFixtureRun(
  run: DevToolFixtureRun,
): boolean {
  return (
    run.result.ok ||
    (run.toolName === "control_teaching_scene" &&
      run.result.status === "cancelled")
  );
}

export async function runDevToolFixtureSuite(
  registry: ToolRegistry,
): Promise<readonly DevToolFixtureRun[]> {
  const results: DevToolFixtureRun[] = [];
  for (const toolName of DEV_TOOL_FIXTURE_ORDER) {
    const fixture =
      toolName === "reset_classroom"
        ? { scope: "guidance" as const }
        : structuredClone(DEV_TOOL_FIXTURES[toolName]);
    results.push({
      toolName,
      result: await registry.invoke(toolName, fixture),
    });
  }
  return results;
}
