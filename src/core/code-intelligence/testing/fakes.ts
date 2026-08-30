import type { JsonValue } from "@/core/platform/json-schema";

import type {
  ExecutableValidator,
  LanguageIntelligenceProvider,
  ParsedSourceDocument,
  SemanticTargetMapper,
  SourceAnchor,
  SourceDocument,
  SourceLocator,
  SourceLocatorResult,
  ValidationCondition,
  ValidationResult,
} from "../contracts";

export interface FakeSyntaxTree {
  symbols: readonly { name: string; startOffset: number; endOffset: number }[];
}

export class FakeLanguageIntelligenceProvider
  implements LanguageIntelligenceProvider<FakeSyntaxTree>
{
  readonly languageId = "language.fake";
  readonly locators: readonly SourceLocator<FakeSyntaxTree>[] = [
    new FakeSymbolLocator(),
  ];
  readonly locatorIds = this.locators.map(({ id }) => id);
  readonly validatorIds = ["validator.fake-symbol-exists"];

  parse(
    document: SourceDocument,
    signal: AbortSignal,
  ): ParsedSourceDocument<FakeSyntaxTree> {
    if (signal.aborted) throw new DOMException("Fake parsing cancelled.", "AbortError");
    const symbols = [...document.content.matchAll(/[A-Za-z][A-Za-z0-9]*/gu)].map(
      (match) => ({
        name: match[0],
        startOffset: match.index,
        endOffset: match.index + match[0].length,
      }),
    );
    return { document: structuredClone(document), tree: { symbols }, valid: true, diagnostics: [] };
  }
}

class FakeSymbolLocator implements SourceLocator<FakeSyntaxTree> {
  readonly id = "locator.fake-symbol";
  readonly languageId = "language.fake";

  locate(
    parsed: ParsedSourceDocument<FakeSyntaxTree>,
    input: Readonly<Record<string, JsonValue>>,
    signal: AbortSignal,
  ): SourceLocatorResult {
    if (signal.aborted) throw new DOMException("Fake lookup cancelled.", "AbortError");
    const name = input.name;
    if (typeof name !== "string") throw new Error("Fake symbol name is required.");
    return {
      documentRevision: parsed.document.revision,
      anchors: (parsed.tree?.symbols ?? [])
        .filter((symbol) => symbol.name === name)
        .map((symbol, occurrence): SourceAnchor => ({
          id: `anchor.fake:${parsed.document.path}:${symbol.startOffset}`,
          languageProviderId: this.languageId,
          locatorId: this.id,
          filePath: parsed.document.path,
          range: {
            startOffset: symbol.startOffset,
            endOffset: symbol.endOffset,
          },
          queryIntent: "fake.symbol",
          disambiguation: { occurrence, signature: name },
          sourceRevision: parsed.document.revision,
        })),
    };
  }
}

export class FakeSemanticTargetMapper implements SemanticTargetMapper {
  readonly id = "mapper.fake-editor";
  readonly resolverId = "target.fake-code";
  readonly languageId = "language.fake";
  readonly representation = "editor" as const;

  map(anchor: SourceAnchor) {
    return [
      {
        anchorId: anchor.id,
        representation: this.representation,
        target: {
          resolverId: this.resolverId,
          input: { anchorId: anchor.id },
        },
      },
    ];
  }
}

export class FakeExecutableValidator implements ExecutableValidator {
  readonly id = "validator.fake-symbol-exists";

  evaluate(condition: ValidationCondition): ValidationResult {
    const passed = condition.input.present === true;
    return {
      conditionId: condition.id,
      validatorId: this.id,
      status: passed ? "passed" : "failed",
      evidence: [
        {
          kind: "source",
          summary: passed ? "The fake symbol exists." : "The fake symbol is absent.",
          observed: passed,
          expected: true,
        },
      ],
      diagnostics: [],
      evaluatedAt: "2026-08-30T00:00:00.000Z",
    };
  }
}
