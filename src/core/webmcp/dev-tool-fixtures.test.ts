import { describe, expect, it } from "vitest";

import {
  DEV_TOOL_FIXTURE_ORDER,
  DEV_TOOL_FIXTURES,
} from "./dev-tool-fixtures";
import { WEBMCP_TOOL_INPUT_SCHEMAS } from "./schemas";
import { WEBMCP_TOOL_NAMES } from "./tool-names";

describe("WebMCP Dev Panel fixtures", () => {
  it("provides one closed-schema fixture for every public tool", () => {
    expect(DEV_TOOL_FIXTURE_ORDER).toHaveLength(WEBMCP_TOOL_NAMES.length);
    expect(new Set(DEV_TOOL_FIXTURE_ORDER)).toEqual(
      new Set(WEBMCP_TOOL_NAMES),
    );
    WEBMCP_TOOL_NAMES.forEach((toolName) => {
      expect(() =>
        WEBMCP_TOOL_INPUT_SCHEMAS[toolName].parse(
          DEV_TOOL_FIXTURES[toolName],
        ),
      ).not.toThrow();
    });
  });

  it("includes semantic target, companion, structured guide, and local wait coverage", () => {
    const fixture = DEV_TOOL_FIXTURES.play_teaching_scene;

    expect(fixture.beats[0]).toEqual(
      expect.objectContaining({
        target: {
          resolverId: "target.surface-anchor",
          input: { anchorId: "anchor.learning-plan" },
        },
        assistant: expect.objectContaining({
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
        }),
        guide: expect.objectContaining({
          supportingItems: [
            "Provider-neutral target",
            "Structured visual content",
          ],
        }),
        wait: expect.objectContaining({ kind: "interaction" }),
      }),
    );
    expect(JSON.stringify(fixture)).not.toMatch(
      /selector|xpath|dompath|coordinates|voice|audio|speech|ssml/iu,
    );
  });
});
