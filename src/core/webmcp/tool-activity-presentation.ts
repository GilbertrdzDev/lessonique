import type {
  ApplyWorkspaceChangesInput,
  ConfigureLearningEnvironmentInput,
  ControlTeachingSceneInput,
  CreateGuidedLessonInput,
  ExecuteEnvironmentActionInput,
  PlayTeachingSceneInput,
  ResetClassroomInput,
  ShowReferencePanelInput,
  ToolResultStatus,
  WebMCPToolInputMap,
} from "./contracts";
import type { WebMCPToolName } from "./tool-names";

export type AgentActivityKind =
  | "connection"
  | "console"
  | "editor"
  | "error"
  | "execution"
  | "file"
  | "guide"
  | "learner"
  | "panel"
  | "success";

export type ToolActivityPresentation = Readonly<{
  kind: AgentActivityKind;
  summary: string;
  dedupeKey: string;
}>;

type ToolActivityResult = Readonly<{
  status: ToolResultStatus;
  data?: unknown;
}>;

type ActivityCopy = Readonly<{
  kind: Exclude<AgentActivityKind, "connection" | "error" | "learner" | "success">;
  inProgress: string;
  succeeded: string;
  failed: string;
  dedupeKey: string;
}>;

export function createToolActivityPresentation<TName extends WebMCPToolName>(
  toolName: TName,
  input: WebMCPToolInputMap[TName],
  result?: ToolActivityResult,
): ToolActivityPresentation | undefined {
  const copy = getActivityCopy(toolName, input);
  if (!copy) return undefined;

  if (!result) {
    return {
      kind: copy.kind,
      summary: copy.inProgress,
      dedupeKey: copy.dedupeKey,
    };
  }
  if (result.status === "failed" || result.status === "cancelled") {
    return {
      kind: "error",
      summary:
        result.status === "cancelled"
          ? "ChatGPT cancelled the current action."
          : copy.failed,
      dedupeKey: copy.dedupeKey,
    };
  }
  if (toolName === "evaluate_current_step") {
    const passed = readBoolean(result.data, "passed");
    return {
      kind: passed === false ? "error" : "success",
      summary:
        passed === false
          ? "The current lesson step needs another attempt."
          : "The current lesson step passed.",
      dedupeKey: copy.dedupeKey,
    };
  }
  return {
    kind: copy.kind,
    summary: copy.succeeded,
    dedupeKey: copy.dedupeKey,
  };
}

function getActivityCopy<TName extends WebMCPToolName>(
  toolName: TName,
  input: WebMCPToolInputMap[TName],
): ActivityCopy | undefined {
  switch (toolName) {
    case "get_system_capabilities":
    case "inspect_classroom":
      return undefined;
    case "create_guided_lesson":
      return describeLesson(input as CreateGuidedLessonInput);
    case "reset_classroom":
      return describeReset(input as ResetClassroomInput);
    case "configure_learning_environment":
      return describeConfiguration(input as ConfigureLearningEnvironmentInput);
    case "apply_workspace_changes":
      return describeWorkspaceChanges(input as ApplyWorkspaceChangesInput);
    case "execute_environment_action":
      return describeEnvironmentAction(input as ExecuteEnvironmentActionInput);
    case "play_teaching_scene":
      return describeTeachingScene(input as PlayTeachingSceneInput);
    case "control_teaching_scene":
      return describeSceneControl(input as ControlTeachingSceneInput);
    case "evaluate_current_step":
      return {
        kind: "guide",
        inProgress: "ChatGPT is checking the current lesson step.",
        succeeded: "The current lesson step passed.",
        failed: "ChatGPT could not check the current lesson step.",
        dedupeKey: "evaluation:current-step",
      };
    case "update_lesson_plan":
      return {
        kind: "guide",
        inProgress: "ChatGPT is updating the learning plan.",
        succeeded: "ChatGPT updated the learning plan.",
        failed: "ChatGPT could not update the learning plan.",
        dedupeKey: "guide:learning-plan",
      };
    case "show_reference_panel":
      return describeReference(input as ShowReferencePanelInput);
  }
}

