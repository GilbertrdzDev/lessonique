import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ASSETS = [
  "lessonique-companion-normal.png",
  "lessonique-companion-incompatible.png",
] as const;
const STYLESHEET = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);
const COMPACT_STYLESHEET = STYLESHEET.replace(/\s+/gu, " ");

describe("Lessonique companion assets", () => {
  it.each(ASSETS)("keeps %s square with a real alpha channel", (filename) => {
    const bytes = readFileSync(
      join(process.cwd(), "public", "images", "companion", filename),
    );

    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1254);
    expect(bytes.readUInt32BE(20)).toBe(1254);
    expect(bytes.readUInt8(25)).toBe(6);
  });

  it("uses a distinct failure treatment without replacing the reusable renderer", () => {
    const normal = readFileSync(
      join(
        process.cwd(),
        "public",
        "images",
        "companion",
        ASSETS[0],
      ),
    );
    const incompatible = readFileSync(
      join(
        process.cwd(),
        "public",
        "images",
        "companion",
        ASSETS[1],
      ),
    );

    expect(normal.equals(incompatible)).toBe(false);
  });

  it("times the incompatible character layers independently", () => {
    const independentAnimations = [
      "lessonique-companion-error-body-float 4.9s",
      "lessonique-companion-error-shadow 4.9s",
      "lessonique-companion-error-ring-upper 2.65s",
      "lessonique-companion-error-ring-lower 3.17s",
      "lessonique-companion-error-left-limb 4.15s",
      "lessonique-companion-error-right-limb 4.75s",
      "lessonique-companion-error-blink-left 5.83s",
      "lessonique-companion-error-blink-right 4.67s",
      "lessonique-companion-error-eye-look 5.29s",
      "lessonique-companion-error-eye-glitch 3.71s",
      "lessonique-companion-error-body-slice-a 6.13s",
      "lessonique-companion-error-body-slice-b 7.07s",
      "lessonique-companion-error-body-slice-c 5.47s",
      "lessonique-companion-error-interference-a 2.83s",
      "lessonique-companion-error-interference-b 3.47s",
      "lessonique-companion-error-interference-c 4.11s",
      "lessonique-companion-error-interference-d 3.19s",
    ];

    independentAnimations.forEach((animation) => {
      expect(STYLESHEET).toContain(`animation: ${animation}`);
    });
  });

  it("shares hover waves and the normal grounded shadow across visual states", () => {
    expect(COMPACT_STYLESHEET).toContain(
      '--companion-layer-asset: url("/images/companion/lessonique-companion-normal.png")',
    );
    expect(COMPACT_STYLESHEET).toContain(
      '.lessonique-companion[data-companion-visual-state="incompatible"] { --companion-layer-asset: url("/images/companion/lessonique-companion-incompatible.png"); }',
    );
    expect(COMPACT_STYLESHEET).toContain(
      '.lessonique-companion .companion-ground-shadow { z-index: 0; background-image: url("/images/companion/lessonique-companion-normal.png");',
    );
    expect(COMPACT_STYLESHEET).toContain(
      ".lessonique-companion .companion-hover-ring-upper {",
    );
    expect(COMPACT_STYLESHEET).toContain(
      ".lessonique-companion .companion-hover-ring-lower {",
    );
    expect(COMPACT_STYLESHEET).toContain(
      ".lessonique-companion .companion-hover-spark {",
    );
  });

  it("keeps the failure composition static under reduced motion", () => {
    const reducedMotionSection = STYLESHEET.slice(
      STYLESHEET.indexOf("@media (prefers-reduced-motion: reduce)"),
    );

    [
      ".companion-character-stage",
      ".companion-ground-shadow",
      ".companion-hover-ring",
      ".companion-limb-layer",
      ".companion-body-glitch-slice",
      ".companion-eye-glimmer",
      ".companion-interference-slice",
    ].forEach((selector) => expect(reducedMotionSection).toContain(selector));
    expect(reducedMotionSection).toContain("animation: none !important");
    expect(reducedMotionSection).toContain(".companion-hover-ring-upper");
    expect(reducedMotionSection).toContain(".companion-signal-fragment");
  });
});
