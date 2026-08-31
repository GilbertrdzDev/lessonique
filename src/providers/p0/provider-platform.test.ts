import { describe, expect, it } from "vitest";

import { CapabilityCatalog } from "@/core/platform/capability-catalog";
import { ProviderPlatformRegistries } from "@/core/platform/registries";

import {
  createP0ProviderPlatform,
  P0_ENVIRONMENT_ACTION_IDS,
  P0_ENVIRONMENT_PROFILE_IDS,
  P0_LANGUAGE_IDS,
  P0_RUNTIME_PROVIDER_IDS,
  P0_SURFACE_IDS,
  registerP0ProviderPlatform,
} from "./provider-platform";

describe("P0 provider platform", () => {
  it("registers the three vanilla languages and Sandpack runtime", () => {
    const registries = createP0ProviderPlatform();

    expect(registries.languages.list()).toEqual([
      expect.objectContaining({
        id: P0_LANGUAGE_IDS.html,
        extensions: [".html"],
        monacoLanguageId: "html",
      }),
      expect.objectContaining({
        id: P0_LANGUAGE_IDS.css,
        extensions: [".css"],
        monacoLanguageId: "css",
      }),
      expect.objectContaining({
        id: P0_LANGUAGE_IDS.javascript,
        extensions: [".js"],
        monacoLanguageId: "javascript",
      }),
    ]);
    expect(
      registries.runtimes.require(P0_RUNTIME_PROVIDER_IDS.sandpackVanilla),
    ).toEqual(
      expect.objectContaining({
        supportedLanguageIds: [
          P0_LANGUAGE_IDS.html,
          P0_LANGUAGE_IDS.css,
          P0_LANGUAGE_IDS.javascript,
        ],
        capabilities: expect.objectContaining({
          preview: true,
          console: true,
          run: true,
          terminal: false,
          packages: false,
          network: false,
        }),
      }),
    );
  });

  it("describes each P0 surface through registered modes and options", () => {
    const registries = createP0ProviderPlatform();
    const capabilities = new CapabilityCatalog(registries).getCapabilities();

    expect(capabilities.surfaces.map(({ id }) => id)).toEqual([
      P0_SURFACE_IDS.editor,
      P0_SURFACE_IDS.preview,
      P0_SURFACE_IDS.console,
      P0_SURFACE_IDS.values,
      P0_SURFACE_IDS.plan,
      P0_SURFACE_IDS.activity,
      P0_SURFACE_IDS.reference,
    ]);
    expect(
      capabilities.surfaces.find(({ id }) => id === P0_SURFACE_IDS.editor),
    ).toEqual(
      expect.objectContaining({
        modes: ["code", "read_only"],
        placements: ["main"],
        configurationOptions: [
          expect.objectContaining({
            id: "editor.word-wrap",
            valueType: "boolean",
          }),
          expect.objectContaining({
            id: "editor.minimap",
            valueType: "boolean",
          }),
          expect.objectContaining({
            id: "editor.font-size",
            valueType: "number",
            minimum: 12,
            maximum: 24,
          }),
        ],
        actions: [P0_ENVIRONMENT_ACTION_IDS.focusEditor],
      }),
    );
    expect(
      capabilities.surfaces.find(({ id }) => id === P0_SURFACE_IDS.preview),
    ).toEqual(
      expect.objectContaining({
        modes: ["desktop", "tablet", "mobile"],
        placements: ["main", "bottom"],
        actions: [P0_ENVIRONMENT_ACTION_IDS.reloadPreview],
      }),
    );
  });

  it("registers both V1 profiles with their required languages and surfaces", () => {
    const registries = createP0ProviderPlatform();
    const catalog = new CapabilityCatalog(registries);
    const vanillaWeb = catalog.getCapabilities({
      profileId: P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb,
    });
    const javascriptConsole = catalog.getCapabilities({
      profileId: P0_ENVIRONMENT_PROFILE_IDS.javascriptConsole,
    });

    expect(vanillaWeb.environmentProfiles).toEqual([
      expect.objectContaining({
        id: P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb,
        languageIds: [
          P0_LANGUAGE_IDS.html,
          P0_LANGUAGE_IDS.css,
          P0_LANGUAGE_IDS.javascript,
        ],
        surfaceIds: [
          P0_SURFACE_IDS.editor,
          P0_SURFACE_IDS.preview,
          P0_SURFACE_IDS.console,
          P0_SURFACE_IDS.plan,
          P0_SURFACE_IDS.activity,
          P0_SURFACE_IDS.reference,
        ],
      }),
    ]);
    expect(vanillaWeb.surfaces.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        P0_SURFACE_IDS.editor,
        P0_SURFACE_IDS.preview,
        P0_SURFACE_IDS.console,
      ]),
    );
    expect(javascriptConsole.environmentProfiles).toEqual([
      expect.objectContaining({
        id: P0_ENVIRONMENT_PROFILE_IDS.javascriptConsole,
        languageIds: [P0_LANGUAGE_IDS.javascript],
        surfaceIds: [
          P0_SURFACE_IDS.editor,
          P0_SURFACE_IDS.console,
          P0_SURFACE_IDS.values,
          P0_SURFACE_IDS.plan,
          P0_SURFACE_IDS.activity,
          P0_SURFACE_IDS.reference,
        ],
      }),
    ]);
    expect(javascriptConsole.languages.map(({ id }) => id)).toEqual([
      P0_LANGUAGE_IDS.javascript,
    ]);
    expect(javascriptConsole.surfaces.map(({ id }) => id)).not.toContain(
      P0_SURFACE_IDS.preview,
    );
  });

  it("provides valid default files and primary surfaces for each profile", () => {
    const registries = createP0ProviderPlatform();
    const vanillaWeb = registries.environmentProfiles.require(
      P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb,
    );
    const javascriptConsole = registries.environmentProfiles.require(
      P0_ENVIRONMENT_PROFILE_IDS.javascriptConsole,
    );

    expect(
      vanillaWeb.defaultFiles.map(({ path, languageId }) => ({
        path,
        languageId,
      })),
    ).toEqual([
      { path: "index.html", languageId: P0_LANGUAGE_IDS.html },
      { path: "styles.css", languageId: P0_LANGUAGE_IDS.css },
      { path: "script.js", languageId: P0_LANGUAGE_IDS.javascript },
    ]);
    expect(
      vanillaWeb.defaultSurfaces
        .filter(({ visible }) => visible)
        .map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining([
        P0_SURFACE_IDS.editor,
        P0_SURFACE_IDS.preview,
        P0_SURFACE_IDS.console,
      ]),
    );
    expect(javascriptConsole.defaultFiles).toEqual([
      expect.objectContaining({
        path: "script.js",
        languageId: P0_LANGUAGE_IDS.javascript,
      }),
    ]);
    expect(
      javascriptConsole.defaultSurfaces
        .filter(({ visible }) => visible)
        .map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining([P0_SURFACE_IDS.editor, P0_SURFACE_IDS.console]),
    );
  });

  it("derives a visual-only P0 capability snapshot from the registries", () => {
    const capabilities = new CapabilityCatalog(
      createP0ProviderPlatform(),
    ).getCapabilities();

    expect(capabilities.environmentProfiles.map(({ id }) => id)).toEqual([
      P0_ENVIRONMENT_PROFILE_IDS.vanillaWeb,
      P0_ENVIRONMENT_PROFILE_IDS.javascriptConsole,
    ]);
    expect(capabilities.actions.map(({ id }) => id)).toEqual([
      P0_ENVIRONMENT_ACTION_IDS.run,
      P0_ENVIRONMENT_ACTION_IDS.stop,
      P0_ENVIRONMENT_ACTION_IDS.restart,
      P0_ENVIRONMENT_ACTION_IDS.clearConsole,
      P0_ENVIRONMENT_ACTION_IDS.focusEditor,
      P0_ENVIRONMENT_ACTION_IDS.reloadPreview,
    ]);
    expect(JSON.stringify(capabilities)).not.toMatch(
      /voice|audio|narration|speech|synthesis|ssml|playback/iu,
    );
  });

  it("registers into a caller-owned platform without changing core registries", () => {
    const registries = new ProviderPlatformRegistries();

    expect(registerP0ProviderPlatform(registries)).toBe(registries);
    expect(registries.languages.list()).toHaveLength(3);
    expect(registries.runtimes.list()).toHaveLength(1);
    expect(registries.environmentProfiles.list()).toHaveLength(2);
  });
});
