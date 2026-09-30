import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WebMCPRegistrationProvider } from "@/components/webmcp/webmcp-registration-provider";
import { WorkspaceRuntimeProvider } from "@/components/workspace/workspace-runtime-provider";

import { ExperienceHeader } from "./experience-header";
import { PrivacyProvider } from "@/components/privacy/privacy-provider";

describe("ExperienceHeader", () => {
  it("keeps Reset without duplicating the workspace runtime control", () => {
    const markup = renderToStaticMarkup(
      createElement(
        PrivacyProvider,
        null,
        createElement(
          WorkspaceRuntimeProvider,
          null,
          createElement(WebMCPRegistrationProvider, null, createElement(ExperienceHeader, { experienceState: "classroom" })),
        ),
      ),
    );

    expect(markup).toContain("Reset");
    expect(markup).not.toMatch(/>Run<\/button>/u);
  });
});
