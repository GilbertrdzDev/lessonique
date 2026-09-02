import type { SourceDocument, SourceOffsetRange } from "./contracts";

export interface SourceLineColumnRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export function offsetRangeToLineColumnRange(
  document: Pick<SourceDocument, "content">,
  range: SourceOffsetRange,
): SourceLineColumnRange {
  assertValidOffsetRange(document.content, range);
  const start = offsetToPosition(document.content, range.startOffset);
  const end = offsetToPosition(document.content, range.endOffset);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

function offsetToPosition(
  content: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

function assertValidOffsetRange(
  content: string,
  range: SourceOffsetRange,
): void {
  if (
    !Number.isInteger(range.startOffset) ||
    !Number.isInteger(range.endOffset) ||
    range.startOffset < 0 ||
    range.endOffset < range.startOffset ||
    range.endOffset > content.length
  ) {
    throw new RangeError("The source offset range is outside the document.");
  }
}
