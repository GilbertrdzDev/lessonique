import {
  createIdleWorkspaceState,
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
    this.#state = cloneWorkspaceState(nextState);
    this.#listeners.forEach((listener) => listener());
  }
}

export function cloneWorkspaceState(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    languageIds: [...state.languageIds],
    files: state.files.map((file) => ({ ...file })),
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
