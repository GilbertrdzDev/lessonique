import type { WebMCPProviderStatus } from "@/core/webmcp/webmcp-provider";

export type WebMCPAvailability = "detecting" | "ready" | "unsupported";

export type WebMCPAvailabilityPresentation = Readonly<{
  activityLabel: string;
  activityStatusLabel: string;
  agentDetail: string;
  capabilitiesDetail: string;
  capabilitiesLabel: string;
  connectionDetail: string;
  connectionLabel: string;
  planDetail: string;
  requestDetail: string;
  requestLabel: string;
  statusDetail: string;
  statusTitle: string;
}>;

const WEBMCP_AVAILABILITY_PRESENTATION: Readonly<
  Record<WebMCPAvailability, WebMCPAvailabilityPresentation>
> = {
  detecting: {
    activityLabel: "Detecting WebMCP browser support",
    activityStatusLabel: "Detection in progress",
    agentDetail: "Checking WebMCP availability",
    capabilitiesDetail: "Waiting for browser detection",
    capabilitiesLabel: "Detecting Capabilities",
    connectionDetail: "Checking browser support and tool access",
    connectionLabel: "Detecting WebMCP",
    planDetail: "The guided plan will appear after WebMCP is ready.",
    requestDetail: "Checking whether a guided session can start",
    requestLabel: "Waiting for WebMCP",
    statusDetail: "Checking whether classroom tools can be registered.",
    statusTitle: "Detecting WebMCP",
  },
  ready: {
    activityLabel: "Connected through WebMCP",
    activityStatusLabel: "Connected",
    agentDetail: "Guided session through ChatGPT",
    capabilitiesDetail: "Available through WebMCP",
    capabilitiesLabel: "Detected Capabilities",
    connectionDetail: "Secure and active channel",
    connectionLabel: "Connected through WebMCP",
    planDetail: "The guided plan is ready.",
    requestDetail: "Guided session led by ChatGPT",
    requestLabel: "Request received from ChatGPT",
    statusDetail: "Classroom tools are available for this guided session.",
    statusTitle: "WebMCP Ready",
  },
  unsupported: {
    activityLabel: "WebMCP is unsupported in this browser",
    activityStatusLabel: "Unsupported",
    agentDetail: "Guided sessions are unavailable in this browser",
    capabilitiesDetail: "WebMCP browser support is required",
    capabilitiesLabel: "Capabilities Unavailable",
    connectionDetail: "This browser does not expose an available WebMCP connection",
    connectionLabel: "WebMCP Unsupported",
    planDetail: "Use a browser with WebMCP support to start a guided plan.",
    requestDetail: "This browser cannot start a WebMCP session",
    requestLabel: "No WebMCP Session",
    statusDetail: "Use a browser with WebMCP support to connect classroom tools.",
    statusTitle: "WebMCP Unsupported",
  },
};

export function getWebMCPAvailabilityPresentation(
  availability: WebMCPAvailability,
): WebMCPAvailabilityPresentation {
  return WEBMCP_AVAILABILITY_PRESENTATION[availability];
}

export function resolveWebMCPAvailability(
  status: WebMCPProviderStatus,
): WebMCPAvailability {
  if (status === "ready") return "ready";
  if (status === "unavailable" || status === "failed") return "unsupported";
  return "detecting";
}
