import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import type {
  EnvironmentActionResult,
  WorkspaceFile,
  WorkspaceFileOperation,
} from "@/core/workspace";
import {
  WorkspaceController,
  WorkspaceValidationError,
} from "@/core/workspace/workspace-controller";

import { CapabilityValidator } from "./capabilities";
import type {
  ApplyWorkspaceChangesInput,
  ToolExecutionResult,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

type WorkspaceOperationInput = ApplyWorkspaceChangesInput["operations"][number];
type PatchEdit = Extract<WorkspaceOperationInput, { type: "patch_file" }>["edits"][number];

type PreparedWorkspaceChanges = {
  operations: WorkspaceFileOperation[];
  affectedFiles: string[];
  openAfter?: string;
  actionAfter?: string;
};

export type ApplyWorkspaceChangesData = {
  affectedFiles: string[];
  activeFile?: string;
  action?: EnvironmentActionResult;
  evidence: {
    environmentRevision: number;
    runtimeRevision: number;
    fileCount: number;
  };
};

export class ApplyWorkspaceChangesService {
  readonly #controller: WorkspaceController;
  readonly #validator: CapabilityValidator;

  constructor(
    controller: WorkspaceController,
    registries: ProviderPlatformRegistries,
  ) {
    this.#controller = controller;
    this.#validator = new CapabilityValidator(registries);
  }

  validate(input: ApplyWorkspaceChangesInput): void {
    this.#prepare(input);
  }

  async execute(
    input: ApplyWorkspaceChangesInput,
  ): Promise<ToolExecutionResult<ApplyWorkspaceChangesData>> {
    const prepared = this.#prepare(input);
    try {
      await this.#controller.applyFileOperations(prepared.operations);
      if (prepared.openAfter) {
        await this.#controller.openFile(prepared.openAfter);
      }
    } catch (error) {
      if (error instanceof WorkspaceValidationError) {
        throw invalidWorkspaceChanges(error.message);
      }
      throw error;
    }

    let action: EnvironmentActionResult | undefined;
    if (prepared.actionAfter) {
      action = await this.#controller.executeAction(prepared.actionAfter);
      if (!action.accepted) {
        throw new ToolInvocationError({
          code: "environment_action_rejected",
          message: action.message,
          recoverable: true,
        });
      }
    }

    const state = this.#controller.store.getSnapshot();
    return {
      ok: true,
      status: "completed",
      revision: state.environmentRevision,
      data: {
        affectedFiles: prepared.affectedFiles,
        ...(state.activeFilePath ? { activeFile: state.activeFilePath } : {}),
        ...(action ? { action } : {}),
        evidence: {
          environmentRevision: state.environmentRevision,
          runtimeRevision: state.runtime.revision,
          fileCount: state.files.length,
        },
      },
    };
  }

  #prepare(input: ApplyWorkspaceChangesInput): PreparedWorkspaceChanges {
    const state = this.#controller.store.getSnapshot();
    if (!state.profileId || !state.runtimeProviderId) {
      throw new ToolInvocationError({
        code: "workspace_unavailable",
        message: "The workspace does not have an active environment.",
        recoverable: true,
        supportedAlternatives: ["create_guided_lesson", "configure_learning_environment"],
      });
    }

    const profile = this.#validator.requireProfile(state.profileId);
    const files = state.files.map((file) => ({ ...file }));
    const operations: WorkspaceFileOperation[] = [];
    const affectedFiles: string[] = [];

    for (const operation of input.operations) {
      if (operation.type === "create_file") {
        if (files.some(({ path }) => path === operation.path)) {
          throw invalidWorkspaceChanges(
            `Workspace file "${operation.path}" already exists.`,
          );
        }
        const languageId = operation.languageId ?? this.#inferLanguageId(
          operation.path,
          state.languageIds,
          profile.id,
        );
        this.#validator.requireLanguage(languageId, profile.id);
        const file: WorkspaceFile = {
          path: operation.path,
          languageId,
          content: operation.content,
          visible: true,
        };
        files.push(file);
        operations.push({ type: "create", file });
        affectedFiles.push(operation.path);
        continue;
      }

      if (operation.type === "move_file") {
        if (operation.from === operation.to) {
          throw invalidWorkspaceChanges("A file cannot be moved onto itself.");
        }
        const index = requireWritableFile(files, operation.from);
        if (files.some(({ path }) => path === operation.to)) {
          throw invalidWorkspaceChanges(
            `Workspace file "${operation.to}" already exists.`,
          );
        }
        const current = files[index];
        if (!current) continue;
        const moved = { ...current, path: operation.to };
        files.splice(index, 1, moved);
        operations.push(
          { type: "create", file: moved },
          { type: "delete", path: operation.from },
        );
        affectedFiles.push(operation.from, operation.to);
        continue;
      }

      const index = requireWritableFile(files, operation.path);
      const current = files[index];
      if (!current) continue;
      if (operation.type === "remove_file") {
        files.splice(index, 1);
        operations.push({ type: "delete", path: operation.path });
        affectedFiles.push(operation.path);
        continue;
      }

      const content =
        operation.type === "replace_file"
          ? operation.content
          : applyTextEdits(current.content, operation.edits);
      files[index] = { ...current, content };
      operations.push({ type: "update", path: operation.path, content });
      affectedFiles.push(operation.path);
    }

    if (input.openAfter) {
      const target = files.find(({ path }) => path === input.openAfter);
      if (!target?.visible) {
        throw invalidWorkspaceChanges(
          `Open target "${input.openAfter}" must be a visible resulting file.`,
        );
      }
    }
    if (input.actionAfter) {
      this.#validator.validateAction(input.actionAfter, {}, profile.id);
    }

    return {
      operations,
      affectedFiles: [...new Set(affectedFiles)],
      ...(input.openAfter ? { openAfter: input.openAfter } : {}),
      ...(input.actionAfter ? { actionAfter: input.actionAfter } : {}),
    };
  }

  #inferLanguageId(
    path: string,
    selectedLanguageIds: readonly string[],
    profileId: string,
  ): string {
    const match = selectedLanguageIds
      .map((languageId) => this.#validator.requireLanguage(languageId, profileId))
      .find((language) =>
        language.extensions.some((extension) => path.endsWith(extension)),
      );
    if (!match) {
      throw invalidWorkspaceChanges(
        `No selected language provider supports "${path}".`,
      );
    }
    return match.id;
  }
}

