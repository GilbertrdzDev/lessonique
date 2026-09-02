export interface RegistryItem {
  id: string;
}

export interface Registry<T extends RegistryItem> {
  register(item: T): void;
  unregister(id: string): void;
  get(id: string): T | undefined;
  require(id: string): T;
  list(): T[];
}

export class DuplicateRegistryItemError extends Error {
  constructor(registryName: string, id: string) {
    super(`${registryName} already contains an item with ID "${id}".`);
    this.name = "DuplicateRegistryItemError";
  }
}

export class MissingRegistryItemError extends Error {
  constructor(registryName: string, id: string) {
    super(`${registryName} does not contain an item with ID "${id}".`);
    this.name = "MissingRegistryItemError";
  }
}

export class InvalidRegistryItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRegistryItemError";
  }
}

type RegistryOptions<T extends RegistryItem> = {
  name: string;
  validate?: (item: T) => void;
};

export class InMemoryRegistry<T extends RegistryItem>
  implements Registry<T>
{
  readonly #items = new Map<string, T>();
  readonly #name: string;
  readonly #validate?: (item: T) => void;

  constructor(options: RegistryOptions<T>) {
    this.#name = options.name;
    this.#validate = options.validate;
  }

  register(item: T): void {
    assertNonEmptyId(item.id, this.#name);
    if (this.#items.has(item.id)) {
      throw new DuplicateRegistryItemError(this.#name, item.id);
    }
    this.#validate?.(item);
    this.#items.set(item.id, item);
  }

  unregister(id: string): void {
    this.#items.delete(id);
  }

  get(id: string): T | undefined {
    return this.#items.get(id);
  }

  require(id: string): T {
    const item = this.get(id);
    if (!item) {
      throw new MissingRegistryItemError(this.#name, id);
    }
    return item;
  }

  list(): T[] {
    return [...this.#items.values()];
  }
}

export function assertNamespacedId(id: string, context: string): void {
  const namespacedIdPattern =
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/u;
  if (!namespacedIdPattern.test(id)) {
    throw new InvalidRegistryItemError(
      `${context} ID "${id}" must be a lowercase namespaced identifier.`,
    );
  }
}

export function assertNonEmptyId(id: string, context: string): void {
  if (id.trim().length === 0) {
    throw new InvalidRegistryItemError(`${context} ID cannot be empty.`);
  }
}
