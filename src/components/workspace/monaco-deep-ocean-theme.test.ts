import { describe, expect, it } from "vitest";

import {
  LESSONIQUE_DEEP_OCEAN_BACKGROUND,
  LESSONIQUE_DEEP_OCEAN_THEME_ID,
  lessoniqueDeepOceanTheme,
} from "./monaco-deep-ocean-theme";

describe("Lessonique Deep Ocean Monaco theme", () => {
  it("extends the dark base with the approved ocean palette", () => {
    expect(LESSONIQUE_DEEP_OCEAN_THEME_ID).toBe("lessonique-deep-ocean");
    expect(lessoniqueDeepOceanTheme.base).toBe("vs-dark");
    expect(lessoniqueDeepOceanTheme.inherit).toBe(true);
    expect(lessoniqueDeepOceanTheme.colors["editor.background"]).toBe(
      LESSONIQUE_DEEP_OCEAN_BACKGROUND,
    );
    expect(lessoniqueDeepOceanTheme.colors["editorCursor.foreground"]).toBe(
      "#54D6D8",
    );
  });
});
