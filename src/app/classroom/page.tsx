import { AgentSidebar } from "@/components/classroom/agent-sidebar";
import { AppShell } from "@/components/classroom/app-shell";
import { ClassroomHeader } from "@/components/classroom/classroom-header";
import { NavigationSidebar } from "@/components/classroom/navigation-sidebar";
import { ClassroomWorkspace } from "@/components/workspace/classroom-workspace";

export default function ClassroomPage() {
  return (
    <AppShell
      navigation={<NavigationSidebar />}
      header={<ClassroomHeader />}
      workspace={<ClassroomWorkspace />}
      agent={<AgentSidebar />}
    />
  );
}