function describeLesson(input: CreateGuidedLessonInput): ActivityCopy {
  const title = safeInlineCode(input.title);
  return {
    kind: "guide",
    inProgress: `ChatGPT is preparing ${title}.`,
    succeeded: `ChatGPT started ${title}.`,
    failed: "ChatGPT could not start the guided lesson.",
    dedupeKey: `guide:lesson:${input.lessonId}`,
  };
}

function describeReset(input: ResetClassroomInput): ActivityCopy {
  const guidanceOnly = input.scope === "guidance";
  return {
    kind: guidanceOnly ? "guide" : "console",
    inProgress: guidanceOnly
      ? "ChatGPT is clearing the current guidance."
      : "ChatGPT is resetting the classroom.",
    succeeded: guidanceOnly
      ? "ChatGPT cleared the current guidance."
      : "ChatGPT reset the classroom.",
    failed: guidanceOnly
      ? "ChatGPT could not clear the current guidance."
      : "ChatGPT could not reset the classroom.",
    dedupeKey: `reset:${input.scope}`,
  };
}

function describeConfiguration(
  input: ConfigureLearningEnvironmentInput,
): ActivityCopy {
  if (input.clearConsole) {
    return actionCopy(
      "console",
      "clear the console",
      "cleared the console",
      "configuration:clear-console",
    );
  }
  if (input.activeFile) {
    const path = safeInlineCode(input.activeFile);
    return {
      kind: "editor",
      inProgress: `ChatGPT is opening ${path}.`,
      succeeded: `ChatGPT opened ${path}.`,
      failed: `ChatGPT could not open ${path}.`,
      dedupeKey: `editor:open:${input.activeFile}`,
    };
  }
  if (input.surfaces?.length === 1) {
    const surface = input.surfaces[0];
    if (surface) {
      const displayName = humanizeIdentifier(surface.id);
      const verb = surface.visible === false ? "close" : "open";
      return actionCopy(
        "panel",
        `${verb} the ${displayName} panel`,
        `${verb === "open" ? "opened" : "closed"} the ${displayName} panel`,
        `panel:${surface.id}:${surface.visible === false ? "closed" : "open"}`,
      );
    }
  }
  if (input.activeSurfaceId) {
    const displayName = humanizeIdentifier(input.activeSurfaceId);
    return actionCopy(
      "panel",
      `open the ${displayName} panel`,
      `opened the ${displayName} panel`,
      `panel:${input.activeSurfaceId}:active`,
    );
  }
  return actionCopy(
    "panel",
    "update the learning environment",
    "updated the learning environment",
    "configuration:environment",
  );
}

function describeWorkspaceChanges(input: ApplyWorkspaceChangesInput): ActivityCopy {
  const operations = input.operations;
  const operation = operations.length === 1 ? operations[0] : undefined;
  if (!operation) {
    const paths = new Set(
      operations.flatMap((item) =>
        item.type === "move_file" ? [item.from, item.to] : [item.path],
      ),
    );
    return actionCopy(
      "file",
      `update ${paths.size} workspace files`,
      `updated ${paths.size} workspace files`,
      `file:batch:${[...paths].sort().join("|")}`,
    );
  }

  if (operation.type === "create_file") {
    const path = safeInlineCode(operation.path);
    const opened = input.openAfter === operation.path;
    return {
      kind: "file",
      inProgress: `ChatGPT is creating ${path}.`,
      succeeded: opened
        ? `ChatGPT created and opened ${path}.`
        : `ChatGPT created ${path}.`,
      failed: `ChatGPT could not create ${path}.`,
      dedupeKey: `file:create:${operation.path}`,
    };
  }
  if (operation.type === "move_file") {
    const from = safeInlineCode(operation.from);
    const to = safeInlineCode(operation.to);
    return {
      kind: "file",
      inProgress: `ChatGPT is renaming ${from}.`,
      succeeded: `ChatGPT renamed ${from} to ${to}.`,
      failed: `ChatGPT could not rename ${from}.`,
      dedupeKey: `file:move:${operation.from}:${operation.to}`,
    };
  }

  const path = safeInlineCode(operation.path);
  const removing = operation.type === "remove_file";
  return {
    kind: "file",
    inProgress: `ChatGPT is ${removing ? "removing" : "updating"} ${path}.`,
    succeeded: `ChatGPT ${removing ? "removed" : "updated"} ${path}.`,
    failed: `ChatGPT could not ${removing ? "remove" : "update"} ${path}.`,
    dedupeKey: `file:${removing ? "remove" : "update"}:${operation.path}`,
  };
}

