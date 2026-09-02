import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WebMCPRegistrationProvider } from "@/components/webmcp/webmcp-registration-provider";
import { WorkspaceRuntimeProvider } from "@/components/workspace/workspace-runtime-provider";

import { ExperienceHeader } from "./experience-header";

describe("ExperienceHeader", () => {
  it("keeps Reset without duplicating the workspace runtime control", () => {
    const markup = renderToStaticMarkup(
      createElement(
        WorkspaceRuntimeProvider,
        null,
        createElement(
          WebMCPRegistrationProvider,
          null,
          createElement(ExperienceHeader, { experienceState: "classroom" }),
        ),
      ),
    );

    expect(markup).toContain("Reset");
    expect(markup).not.toMatch(/>Run<\/button>/u);
  });
});
