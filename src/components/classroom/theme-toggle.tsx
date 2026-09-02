"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      aria-label="Toggle color theme"
      data-tooltip="Toggle color theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      size="icon-sm"
      variant="ghost"
    >
      <Sun aria-hidden="true" className="size-4 dark:hidden" />
      <Moon aria-hidden="true" className="hidden size-4 dark:block" />
    </Button>
  );
}
