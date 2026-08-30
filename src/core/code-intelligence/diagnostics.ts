import type {
  NormalizedDiagnostic,
  SourceDocument,
  ValidationResult,
} from "./contracts";
import { offsetRangeToLineColumnRange } from "./offset-range";

export interface DiagnosticMarker {
  diagnosticId: string;
  severity: NormalizedDiagnostic["severity"];
  message: string;
  code?: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface FileDiagnosticSnapshot {
  filePath: string;
  sourceRevision: number;
  diagnostics: readonly NormalizedDiagnostic[];
  markers: readonly DiagnosticMarker[];
}

export class DiagnosticSnapshotStore {
  readonly #files = new Map<string, FileDiagnosticSnapshot>();
  readonly #listeners = new Set<() => void>();

  replace(
    document: SourceDocument,
    diagnostics: readonly NormalizedDiagnostic[],
  ): void {
    const snapshot: FileDiagnosticSnapshot = {
      filePath: document.path,
      sourceRevision: document.revision,
      diagnostics: structuredClone(diagnostics),
      markers: diagnostics.flatMap((diagnostic) => {
        if (!diagnostic.range || diagnostic.filePath !== document.path) return [];
        try {
          return [
            {
              diagnosticId: diagnostic.id,
              severity: diagnostic.severity,
              message: diagnostic.message,
              ...(diagnostic.code ? { code: diagnostic.code } : {}),
              ...offsetRangeToLineColumnRange(document, diagnostic.range),
            },
          ];
        } catch {
          return [];
        }
      }),
    };
    this.#files.set(document.path, snapshot);
    this.#listeners.forEach((listener) => listener());
  }

  get(filePath: string): FileDiagnosticSnapshot | undefined {
    const snapshot = this.#files.get(filePath);
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  list(): FileDiagnosticSnapshot[] {
    return [...this.#files.values()].map((snapshot) => structuredClone(snapshot));
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  clear(): void {
    if (this.#files.size === 0) return;
    this.#files.clear();
    this.#listeners.forEach((listener) => listener());
  }

  retain(filePaths: readonly string[]): void {
    const retained = new Set(filePaths);
    const removed = [...this.#files.keys()].filter((path) => !retained.has(path));
    if (removed.length === 0) return;
    removed.forEach((path) => this.#files.delete(path));
    this.#listeners.forEach((listener) => listener());
  }
}

export class ValidationResultSnapshotStore {
  readonly #results = new Map<string, ValidationResult>();

  record(result: ValidationResult): void {
    this.#results.set(result.conditionId, structuredClone(result));
  }

  get(conditionId: string): ValidationResult | undefined {
    const result = this.#results.get(conditionId);
    return result ? structuredClone(result) : undefined;
  }

  list(): ValidationResult[] {
    return [...this.#results.values()].map((result) => structuredClone(result));
  }

  clear(): void {
    this.#results.clear();
  }
}
