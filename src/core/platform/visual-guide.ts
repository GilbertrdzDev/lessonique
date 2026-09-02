import {
  DEFAULT_SYSTEM_LIMITS,
  type SystemLimits,
  type VisualGuideInput,
} from "./contracts";

const VISUAL_GUIDE_FIELDS = new Set(["title", "body", "supportingItems"]);

export const GUIDE_INLINE_CODE_SYNTAX_DESCRIPTION =
  "Wrap every code-related term in single backticks, including keywords, identifiers, functions, values, data types, HTML tags, CSS tokens, and short expressions (for example, `const`, `<section>`, `getUser()`, `string`, or `42`). Only inline code spans are supported; do not use HTML or other Markdown for presentation.";

export class VisualGuideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualGuideValidationError";
  }
}

export function validateVisualGuideInput(
  input: unknown,
  limits: Readonly<SystemLimits> = DEFAULT_SYSTEM_LIMITS,
): VisualGuideInput {
  if (!isRecord(input)) {
    throw new VisualGuideValidationError("Visual guide must be an object.");
  }

  for (const field of Object.keys(input)) {
    if (!VISUAL_GUIDE_FIELDS.has(field)) {
      throw new VisualGuideValidationError(
        `Visual guide contains unsupported field "${field}".`,
      );
    }
  }

  if (typeof input.body !== "string" || input.body.length === 0) {
    throw new VisualGuideValidationError(
      "Visual guide body must be a non-empty string.",
    );
  }
  if (input.body.length > limits.maxVisualGuideBodyCharacters) {
    throw new VisualGuideValidationError(
      `Visual guide body cannot exceed ${limits.maxVisualGuideBodyCharacters} characters.`,
    );
  }

  if (input.title !== undefined && typeof input.title !== "string") {
    throw new VisualGuideValidationError(
      "Visual guide title must be a string.",
    );
  }

  if (
    input.supportingItems !== undefined &&
    !Array.isArray(input.supportingItems)
  ) {
    throw new VisualGuideValidationError(
      "Visual guide supporting items must be an array.",
    );
  }

  const supportingItems = input.supportingItems as unknown[] | undefined;
  if (
    supportingItems &&
    supportingItems.length > limits.maxVisualGuideItems
  ) {
    throw new VisualGuideValidationError(
      `Visual guide cannot contain more than ${limits.maxVisualGuideItems} supporting items.`,
    );
  }

  supportingItems?.forEach((item, index) => {
    if (typeof item !== "string") {
      throw new VisualGuideValidationError(
        `Visual guide supporting item ${index + 1} must be a string.`,
      );
    }
    if (item.length > limits.maxVisualGuideItemCharacters) {
      throw new VisualGuideValidationError(
        `Visual guide supporting item ${index + 1} cannot exceed ${limits.maxVisualGuideItemCharacters} characters.`,
      );
    }
  });

  return {
    ...(input.title !== undefined ? { title: input.title as string } : {}),
    body: input.body,
    ...(supportingItems
      ? { supportingItems: supportingItems as string[] }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
