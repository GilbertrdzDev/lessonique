import type {
  LanguageId,
  LocatorId,
  TargetResolverId,
  ValidatorId,
} from "@/core/platform/identifiers";
import type { TargetRef } from "@/core/platform/contracts";
import type { JsonValue } from "@/core/platform/json-schema";

export type SourceAnchorId = string;
export type ValidationConditionId = string;
export type DiagnosticId = string;

export interface SourceOffsetRange {
  startOffset: number;
  endOffset: number;
}

export interface SourceDocument {
  path: string;
  languageId: LanguageId;
  content: string;
  revision: number;
}

export interface SourceAnchorDisambiguation {
  occurrence?: number;
  ancestorKinds?: readonly string[];
  signature?: string;
}

export interface SourceAnchor {
  id: SourceAnchorId;
  languageProviderId: LanguageId;
  locatorId: LocatorId;
  filePath: string;
  range: SourceOffsetRange;
  queryIntent: string;
  disambiguation?: SourceAnchorDisambiguation;
  sourceRevision: number;
}

export interface SourceLocatorQuery {
  locatorId: LocatorId;
  input: Readonly<Record<string, JsonValue>>;
}

export interface SourceLocatorResult {
  documentRevision: number;
  anchors: readonly SourceAnchor[];
}

export interface SourceLocator<TTree = unknown> {
  readonly id: LocatorId;
  readonly languageId: LanguageId;
  locate(
    parsed: ParsedSourceDocument<TTree>,
    input: Readonly<Record<string, JsonValue>>,
    signal: AbortSignal,
  ): Promise<SourceLocatorResult> | SourceLocatorResult;
}

export type SemanticTargetRepresentation =
  | "editor"
  | "preview"
  | "console"
  | "surface";

export interface SemanticTargetMapping {
  anchorId: SourceAnchorId;
  representation: SemanticTargetRepresentation;
  target: TargetRef;
}

export type PreviewTargetQuery =
  | {
      kind: "registered-anchor";
      anchorId: string;
    }
  | {
      kind: "html-element";
      tagName?: string;
      id?: string;
      attributeName?: string;
      className?: string;
      occurrence: number;
    };

export interface PreviewTargetQueryEntry {
  id: string;
  query: PreviewTargetQuery;
}

export interface SemanticTargetMappingContext {
  document: SourceDocument;
  query: SourceLocatorQuery;
}

export interface SemanticTargetMapper {
  readonly id: string;
  readonly resolverId: TargetResolverId;
  readonly languageId: LanguageId;
  readonly representation: SemanticTargetRepresentation;
  map(
    anchor: SourceAnchor,
    context: SemanticTargetMappingContext,
  ): readonly SemanticTargetMapping[];
}

export interface ValidationCondition {
  id: ValidationConditionId;
  validatorId: ValidatorId;
  input: Readonly<Record<string, JsonValue>>;
  filePath?: string;
}

export type ValidationStatus = "passed" | "failed" | "unavailable";
export type EvidenceKind = "workspace" | "source" | "preview" | "console";

export interface ValidationEvidence {
  kind: EvidenceKind;
  summary: string;
  filePath?: string;
  anchorId?: SourceAnchorId;
  observed?: string | number | boolean | null;
  expected?: string | number | boolean | null;
}

export interface ValidationResult {
  conditionId: ValidationConditionId;
  validatorId: ValidatorId;
  status: ValidationStatus;
  evidence: readonly ValidationEvidence[];
  diagnostics: readonly NormalizedDiagnostic[];
  evaluatedAt: string;
}

export interface ExecutableValidator {
  readonly id: ValidatorId;
  evaluate(
    condition: ValidationCondition,
    signal: AbortSignal,
  ): Promise<ValidationResult> | ValidationResult;
}

export type ValidationWaitStatus = "satisfied" | "timed-out" | "cancelled";

export interface ValidationWaitResult {
  status: ValidationWaitStatus;
  result: ValidationResult;
}

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface NormalizedDiagnostic {
  id: DiagnosticId;
  sourceId: string;
  severity: DiagnosticSeverity;
  message: string;
  code?: string;
  filePath?: string;
  range?: SourceOffsetRange;
}

export interface ParsedSourceDocument<TTree = unknown> {
  document: SourceDocument;
  tree?: TTree;
  valid: boolean;
  diagnostics: readonly NormalizedDiagnostic[];
}

export interface SourceParser<TTree = unknown> {
  readonly languageId: LanguageId;
  parse(
    document: SourceDocument,
    signal: AbortSignal,
  ): Promise<ParsedSourceDocument<TTree>> | ParsedSourceDocument<TTree>;
}

export interface LanguageIntelligenceProvider<TTree = unknown>
  extends SourceParser<TTree> {
  readonly languageId: LanguageId;
  readonly locatorIds: readonly LocatorId[];
  readonly locators: readonly SourceLocator<TTree>[];
  readonly validatorIds: readonly ValidatorId[];
}
