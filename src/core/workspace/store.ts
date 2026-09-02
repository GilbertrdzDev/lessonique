import {
  createIdleWorkspaceState,
  type WorkspaceFile,
  type WorkspaceState,
} from "./contracts";

export type WorkspaceStateListener = () => void;

export interface WorkspaceStateReader {
  getSnapshot(): WorkspaceState;
  subscribe(listener: WorkspaceStateListener): () => void;
}

export class WorkspaceStore implements WorkspaceStateReader {
  #state: WorkspaceState;
  readonly #listeners = new Set<WorkspaceStateListener>();

  constructor(initialState: WorkspaceState = createIdleWorkspaceState()) {
    this.#state = cloneWorkspaceState(initialState);
  }

  getSnapshot = (): WorkspaceState => this.#state;

  subscribe = (listener: WorkspaceStateListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  commit(nextState: WorkspaceState): void {
    const clonedState = cloneWorkspaceState(nextState);
    if (workspaceFilesEqual(this.#state.files, clonedState.files)) {
      clonedState.files = this.#state.files;
    }
    this.#state = clonedState;
    this.#listeners.forEach((listener) => listener());
  }
}

function workspaceFilesEqual(
  left: readonly WorkspaceFile[],
  right: readonly WorkspaceFile[],
): boolean {
  return (
    left.length === right.length &&
    left.every((file, index) => {
      const candidate = right[index];
      return (
        file.path === candidate?.path &&
        file.languageId === candidate.languageId &&
        file.content === candidate.content &&
        file.visible === candidate.visible &&
        file.readOnly === candidate.readOnly
      );
    })
  );
}

export function cloneWorkspaceState(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    languageIds: [...state.languageIds],
    files: state.files.map((file) => ({ ...file })),
    directories: [...state.directories],
    surfaces: state.surfaces.map((surface) => ({
      ...surface,
      options: { ...surface.options },
    })),
    consoleEntries: state.consoleEntries.map((entry) => ({ ...entry })),
    interactionEvents: state.interactionEvents.map((event) => ({
      ...event,
      ...(event.targetRef
        ? {
            targetRef: {
              ...event.targetRef,
              input: { ...event.targetRef.input },
            },
          }
        : {}),
    })),
    runtime: { ...state.runtime },
  };
}
