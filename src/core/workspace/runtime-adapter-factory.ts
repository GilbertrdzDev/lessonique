import type { RuntimeProviderId } from "@/core/platform/identifiers";

import type { RuntimeAdapter, RuntimeAdapterResolver } from "./runtime-adapter";

export type RuntimeAdapterCreator = () => RuntimeAdapter;

export class DuplicateRuntimeAdapterFactoryError extends Error {
  constructor(providerId: RuntimeProviderId) {
    super(`Runtime adapter factory "${providerId}" is already registered.`);
    this.name = "DuplicateRuntimeAdapterFactoryError";
  }
}

export class MissingRuntimeAdapterFactoryError extends Error {
  constructor(providerId: RuntimeProviderId) {
    super(`Runtime adapter factory "${providerId}" is not registered.`);
    this.name = "MissingRuntimeAdapterFactoryError";
  }
}

export class RuntimeAdapterFactory implements RuntimeAdapterResolver {
  readonly #creators = new Map<RuntimeProviderId, RuntimeAdapterCreator>();
  readonly #instances = new Map<RuntimeProviderId, RuntimeAdapter>();

  register(
    providerId: RuntimeProviderId,
    creator: RuntimeAdapterCreator,
  ): void {
    if (this.#creators.has(providerId)) {
      throw new DuplicateRuntimeAdapterFactoryError(providerId);
    }
    this.#creators.set(providerId, creator);
  }

  get(providerId: RuntimeProviderId): RuntimeAdapter {
    const existing = this.#instances.get(providerId);
    if (existing) {
      return existing;
    }
    const creator = this.#creators.get(providerId);
    if (!creator) {
      throw new MissingRuntimeAdapterFactoryError(providerId);
    }
    const adapter = creator();
    if (adapter.providerId !== providerId) {
      throw new Error(
        `Runtime adapter factory "${providerId}" created adapter "${adapter.providerId}".`,
      );
    }
    this.#instances.set(providerId, adapter);
    return adapter;
  }

  listProviderIds(): RuntimeProviderId[] {
    return [...this.#creators.keys()];
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...this.#instances.values()].map((adapter) => adapter.dispose()),
    );
    this.#instances.clear();
  }
}
