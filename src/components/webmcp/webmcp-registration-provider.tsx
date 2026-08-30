"use client";

import { useEffect, useState, type ReactNode } from "react";

import { createEarlyWebMCPToolRegistry } from "@/core/webmcp/mock-handlers";
import { WebMCPProvider } from "@/core/webmcp/webmcp-provider";
import { createP0ProviderPlatform } from "@/providers/p0";

type WebMCPRegistrationProviderProps = Readonly<{
  children: ReactNode;
}>;

export function WebMCPRegistrationProvider({ children }: WebMCPRegistrationProviderProps) {
  const [provider] = useState(
    () =>
      new WebMCPProvider(
        createEarlyWebMCPToolRegistry(createP0ProviderPlatform()),
      ),
  );

  useEffect(() => {
    void provider.start().catch((error: unknown) => {
      console.error("WebMCP tool registration failed.", error);
    });
    return () => provider.stop();
  }, [provider]);

  return children;
}
