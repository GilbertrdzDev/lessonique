import { describe, expect, it } from "vitest";

import {
  validateVisualGuideInput,
  VisualGuideValidationError,
} from "./visual-guide";

describe("validateVisualGuideInput", () => {
  it("preserves structured visual guide content and supporting-item order", () => {
    const guide = validateVisualGuideInput({
      title: "Create the structure",
      body: "Add the navigation landmarks before styling them.",
      supportingItems: ["Create the header", "Add the navigation"],
    });

    expect(guide).toEqual({
      title: "Create the structure",
      body: "Add the navigation landmarks before styling them.",
      supportingItems: ["Create the header", "Add the navigation"],
    });
  });

  it("rejects unsupported output fields and declared content limits", () => {
    expect(() =>
      validateVisualGuideInput({ body: "Visible guidance", narration: "Read it" }),
    ).toThrow(VisualGuideValidationError);
    expect(() =>
      validateVisualGuideInput({ body: "Visible guidance", audio: true }),
    ).toThrow(VisualGuideValidationError);
    expect(() => validateVisualGuideInput({ body: "x".repeat(501) })).toThrow(
      VisualGuideValidationError,
    );
    expect(() =>
      validateVisualGuideInput({
        body: "Visible guidance",
        supportingItems: Array.from({ length: 6 }, (_, index) => `Item ${index}`),
      }),
    ).toThrow(VisualGuideValidationError);
  });
});
