import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  NormalizedDiagnostic,
  SemanticTargetMapping,
  SourceAnchor,
  ValidationCondition,
  ValidationResult,
} from "./contracts";

describe("code intelligence contracts", () => {
  it("keeps provider-owned source anchors distinct from public scene targets", () => {
    const anchor = {
      id: "anchor.fake",
      languageProviderId: "language.fake",
      locatorId: "locator.fake-symbol",
      filePath: "lesson.fake",
      range: { startOffset: 10, endOffset: 18 },
      queryIntent: "symbol.named",
      disambiguation: {
        occurrence: 1,
        ancestorKinds: ["declaration"],
        signature: "fakeSymbol/1",
      },
      sourceRevision: 3,
    } satisfies SourceAnchor;
    const mapping = {
      anchorId: anchor.id,
      representation: "editor",
      target: {
        resolverId: "target.fake-code",
        input: { anchorId: anchor.id },
      },
    } satisfies SemanticTargetMapping;

    expect(anchor.locatorId).toBe("locator.fake-symbol");
    expect(mapping.target.resolverId).toBe("target.fake-code");
    expect(mapping).not.toHaveProperty("node");
    expect(mapping).not.toHaveProperty("selector");
  });

  it("defines bounded conditions, evidence, and normalized diagnostics", () => {
    const condition = {
      id: "condition.fake",
      validatorId: "validator.fake",
      filePath: "lesson.fake",
      input: { symbolName: "fakeSymbol" },
    } satisfies ValidationCondition;
    const diagnostic = {
      id: "diagnostic.fake",
      sourceId: "parser.fake",
      severity: "warning",
      message: "The fake symbol is not used.",
      code: "fake-unused",
      filePath: "lesson.fake",
      range: { startOffset: 10, endOffset: 18 },
    } satisfies NormalizedDiagnostic;
    const result = {
      conditionId: condition.id,
      validatorId: condition.validatorId,
      status: "failed",
      evidence: [
        {
          kind: "source",
          summary: "No matching symbol was found.",
          filePath: "lesson.fake",
          expected: "fakeSymbol",
        },
      ],
      diagnostics: [diagnostic],
      evaluatedAt: "2026-08-30T00:00:00.000Z",
    } satisfies ValidationResult;

    expect(result.evidence[0]).toEqual(
      expect.objectContaining({ kind: "source", expected: "fakeSymbol" }),
    );
    expectTypeOf<SourceAnchor>().not.toHaveProperty("astNode");
    expectTypeOf<NormalizedDiagnostic>().not.toHaveProperty("domNode");
  });
});
