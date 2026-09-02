import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";
import "tippy.js/animations/scale.css";
import "tippy.js/dist/tippy.css";

import { ThemeProvider } from "@/components/theme-provider";
import { ControlTooltipProvider } from "@/components/ui/control-tooltip-provider";
import { WebMCPRegistrationProvider } from "@/components/webmcp/webmcp-registration-provider";
import { WorkspaceRuntimeProvider } from "@/components/workspace/workspace-runtime-provider";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Lessonique",
  description: "An interactive learning platform assisted through WebMCP.",
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#f8f7fc", media: "(prefers-color-scheme: light)" },
    { color: "#16151f", media: "(prefers-color-scheme: dark)" },
  ],
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <ControlTooltipProvider>
            <WorkspaceRuntimeProvider>
              <WebMCPRegistrationProvider>{children}</WebMCPRegistrationProvider>
            </WorkspaceRuntimeProvider>
          </ControlTooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
