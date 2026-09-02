import type { TargetRef } from "@/core/platform/contracts";
import type {
  ResolvedTargetHandle,
  ResolvedTargetSnapshot,
} from "@/core/workspace/targeting";

export type TrackedTargetStatus = "resolved" | "lost" | "recovered";

export interface TrackedTargetSnapshot {
  target: TargetRef;
  status: TrackedTargetStatus;
  resolved: ResolvedTargetSnapshot;
}

type TargetTrackerListener = (snapshot: TrackedTargetSnapshot) => void;

export class TargetTracker {
  readonly #target: TargetRef;
  readonly #handle: ResolvedTargetHandle;
  readonly #listeners = new Set<TargetTrackerListener>();
  readonly #unsubscribe: () => void;
  readonly #cancelFrame: (handle: number) => void;
  readonly #requestFrame: (callback: FrameRequestCallback) => number;
  #snapshot: TrackedTargetSnapshot;
  #frame?: number;
  #pendingSnapshot?: ResolvedTargetSnapshot;
  #disposed = false;

  constructor(
    target: TargetRef,
    handle: ResolvedTargetHandle,
    options: {
      requestFrame?: (callback: FrameRequestCallback) => number;
      cancelFrame?: (handle: number) => void;
    } = {},
  ) {
    this.#target = structuredClone(target);
    this.#handle = handle;
    this.#requestFrame =
      options.requestFrame ??
      globalThis.requestAnimationFrame?.bind(globalThis) ??
      ((callback) => globalThis.setTimeout(() => callback(Date.now()), 0));
    this.#cancelFrame =
      options.cancelFrame ??
      globalThis.cancelAnimationFrame?.bind(globalThis) ??
      globalThis.clearTimeout.bind(globalThis);
    const initial = handle.getSnapshot();
    this.#snapshot = {
      target: structuredClone(target),
      status: initial.status === "resolved" ? "resolved" : "lost",
      resolved: initial,
    };
    this.#unsubscribe = handle.subscribe((snapshot) => this.#schedule(snapshot));
  }

  getSnapshot(): TrackedTargetSnapshot {
    return structuredClone(this.#snapshot);
  }

  subscribe(listener: TargetTrackerListener): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  waitForResolved(timeoutMs: number, signal: AbortSignal): Promise<boolean> {
    if (this.#snapshot.resolved.status === "resolved") {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener("abort", abort);
        resolve(result);
      };
      const abort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        reject(new DOMException("Target tracking was cancelled.", "AbortError"));
      };
      const unsubscribe = this.subscribe((snapshot) => {
        if (snapshot.resolved.status === "resolved") finish(true);
      });
      const timer = setTimeout(() => finish(false), timeoutMs);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#frame !== undefined) this.#cancelFrame(this.#frame);
    this.#frame = undefined;
    this.#pendingSnapshot = undefined;
    this.#unsubscribe();
    this.#handle.dispose();
    this.#listeners.clear();
  }

  #schedule(snapshot: ResolvedTargetSnapshot): void {
    if (this.#disposed) return;
    this.#pendingSnapshot = structuredClone(snapshot);
    if (this.#frame !== undefined) return;
    this.#frame = this.#requestFrame(() => {
      this.#frame = undefined;
      const next = this.#pendingSnapshot;
      this.#pendingSnapshot = undefined;
      if (this.#disposed || !next) return;
      const wasLost = this.#snapshot.resolved.status === "lost";
      this.#snapshot = {
        target: structuredClone(this.#target),
        status:
          next.status === "lost"
            ? "lost"
            : wasLost
              ? "recovered"
              : "resolved",
        resolved: structuredClone(next),
      };
      this.#listeners.forEach((listener) => listener(this.getSnapshot()));
    });
  }
}
