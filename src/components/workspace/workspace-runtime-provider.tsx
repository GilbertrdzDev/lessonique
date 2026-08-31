"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { AssistantOverlayHost } from "@/components/scene/assistant-overlay-host";

import {
  createP0WorkspaceRuntime,
  type P0WorkspaceRuntime,
} from "@/providers/p0";

const WorkspaceRuntimeContext = createContext<P0WorkspaceRuntime | null>(null);

export function WorkspaceRuntimeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [workspace] = useState(createP0WorkspaceRuntime);
  return (
    <WorkspaceRuntimeContext.Provider value={workspace}>
      {children}
      <AssistantOverlayHost presentationStore={workspace.scene.presentation} />
    </WorkspaceRuntimeContext.Provider>
  );
}

export function useWorkspaceRuntime(): P0WorkspaceRuntime {
  const workspace = useContext(WorkspaceRuntimeContext);
  if (!workspace) {
    throw new Error("WorkspaceRuntimeProvider is required.");
  }
  return workspace;
}
