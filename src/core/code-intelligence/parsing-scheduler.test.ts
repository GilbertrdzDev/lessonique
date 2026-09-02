import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ParsedSourceDocument,
  SourceDocument,
  SourceParser,
} from "./contracts";
import { ParsingScheduler } from "./parsing-scheduler";

describe("ParsingScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces each document and cancels the replaced request", async () => {
    const scheduler = new ParsingScheduler({ debounceMs: 50 });
    const parser = createParser();
    const first = scheduler.schedule(createDocument(1, "first"), parser);
    const firstRejection = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = scheduler.schedule(createDocument(2, "second"), parser);

    await vi.advanceTimersByTimeAsync(49);
    expect(parser.parse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await firstRejection;
    await expect(second).resolves.toEqual(
      expect.objectContaining({
        current: expect.objectContaining({
          document: expect.objectContaining({ revision: 2, content: "second" }),
          valid: true,
        }),
      }),
    );
    expect(parser.parse).toHaveBeenCalledOnce();
  });

  it("aborts parsing that is already running", async () => {
    const scheduler = new ParsingScheduler({ debounceMs: 0 });
    const parser: SourceParser = {
      languageId: "language.fake",
      parse: vi.fn((_document: SourceDocument, signal: AbortSignal) =>
        new Promise<ParsedSourceDocument>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
      ),
    };
    const parsing = scheduler.schedule(createDocument(1, "pending"), parser);
    const rejection = expect(parsing).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);

    scheduler.cancel("lesson.fake");

    await rejection;
    expect(vi.mocked(parser.parse).mock.calls[0]?.[1].aborted).toBe(true);
  });

  it("returns the last valid tree when a newer parse is invalid", async () => {
    const scheduler = new ParsingScheduler({ debounceMs: 10 });
    const parser = createParser();
    const valid = scheduler.schedule(createDocument(1, "valid"), parser);
    await vi.advanceTimersByTimeAsync(10);
    await valid;
    vi.mocked(parser.parse).mockImplementationOnce((document) => ({
      document,
      valid: false,
      diagnostics: [
        {
          id: "diagnostic.invalid",
          sourceId: "parser.fake",
          severity: "error",
          message: "The source is incomplete.",
          filePath: document.path,
        },
      ],
    }));
    const invalid = scheduler.schedule(createDocument(2, "invalid"), parser);
    await vi.advanceTimersByTimeAsync(10);

    await expect(invalid).resolves.toEqual(
      expect.objectContaining({
        current: expect.objectContaining({ valid: false }),
        lastValid: expect.objectContaining({
          valid: true,
          document: expect.objectContaining({ revision: 1 }),
          tree: { content: "valid" },
        }),
      }),
    );
    expect(scheduler.getLastValid("lesson.fake")?.document.revision).toBe(1);
  });

  it("cancels every pending document and rejects language mismatches", async () => {
    const scheduler = new ParsingScheduler({ debounceMs: 100 });
    const parser = createParser();
    const first = scheduler.schedule(createDocument(1, "first"), parser);
    const second = scheduler.schedule(
      { ...createDocument(1, "second"), path: "second.fake" },
      parser,
    );
    const firstRejection = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const secondRejection = expect(second).rejects.toMatchObject({ name: "AbortError" });

    scheduler.cancelAll();

    await Promise.all([firstRejection, secondRejection]);
    await expect(
      scheduler.schedule(
        { ...createDocument(1, "wrong"), languageId: "language.other" },
        parser,
      ),
    ).rejects.toThrow("cannot parse document language");
  });
});

function createParser(): SourceParser<{ content: string }> & {
  parse: ReturnType<typeof vi.fn<SourceParser<{ content: string }>["parse"]>>;
} {
  const parse = vi.fn(
    (document: SourceDocument): ParsedSourceDocument<{ content: string }> => ({
      document,
      tree: { content: document.content },
      valid: true,
      diagnostics: [],
    }),
  );
  return { languageId: "language.fake", parse };
}

function createDocument(revision: number, content: string): SourceDocument {
  return {
    path: "lesson.fake",
    languageId: "language.fake",
    content,
    revision,
  };
}
