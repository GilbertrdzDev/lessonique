import { describe, expect, it } from "vitest";

import { offsetRangeToLineColumnRange } from "./offset-range";

describe("offsetRangeToLineColumnRange", () => {
  it("converts zero-based source offsets to one-based editor positions", () => {
    const content = "<main>\r\n  <button>Run</button>\r\n</main>";
    const startOffset = content.indexOf("<button>");
    const endOffset = startOffset + "<button>Run</button>".length;

    expect(
      offsetRangeToLineColumnRange(
        { content },
        { startOffset, endOffset },
      ),
    ).toEqual({
      startLine: 2,
      startColumn: 3,
      endLine: 2,
      endColumn: 23,
    });
  });

  it("rejects ranges outside the document", () => {
    expect(() =>
      offsetRangeToLineColumnRange(
        { content: "short" },
        { startOffset: 2, endOffset: 10 },
      ),
    ).toThrow("outside the document");
  });
});
