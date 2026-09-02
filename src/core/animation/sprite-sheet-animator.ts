export type SpriteSheetFrameListener = (frameIndex: number) => void;

export type SpriteSheetScheduler = Readonly<{
  cancelFrame(handle: number): void;
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
}>;

type SpriteSheetAnimatorOptions = Readonly<{
  frameDurationsMs: readonly number[];
  onFrame: SpriteSheetFrameListener;
  scheduler?: SpriteSheetScheduler;
}>;

const DEFAULT_SCHEDULER: SpriteSheetScheduler = {
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
};

export class SpriteSheetAnimator {
  readonly #frameDurationsMs: readonly number[];
  readonly #onFrame: SpriteSheetFrameListener;
  readonly #scheduler: SpriteSheetScheduler;
  #frameIndex = 0;
  #elapsedInFrameMs = 0;
  #frameHandle?: number;
  #lastTimestampMs = 0;
  #running = false;
  #paused = false;

  constructor(options: SpriteSheetAnimatorOptions) {
    validateFrameDurations(options.frameDurationsMs);
    this.#frameDurationsMs = [...options.frameDurationsMs];
    this.#onFrame = options.onFrame;
    this.#scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  }

  get frameIndex(): number {
    return this.#frameIndex;
  }

  get paused(): boolean {
    return this.#paused;
  }

  get running(): boolean {
    return this.#running;
  }

  start(frameIndex = 0): void {
    if (this.#running) return;
    this.#frameIndex = normalizeFrameIndex(
      frameIndex,
      this.#frameDurationsMs.length,
    );
    this.#elapsedInFrameMs = 0;
    this.#lastTimestampMs = this.#scheduler.now();
    this.#running = true;
    this.#paused = false;
    this.#onFrame(this.#frameIndex);
    this.#requestNextFrame();
  }

  pause(): void {
    if (!this.#running || this.#paused) return;
    this.#paused = true;
    this.#cancelFrame();
  }

  resume(): void {
    if (!this.#running || !this.#paused) return;
    this.#paused = false;
    this.#lastTimestampMs = this.#scheduler.now();
    this.#requestNextFrame();
  }

  stop(): void {
    this.#cancelFrame();
    this.#running = false;
    this.#paused = false;
    this.#elapsedInFrameMs = 0;
  }

  #advance = (timestampMs: number): void => {
    this.#frameHandle = undefined;
    if (!this.#running || this.#paused) return;
    this.#elapsedInFrameMs += Math.max(
      0,
      timestampMs - this.#lastTimestampMs,
    );
    this.#lastTimestampMs = timestampMs;

    let frameChanged = false;
    while (
      this.#elapsedInFrameMs >= this.#frameDurationsMs[this.#frameIndex]
    ) {
      this.#elapsedInFrameMs -= this.#frameDurationsMs[this.#frameIndex];
      this.#frameIndex =
        (this.#frameIndex + 1) % this.#frameDurationsMs.length;
      frameChanged = true;
    }
    if (frameChanged) this.#onFrame(this.#frameIndex);
    this.#requestNextFrame();
  };

  #cancelFrame(): void {
    if (this.#frameHandle === undefined) return;
    this.#scheduler.cancelFrame(this.#frameHandle);
    this.#frameHandle = undefined;
  }

  #requestNextFrame(): void {
    this.#cancelFrame();
    this.#frameHandle = this.#scheduler.requestFrame(this.#advance);
  }
}

function normalizeFrameIndex(frameIndex: number, frameCount: number): number {
  if (!Number.isInteger(frameIndex)) {
    throw new TypeError("Sprite frame index must be an integer.");
  }
  return ((frameIndex % frameCount) + frameCount) % frameCount;
}

function validateFrameDurations(frameDurationsMs: readonly number[]): void {
  if (frameDurationsMs.length === 0) {
    throw new TypeError("A sprite animation needs at least one frame.");
  }
  if (
    frameDurationsMs.some(
      (duration) => !Number.isFinite(duration) || duration <= 0,
    )
  ) {
    throw new TypeError("Sprite frame durations must be positive numbers.");
  }
}
