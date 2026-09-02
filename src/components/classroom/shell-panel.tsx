import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function ShellPanel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-[1.25rem] border bg-card text-card-foreground shadow-panel",
        className,
      )}
      data-slot="shell-panel"
      {...props}
    />
  );
}
