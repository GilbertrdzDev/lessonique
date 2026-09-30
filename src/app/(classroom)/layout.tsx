import type { ReactNode } from "react";

import { ControlTooltipProvider } from "@/components/ui/control-tooltip-provider";
import { WebMCPRegistrationProvider } from "@/components/webmcp/webmcp-registration-provider";
import { WorkspaceRuntimeProvider } from "@/components/workspace/workspace-runtime-provider";

export default function ClassroomLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ControlTooltipProvider>
      <WorkspaceRuntimeProvider>
        <WebMCPRegistrationProvider>{children}</WebMCPRegistrationProvider>
      </WorkspaceRuntimeProvider>
    </ControlTooltipProvider>
  );
}
