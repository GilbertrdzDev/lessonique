import { describe, expect, it } from "vitest";

import {
  LESSONIQUE_DAYLIGHT_THEME_ID,
  lessoniqueDaylightTheme,
} from "./monaco-daylight-theme";

describe("lessoniqueDaylightTheme", () => {
  it("uses an accessible provider-owned light palette", () => {
    expect(LESSONIQUE_DAYLIGHT_THEME_ID).toBe("lessonique-daylight");
    expect(lessoniqueDaylightTheme.base).toBe("vs");
    expect(lessoniqueDaylightTheme.inherit).toBe(true);
    expect(lessoniqueDaylightTheme.colors["editor.background"]).toBe(
      "#FFFFFF",
    );
    expect(lessoniqueDaylightTheme.rules).toContainEqual({
      token: "tag",
      foreground: "B42318",
    });
    expect(lessoniqueDaylightTheme.rules).toContainEqual({
      token: "metatag",
      foreground: "4B5563",
    });
    expect(lessoniqueDaylightTheme.rules).toContainEqual({
      token: "metatag.html",
      foreground: "4B5563",
    });
    expect(lessoniqueDaylightTheme.rules).toContainEqual({
      token: "attribute.name.html",
      foreground: "B42318",
    });
  });
});
