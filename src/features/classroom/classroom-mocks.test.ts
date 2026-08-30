import { describe, expect, it } from "vitest";

import {
  activityFeedMock,
  classroomHeaderMock,
  learningPlanMock,
  toolCapabilitiesMock,
} from "./classroom-mocks";

describe("classroom mocks", () => {
  it("uses unique extensible identifiers", () => {
    const identifiers = [
      ...classroomHeaderMock.technologies.map((item) => item.id),
      ...learningPlanMock.map((item) => item.id),
      ...activityFeedMock.map((item) => item.id),
      ...toolCapabilitiesMock.map((item) => item.id),
    ];

    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it("has exactly one current learning step", () => {
    expect(learningPlanMock.filter((step) => step.state === "current")).toHaveLength(1);
  });
});
