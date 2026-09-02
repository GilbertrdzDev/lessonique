export type SpriteSheetFrameListener = (frameIndex: number) => void;

export type SpriteSheetScheduler = Readonly<{
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
  setTimeout(
    callback: () => void,
    delayMs: number,
  ): ReturnType<typeof setTimeout>;
}>;

type SpriteSheetAnimatorOptions = Readonly<{
  frameDurationsMs: readonly number[];
  onFrame: SpriteSheetFrameListener;
  scheduler?: SpriteSheetScheduler;
}>;

const DEFAULT_SCHEDULER: SpriteSheetScheduler = {
  clearTimeout: (handle) => clearTimeout(handle),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
};

export class SpriteSheetAnimator {
  readonly #frameDurationsMs: readonly number[];
  readonly #onFrame: SpriteSheetFrameListener;
  readonly #scheduler: SpriteSheetScheduler;
  #frameIndex = 0;
  #running = false;
  #paused = false;
  #timer?: ReturnType<typeof setTimeout>;

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
    this.#running = true;
    this.#paused = false;
    this.#onFrame(this.#frameIndex);
    this.#scheduleCurrentFrame();
  }

  pause(): void {
    if (!this.#running || this.#paused) return;
    this.#paused = true;
    this.#clearTimer();
  }

  resume(): void {
    if (!this.#running || !this.#paused) return;
    this.#paused = false;
    this.#scheduleCurrentFrame();
  }

  stop(): void {
    this.#clearTimer();
    this.#running = false;
    this.#paused = false;
  }

  #advance = (): void => {
    if (!this.#running || this.#paused) return;
    this.#frameIndex = (this.#frameIndex + 1) % this.#frameDurationsMs.length;
    this.#onFrame(this.#frameIndex);
    this.#scheduleCurrentFrame();
  };

  #clearTimer(): void {
    if (this.#timer === undefined) return;
    this.#scheduler.clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #scheduleCurrentFrame(): void {
    this.#clearTimer();
    this.#timer = this.#scheduler.setTimeout(
      this.#advance,
      this.#frameDurationsMs[this.#frameIndex],
    );
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
