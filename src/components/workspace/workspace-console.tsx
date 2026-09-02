"use client";

import { useEffect, useRef } from "react";

import type { ConsoleSurfaceAdapter } from "@/adapters/console/console-surface-adapter";
import type { ConsoleEntry } from "@/core/workspace/contracts";
import { cn } from "@/lib/utils";

export type WorkspaceConsoleProps = Readonly<{
  adapter: ConsoleSurfaceAdapter;
  entries: readonly ConsoleEntry[];
}>;

export function WorkspaceConsole({ adapter, entries }: WorkspaceConsoleProps) {
  return (
    <div
      aria-label="Runtime console"
      className="flex h-full min-h-0 flex-col overflow-auto bg-[#0c0f1a] p-3 font-mono text-xs text-slate-200"
      role="log"
    >
      {entries.length === 0 ? (
        <div
          className="grid min-h-full flex-1 place-items-center px-4 text-center"
          data-slot="console-empty-state"
        >
          <p className="text-slate-400">Console output will appear here.</p>
        </div>
      ) : (
        <ol className="space-y-1.5" data-slot="console-entries">
          {entries.map((entry) => (
            <ConsoleLine adapter={adapter} entry={entry} key={entry.id} />
          ))}
        </ol>
      )}
    </div>
  );
}

function ConsoleLine({
  adapter,
  entry,
}: Readonly<{ adapter: ConsoleSurfaceAdapter; entry: ConsoleEntry }>) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const element = ref.current;
    return element
      ? adapter.registerEntryElement(entry.id, element)
      : undefined;
  }, [adapter, entry.id]);

  return (
    <li
      className={cn(
        "flex gap-2 rounded-md px-2 py-1",
        entry.kind === "warn" && "bg-amber-500/10 text-amber-200",
        entry.kind === "error" && "bg-red-500/10 text-red-200",
        (entry.kind === "build" || entry.kind === "runtime") &&
          "bg-violet-500/10 text-violet-200",
      )}
      data-console-entry-id={entry.id}
      ref={ref}
    >
      <span aria-hidden="true" className="w-14 shrink-0 text-slate-500">
        {entry.kind}
      </span>
      <span className="whitespace-pre-wrap break-words">{entry.message}</span>
    </li>
  );
}
