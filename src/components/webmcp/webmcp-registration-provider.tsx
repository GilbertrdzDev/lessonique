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

import {
  resolveWebMCPAvailability,
  type WebMCPAvailability,
} from "./webmcp-availability";

type WebMCPRegistrationProviderProps = Readonly<{
  children: ReactNode;
}>;

type WebMCPRuntime = Readonly<{
  availability: WebMCPAvailability;
  provider: WebMCPProvider;
  registry: ToolRegistry;
}>;

const WebMCPRuntimeContext = createContext<WebMCPRuntime | null>(null);

export function WebMCPRegistrationProvider({ children }: WebMCPRegistrationProviderProps) {
  const workspace = useWorkspaceRuntime();
  const [runtime] = useState<Omit<WebMCPRuntime, "availability">>(() => {
    const registry = createP0WebMCPToolRegistry(workspace);
    return { registry, provider: new WebMCPProvider(registry) };
  });
  const [availability, setAvailability] =
    useState<WebMCPAvailability>("detecting");

  useEffect(() => {
    let isCurrent = true;
    void runtime.provider
      .start()
      .then((status) => {
        if (isCurrent) setAvailability(resolveWebMCPAvailability(status));
      })
      .catch((error: unknown) => {
        if (isCurrent) setAvailability("unsupported");
        console.error("WebMCP tool registration failed.", error);
      });
    return () => {
      isCurrent = false;
      runtime.provider.stop();
    };
  }, [runtime]);

  return (
    <WebMCPRuntimeContext.Provider value={{ ...runtime, availability }}>
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
