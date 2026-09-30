import { permanentRedirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

import ClassroomPage from "./page";

vi.mock("next/navigation", () => ({ permanentRedirect: vi.fn() }));

describe("ClassroomPage", () => {
  it("redirects the legacy classroom route to the root experience", () => {
    ClassroomPage();
    expect(permanentRedirect).toHaveBeenCalledWith("/");
  });
});
