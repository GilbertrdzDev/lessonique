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
import type { AgentConnectionStatus } from "@/features/classroom/experience-state";
import { createP0WebMCPToolRegistry } from "@/providers/p0";

import {
  resolveWebMCPAvailability,
  type WebMCPAvailability,
} from "./webmcp-availability";

type WebMCPRegistrationProviderProps = Readonly<{
  children: ReactNode;
}>;

export type AgentConnection = Readonly<{
  status: AgentConnectionStatus;
  connectedAt?: string;
}>;

type WebMCPRuntime = Readonly<{
  agentConnection: AgentConnection;
  availability: WebMCPAvailability;
  provider: WebMCPProvider;
  registry: ToolRegistry;
}>;

type RegisteredWebMCPRuntime = Pick<WebMCPRuntime, "provider" | "registry">;

const WebMCPRuntimeContext = createContext<WebMCPRuntime | null>(null);

export function WebMCPRegistrationProvider({ children }: WebMCPRegistrationProviderProps) {
  const workspace = useWorkspaceRuntime();
  const [agentConnection, setAgentConnection] = useState<AgentConnection>({
    status: "disconnected",
  });
  const [runtime] = useState<RegisteredWebMCPRuntime>(() => {
    const registry = createP0WebMCPToolRegistry(workspace);
    const provider = new WebMCPProvider(registry, undefined, () => {
      setAgentConnection((current) =>
        current.status === "connected"
          ? current
          : { status: "connected", connectedAt: new Date().toISOString() },
      );
    });
    return { registry, provider };
  });
  const [availability, setAvailability] =
    useState<WebMCPAvailability>("detecting");

  useEffect(() => {
    let isCurrent = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleSupportProbe = () => {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => void synchronizeRegistration(), 2_500);
    };
    const synchronizeRegistration = async () => {
      if (!isCurrent) return;
      if (
        runtime.provider.status === "ready" &&
        !runtime.provider.hasBrowserSurface()
      ) {
        runtime.provider.stop();
        setAvailability("unsupported");
        setAgentConnection({ status: "disconnected" });
        scheduleSupportProbe();
        return;
      }
      try {
        const status = await runtime.provider.start();
        if (!isCurrent) return;
        setAvailability(resolveWebMCPAvailability(status));
        if (status === "unavailable") {
          setAgentConnection({ status: "disconnected" });
          scheduleSupportProbe();
        }
      } catch (error: unknown) {
        if (!isCurrent) return;
        setAvailability("unsupported");
        setAgentConnection({ status: "disconnected" });
        console.error("WebMCP tool registration failed.", error);
        scheduleSupportProbe();
      }
    };
    const handlePotentialAvailabilityChange = () => {
      if (document.visibilityState === "hidden") return;
      clearTimeout(retryTimer);
      void synchronizeRegistration();
    };

    window.addEventListener("focus", handlePotentialAvailabilityChange);
    window.addEventListener("pageshow", handlePotentialAvailabilityChange);
    document.addEventListener(
      "visibilitychange",
      handlePotentialAvailabilityChange,
    );
    void synchronizeRegistration();
    return () => {
      isCurrent = false;
      clearTimeout(retryTimer);
      window.removeEventListener("focus", handlePotentialAvailabilityChange);
      window.removeEventListener("pageshow", handlePotentialAvailabilityChange);
      document.removeEventListener(
        "visibilitychange",
        handlePotentialAvailabilityChange,
      );
      runtime.provider.stop();
    };
  }, [runtime]);

  return (
    <WebMCPRuntimeContext.Provider
      value={{ ...runtime, agentConnection, availability }}
    >
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