function describeEnvironmentAction(input: ExecuteEnvironmentActionInput): ActivityCopy {
  const actionId = input.actionId.toLowerCase();
  if (actionId.includes("clear-console")) {
    return actionCopy(
      "console",
      "clear the console",
      "cleared the console",
      "runtime:clear-console",
    );
  }
  if (actionId.endsWith(".run") || actionId.endsWith(":run")) {
    return actionCopy(
      "execution",
      "run the active workspace",
      "ran the active workspace",
      "runtime:run",
    );
  }
  if (actionId.includes("restart")) {
    return actionCopy(
      "execution",
      "restart the active workspace",
      "restarted the active workspace",
      "runtime:restart",
    );
  }
  if (actionId.endsWith(".stop") || actionId.endsWith(":stop")) {
    return actionCopy(
      "execution",
      "stop the active workspace",
      "stopped the active workspace",
      "runtime:stop",
    );
  }
  if (actionId.includes("focus") && actionId.includes("editor")) {
    return actionCopy(
      "editor",
      "focus the code editor",
      "focused the code editor",
      "editor:focus",
    );
  }
  if (actionId.includes("reload") && actionId.includes("preview")) {
    return actionCopy(
      "execution",
      "refresh the preview",
      "refreshed the preview",
      "preview:reload",
    );
  }
  return actionCopy(
    "execution",
    "run an environment action",
    "completed an environment action",
    `environment-action:${input.actionId}`,
  );
}

function describeTeachingScene(input: PlayTeachingSceneInput): ActivityCopy {
  const title = input.title ? ` “${stripBackticks(input.title)}”` : "";
  return {
    kind: "guide",
    inProgress: `ChatGPT is starting the guided explanation${title}.`,
    succeeded: `ChatGPT started the guided explanation${title}.`,
    failed: "ChatGPT could not start the guided explanation.",
    dedupeKey: `guide:scene:${input.id}`,
  };
}

function describeSceneControl(input: ControlTeachingSceneInput): ActivityCopy {
  const copy = {
    pause: ["pause", "paused"],
    resume: ["resume", "resumed"],
    next: ["advance the explanation", "advanced the explanation"],
    previous: ["return to the previous explanation", "returned to the previous explanation"],
    restart: ["restart the explanation", "restarted the explanation"],
    cancel: ["finish the explanation", "finished the explanation"],
  } as const;
  const [active, completed] = copy[input.action];
  return actionCopy(
    "guide",
    active,
    completed,
    `guide:control:${input.sceneId ?? "active"}:${input.action}`,
  );
}

function describeReference(input: ShowReferencePanelInput): ActivityCopy {
  const title = safeInlineCode(input.title);
  return {
    kind: "panel",
    inProgress: `ChatGPT is opening ${title}.`,
    succeeded: `ChatGPT opened ${title}.`,
    failed: `ChatGPT could not open ${title}.`,
    dedupeKey: `panel:reference:${input.referenceId}`,
  };
}

function actionCopy(
  kind: ActivityCopy["kind"],
  active: string,
  completed: string,
  dedupeKey: string,
): ActivityCopy {
  return {
    kind,
    inProgress: `ChatGPT is trying to ${active}.`,
    succeeded: `ChatGPT ${completed}.`,
    failed: `ChatGPT could not ${active}.`,
    dedupeKey,
  };
}

function safeInlineCode(value: string): string {
  return `\`${stripBackticks(value)}\``;
}

function stripBackticks(value: string): string {
  return value.replaceAll("`", "");
}

function humanizeIdentifier(value: string): string {
  const segment = value.split(/[.:]/u).at(-1) ?? value;
  return segment.replaceAll(/[-_]+/gu, " ").toLowerCase();
}

function readBoolean(value: unknown, key: string): boolean | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "boolean" ? candidate : undefined;
}
