import { cn } from "@/lib/utils";

export type InlineCodeTextProps = Readonly<{
  text: string;
  codeClassName?: string;
  dataSlot?: string;
}>;

export function InlineCodeText({
  text,
  codeClassName,
  dataSlot = "inline-code",
}: InlineCodeTextProps) {
  const segments: Array<
    | { kind: "code"; text: string; offset: number }
    | { kind: "text"; text: string }
  > = [];
  const pattern = /`([^`\r\n]+)`/gu;
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const offset = match.index;
    if (offset > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, offset) });
    }
    segments.push({ kind: "code", text: match[1] ?? "", offset });
    cursor = offset + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }

  return segments.map((segment) =>
    segment.kind === "code" ? (
      <code
        className={cn(
          "break-words rounded-md border border-primary/20 bg-primary/10 px-1 py-0.5 font-mono text-[0.92em] font-semibold text-primary",
          codeClassName,
        )}
        data-slot={dataSlot}
        key={`code-${segment.offset}`}
      >
        {segment.text}
      </code>
    ) : (
      segment.text
    ),
  );
}
