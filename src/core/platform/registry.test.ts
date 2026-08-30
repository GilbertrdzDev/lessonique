import { describe, expect, it } from "vitest";

import {
  DuplicateRegistryItemError,
  InMemoryRegistry,
  MissingRegistryItemError,
} from "./registry";

describe("InMemoryRegistry", () => {
  it("registers, lists, looks up, requires, and unregisters items", () => {
    const registry = new InMemoryRegistry<{ id: string; value: number }>({
      name: "FixtureRegistry",
    });

    registry.register({ id: "fixture.one", value: 1 });
    registry.register({ id: "fixture.two", value: 2 });

    expect(registry.get("fixture.one")).toEqual({
      id: "fixture.one",
      value: 1,
    });
    expect(registry.require("fixture.two").value).toBe(2);
    expect(registry.list().map(({ id }) => id)).toEqual([
      "fixture.one",
      "fixture.two",
    ]);

    registry.unregister("fixture.one");

    expect(registry.get("fixture.one")).toBeUndefined();
  });

  it("rejects duplicate IDs and reports missing required items", () => {
    const registry = new InMemoryRegistry<{ id: string }>({
      name: "FixtureRegistry",
    });
    registry.register({ id: "fixture.one" });

    expect(() => registry.register({ id: "fixture.one" })).toThrow(
      DuplicateRegistryItemError,
    );
    expect(() => registry.require("fixture.missing")).toThrow(
      MissingRegistryItemError,
    );
  });
});
