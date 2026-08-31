"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useWorkspaceRuntime } from "@/components/workspace/workspace-runtime-provider";
import type { ToolRegistry } from "@/core/webmcp";
import { WebMCPProvider } from "@/core/webmcp/webmcp-provider";
import { createP0WebMCPToolRegistry } from "@/providers/p0";

type WebMCPRegistrationProviderProps = Readonly<{
  children: ReactNode;
}>;

type WebMCPRuntime = Readonly<{
  provider: WebMCPProvider;
  registry: ToolRegistry;
}>;

const WebMCPRuntimeContext = createContext<WebMCPRuntime | null>(null);

export function WebMCPRegistrationProvider({ children }: WebMCPRegistrationProviderProps) {
  const workspace = useWorkspaceRuntime();
  const [runtime] = useState<WebMCPRuntime>(() => {
    const registry = createP0WebMCPToolRegistry(workspace);
    return { registry, provider: new WebMCPProvider(registry) };
  });

  useEffect(() => {
    void runtime.provider.start().catch((error: unknown) => {
      console.error("WebMCP tool registration failed.", error);
    });
    return () => runtime.provider.stop();
  }, [runtime]);

  return (
    <WebMCPRuntimeContext.Provider value={runtime}>
      {children}
    </WebMCPRuntimeContext.Provider>
  );
}

export function useWebMCPRuntime(): WebMCPRuntime {
  const runtime = useContext(WebMCPRuntimeContext);
  if (!runtime) {
    throw new Error("WebMCPRegistrationProvider is required.");
  }
  return runtime;
}
