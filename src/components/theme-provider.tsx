"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export const themeProviderConfig = {
  attribute: "class",
  defaultTheme: "system",
  disableTransitionOnChange: true,
  enableColorScheme: true,
  enableSystem: true,
  storageKey: "lessonique-theme",
} as const;

type ThemeProviderProps = Readonly<{
  children: ReactNode;
}>;

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...themeProviderConfig}>
      {children}
    </NextThemesProvider>
  );
}