function requireWritableFile(files: WorkspaceFile[], path: string): number {
  const index = files.findIndex((file) => file.path === path);
  if (index < 0) {
    throw invalidWorkspaceChanges(`Workspace file "${path}" does not exist.`);
  }
  if (files[index]?.readOnly) {
    throw invalidWorkspaceChanges(`Workspace file "${path}" is read-only.`);
  }
  return index;
}

function applyTextEdits(content: string, edits: readonly PatchEdit[]): string {
  const ranges = edits.map((edit, index) => {
    const start = textPositionToOffset(content, edit.start.line, edit.start.column);
    const end = textPositionToOffset(content, edit.end.line, edit.end.column);
    if (end < start) {
      throw invalidWorkspaceChanges(`Patch edit ${index + 1} ends before it starts.`);
    }
    return { start, end, text: edit.text, index };
  });
  const ascending = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  for (let index = 1; index < ascending.length; index += 1) {
    const previous = ascending[index - 1];
    const current = ascending[index];
    if (previous && current && current.start < previous.end) {
      throw invalidWorkspaceChanges("Patch edits must not overlap.");
    }
  }
  return [...ranges]
    .sort((left, right) => right.start - left.start || right.index - left.index)
    .reduce(
      (result, edit) =>
        `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`,
      content,
    );
}

function textPositionToOffset(
  content: string,
  line: number,
  column: number,
): number {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") starts.push(index + 1);
  }
  const lineStart = starts[line - 1];
  if (lineStart === undefined) {
    throw invalidWorkspaceChanges(`Patch position line ${line} is outside the file.`);
  }
  const nextLineStart = starts[line];
  let lineEnd = nextLineStart === undefined ? content.length : nextLineStart - 1;
  if (lineEnd > lineStart && content[lineEnd - 1] === "\r") lineEnd -= 1;
  const offset = lineStart + column - 1;
  if (offset > lineEnd) {
    throw invalidWorkspaceChanges(
      `Patch position ${line}:${column} is outside the line.`,
    );
  }
  return offset;
}

function invalidWorkspaceChanges(message: string): ToolInvocationError {
  return new ToolInvocationError({
    code: "invalid_workspace_changes",
    message,
    recoverable: true,
  });
}
