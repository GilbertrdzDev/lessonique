import { describe, expect, it } from "vitest";

import type { WorkspaceFile } from "./contracts";
import {
  deriveWorkspaceDirectories,
  getWorkspaceEntryName,
  getWorkspaceParentPath,
  isSameOrDescendantPath,
  replaceWorkspacePathPrefix,
} from "./workspace-entry-paths";

describe("workspace entry paths", () => {
  it("derives stable ancestors from files and empty directories", () => {
    const files: WorkspaceFile[] = [
      {
        path: "src/components/card.js",
        languageId: "language.javascript",
        content: "",
        visible: true,
      },
    ];

    expect(deriveWorkspaceDirectories(files, ["assets/icons"])).toEqual([
      "assets",
      "assets/icons",
      "src",
      "src/components",
    ]);
  });

  it("recognizes and rewrites complete path segments", () => {
    expect(isSameOrDescendantPath("src/card.js", "src")).toBe(true);
    expect(isSameOrDescendantPath("src-old/card.js", "src")).toBe(false);
    expect(replaceWorkspacePathPrefix("src/card.js", "src", "ui")).toBe(
      "ui/card.js",
    );
    expect(getWorkspaceParentPath("ui/card.js")).toBe("ui");
    expect(getWorkspaceEntryName("ui/card.js")).toBe("card.js");
  });
});
