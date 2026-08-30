export type LearningStepState = "complete" | "current" | "upcoming";

export type LearningStep = Readonly<{
  id: string;
  label: string;
  state: LearningStepState;
}>;

export type ActivityKind =
  | "connection"
  | "explanation"
  | "file"
  | "lesson"
  | "preview"
  | "request";

export type ActivityEvent = Readonly<{
  id: string;
  kind: ActivityKind;
  label: string;
  occurredAt: string;
}>;

export type TechnologyCapability = Readonly<{
  id: string;
  label: string;
  shortLabel: string;
}>;

export type ToolCapability = Readonly<{
  id: string;
  label: string;
}>;

export const classroomHeaderMock = {
  connectionDetail: "Secure and active channel",
  connectionLabel: "Connected through WebMCP",
  requestDetail: "Guided session led by ChatGPT",
  requestLabel: "Request received from ChatGPT",
  technologies: [
    { id: "language.html", label: "HTML", shortLabel: "HTML" },
    { id: "language.css", label: "CSS", shortLabel: "CSS" },
    {
      id: "language.javascript",
      label: "JavaScript",
      shortLabel: "JS",
    },
  ] satisfies readonly TechnologyCapability[],
} as const;

export const learningPlanMock = [
  { id: "understand", label: "Understand the objective", state: "complete" },
  { id: "structure", label: "Create the HTML structure", state: "current" },
  { id: "styles", label: "Apply CSS styles", state: "upcoming" },
  { id: "interaction", label: "Add JavaScript interaction", state: "upcoming" },
  { id: "verify", label: "Test and refine", state: "upcoming" },
  { id: "summary", label: "Review and next challenge", state: "upcoming" },
] satisfies readonly LearningStep[];

export const activityFeedMock = [
  {
    id: "request-read",
    kind: "request",
    label: "Reading the request from ChatGPT",
    occurredAt: "2026-08-29T10:24:31-05:00",
  },
  {
    id: "webmcp-connected",
    kind: "connection",
    label: "Connected through WebMCP",
    occurredAt: "2026-08-29T10:24:31-05:00",
  },
  {
    id: "index-created",
    kind: "file",
    label: "Preparing index.html",
    occurredAt: "2026-08-29T10:24:36-05:00",
  },
  {
    id: "lesson-started",
    kind: "lesson",
    label: "Starting the HTML structure",
    occurredAt: "2026-08-29T10:24:48-05:00",
  },
  {
    id: "preview-opened",
    kind: "preview",
    label: "Opening the live preview",
    occurredAt: "2026-08-29T10:25:28-05:00",
  },
  {
    id: "result-explained",
    kind: "explanation",
    label: "Explaining the result",
    occurredAt: "2026-08-29T10:25:31-05:00",
  },
] satisfies readonly ActivityEvent[];

export const toolCapabilitiesMock = [
  { id: "surface.editor", label: "Editor" },
  { id: "surface.preview", label: "Preview" },
  { id: "surface.console", label: "Console" },
  { id: "surface.inspector", label: "Inspector" },
  { id: "surface.files", label: "Files" },
] satisfies readonly ToolCapability[];
