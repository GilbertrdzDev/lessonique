import type { TargetRef } from "@/core/platform/contracts";
import type { TargetResolverRegistry } from "@/core/platform/registries";

import type {
  GuidanceTargetAdapter,
  ResolvedTargetHandle,
} from "./targeting";

export class MissingTargetAdapterError extends Error {
  constructor(resolverId: string) {
    super(`No target adapter supports resolver "${resolverId}".`);
    this.name = "MissingTargetAdapterError";
  }
}

export class TargetResolverFacade {
  readonly #definitions: TargetResolverRegistry;
  readonly #adapters: readonly GuidanceTargetAdapter[];

  constructor(
    definitions: TargetResolverRegistry,
    adapters: readonly GuidanceTargetAdapter[],
  ) {
    this.#definitions = definitions;
    this.#adapters = adapters;
  }

  async prepare(target: TargetRef, signal: AbortSignal): Promise<void> {
    this.#definitions.validateReference(target);
    await this.#requireAdapter(target).prepareTarget(target, signal);
  }

  async resolve(
    target: TargetRef,
    signal: AbortSignal,
  ): Promise<ResolvedTargetHandle> {
    this.#definitions.validateReference(target);
    return this.#requireAdapter(target).resolveTarget(target, signal);
  }

  #requireAdapter(target: TargetRef): GuidanceTargetAdapter {
    const adapter = this.#adapters.find((candidate) =>
      candidate.supportsTargetResolver(target.resolverId),
    );
    if (!adapter) {
      throw new MissingTargetAdapterError(target.resolverId);
    }
    return adapter;
  }
}
