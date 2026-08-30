import { describe, expect, it } from "vitest";

import type { NormalizedDiagnostic, ValidationResult } from "./contracts";
import {
  DiagnosticSnapshotStore,
  ValidationResultSnapshotStore,
} from "./diagnostics";

describe("diagnostic and evidence snapshots", () => {
  it("normalizes ranged diagnostics into one-based editor markers", () => {
    const store = new DiagnosticSnapshotStore();
    const content = "const ready = true;\nconst broken = ;";
    const startOffset = content.indexOf(";");
    const diagnostics: NormalizedDiagnostic[] = [
      {
        id: "diagnostic.javascript.incomplete",
        sourceId: "parser.fake",
        severity: "error",
        message: "Expression expected.",
        code: "expression-expected",
        filePath: "script.js",
        range: { startOffset, endOffset: startOffset + 1 },
      },
    ];

    store.replace(
      {
        path: "script.js",
        languageId: "language.javascript",
        content,
        revision: 3,
      },
      diagnostics,
    );

    expect(store.get("script.js")).toEqual({
      filePath: "script.js",
      sourceRevision: 3,
      diagnostics,
      markers: [
        {
          diagnosticId: "diagnostic.javascript.incomplete",
          severity: "error",
          message: "Expression expected.",
          code: "expression-expected",
          startLine: 1,
          startColumn: 19,
          endLine: 1,
          endColumn: 20,
        },
      ],
    });
  });

  it("retains diagnostics with unusable ranges without creating invalid markers", () => {
    const store = new DiagnosticSnapshotStore();
    store.replace(
      {
        path: "styles.css",
        languageId: "language.css",
        content: ".card {}",
        revision: 1,
      },
      [
        {
          id: "diagnostic.outside",
          sourceId: "parser.fake",
          severity: "warning",
          message: "Outside source.",
          filePath: "styles.css",
          range: { startOffset: 0, endOffset: 100 },
        },
      ],
    );

    expect(store.get("styles.css")?.diagnostics).toHaveLength(1);
    expect(store.get("styles.css")?.markers).toEqual([]);
  });

  it("stores defensive validation evidence snapshots by condition", () => {
    const store = new ValidationResultSnapshotStore();
    const result: ValidationResult = {
      conditionId: "condition.ready",
      validatorId: "validator.text-exists",
      status: "passed",
      evidence: [
        {
          kind: "source",
          summary: "The text exists.",
          filePath: "script.js",
          observed: true,
          expected: true,
        },
      ],
      diagnostics: [],
      evaluatedAt: "2026-08-30T00:00:00.000Z",
    };

    store.record(result);
    const snapshot = store.get(result.conditionId)!;
    (
      snapshot.evidence as unknown as Array<{ summary: string }>
    )[0]!.summary = "Changed";

    expect(store.get(result.conditionId)?.evidence[0]?.summary).toBe(
      "The text exists.",
    );
  });
});
