import { describe, expect, it } from "vitest";

import {
  getWebMCPAvailabilityPresentation,
  resolveWebMCPAvailability,
} from "./webmcp-availability";

describe("WebMCP availability", () => {
  it("keeps unsettled provider states neutral", () => {
    expect(resolveWebMCPAvailability("idle")).toBe("detecting");
    expect(resolveWebMCPAvailability("registering")).toBe("detecting");
    expect(resolveWebMCPAvailability("stopped")).toBe("detecting");
  });

  it("reports ready only after successful registration", () => {
    expect(resolveWebMCPAvailability("ready")).toBe("ready");
    expect(resolveWebMCPAvailability("unavailable")).toBe("unsupported");
    expect(resolveWebMCPAvailability("failed")).toBe("unsupported");
  });

  it("does not use connected or ready copy outside the ready state", () => {
    for (const availability of ["detecting", "unsupported"] as const) {
      const presentation = JSON.stringify(
        getWebMCPAvailabilityPresentation(availability),
      );
      expect(presentation).not.toMatch(/Connected through WebMCP|WebMCP Ready/);
    }
  });
});
