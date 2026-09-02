import { createStore, type StoreApi } from "zustand/vanilla";

import type {
  LessonState,
  LessonStateListener,
  LessonStoreAdapter,
} from "./contracts";
import { cloneLessonState, createIdleLessonState } from "./state";

export class LessonStore implements LessonStoreAdapter {
  readonly #store: StoreApi<LessonState>;

  constructor(initialState: LessonState = createIdleLessonState()) {
    const state = cloneLessonState(initialState);
    this.#store = createStore<LessonState>(() => state);
  }

  getSnapshot = (): LessonState => this.#store.getState();

  subscribe = (listener: LessonStateListener): (() => void) =>
    this.#store.subscribe(() => listener());

  commit(nextState: LessonState): void {
    this.#store.setState(cloneLessonState(nextState), true);
  }
}
