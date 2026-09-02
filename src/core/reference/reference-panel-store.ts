export type ReferenceSnippet = Readonly<{
  languageId: string;
  code: string;
}>;

export type ReferencePanel = Readonly<{
  referenceId: string;
  title: string;
  content: string;
  snippets: readonly ReferenceSnippet[];
  surfaceId: string;
}>;

export type ReferencePanelSnapshot = Readonly<{
  active?: ReferencePanel;
  revision: number;
}>;

export type ReferencePanelListener = () => void;

export class ReferencePanelStore {
  #snapshot: ReferencePanelSnapshot = { revision: 0 };
  readonly #listeners = new Set<ReferencePanelListener>();

  getSnapshot = (): ReferencePanelSnapshot => this.#snapshot;

  subscribe = (listener: ReferencePanelListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  show(reference: ReferencePanel): ReferencePanelSnapshot {
    const nextReference = cloneReference(reference);
    if (referencesEqual(this.#snapshot.active, nextReference)) {
      return this.#snapshot;
    }
    this.#snapshot = {
      active: nextReference,
      revision: this.#snapshot.revision + 1,
    };
    this.#emit();
    return this.#snapshot;
  }

  clear(): ReferencePanelSnapshot {
    if (!this.#snapshot.active) return this.#snapshot;
    this.#snapshot = { revision: this.#snapshot.revision + 1 };
    this.#emit();
    return this.#snapshot;
  }

  #emit(): void {
    this.#listeners.forEach((listener) => listener());
  }
}

function cloneReference(reference: ReferencePanel): ReferencePanel {
  return {
    ...reference,
    snippets: reference.snippets.map((snippet) => ({ ...snippet })),
  };
}

function referencesEqual(
  current: ReferencePanel | undefined,
  next: ReferencePanel,
): boolean {
  return (
    current?.referenceId === next.referenceId &&
    current.title === next.title &&
    current.content === next.content &&
    current.surfaceId === next.surfaceId &&
    current.snippets.length === next.snippets.length &&
    current.snippets.every(
      (snippet, index) =>
        snippet.languageId === next.snippets[index]?.languageId &&
        snippet.code === next.snippets[index]?.code,
    )
  );
}
