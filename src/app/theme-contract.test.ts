import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { themeProviderConfig } from "@/components/theme-provider";

describe("theme contract", () => {
  it("persists the selected light, dark, or system theme", () => {
    expect(themeProviderConfig).toMatchObject({
      attribute: "class",
      defaultTheme: "system",
      enableSystem: true,
      storageKey: "lessonique-theme",
    });
  });

  it("defines the shared tokens for both color schemes", () => {
    const stylesheet = readFileSync(
      new URL("./globals.css", import.meta.url),
      "utf8",
    );

    expect(stylesheet).toContain(":root {");
    expect(stylesheet).toContain(".dark {");
    expect(stylesheet).toContain("--brand-soft:");
    expect(stylesheet).toContain("--workspace:");
    expect(stylesheet).toContain("--success:");
  });
});
