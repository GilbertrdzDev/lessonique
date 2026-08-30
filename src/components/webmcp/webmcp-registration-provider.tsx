"use client";

import { useEffect, useState, type ReactNode } from "react";

import { useWorkspaceRuntime } from "@/components/workspace/workspace-runtime-provider";
import { createEarlyWebMCPToolRegistry } from "@/core/webmcp/mock-handlers";
import { WebMCPProvider } from "@/core/webmcp/webmcp-provider";

type WebMCPRegistrationProviderProps = Readonly<{
  children: ReactNode;
}>;

export function WebMCPRegistrationProvider({ children }: WebMCPRegistrationProviderProps) {
  const workspace = useWorkspaceRuntime();
  const [provider] = useState(
    () =>
      new WebMCPProvider(
        createEarlyWebMCPToolRegistry(workspace.registries, {
          workspaceController: workspace.controller,
          createGuidedLesson: workspace.createGuidedLesson,
          resetClassroom: workspace.resetClassroom,
          lessonState: workspace.lessonStore,
          workspaceState: workspace.store,
          classroomLifecycle: workspace.classroomLifecycle,
          codeIntelligence: workspace.codeIntelligence.service,
          diagnostics: workspace.codeIntelligence.diagnostics,
          validationResults: workspace.validation.results,
        }),
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
