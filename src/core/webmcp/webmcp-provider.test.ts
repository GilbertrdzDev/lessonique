import { describe, expect, it, vi } from "vitest";

import { createP0ProviderPlatform } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";
import type { BrowserModelContext, BrowserWebMCPTool } from "./webmcp-provider";
import { WebMCPProvider } from "./webmcp-provider";
import { WEBMCP_TOOL_NAMES } from "./tool-names";

describe("WebMCPProvider", () => {
  it("registers every tool on one model context and unregisters through one abort signal", async () => {
    const tools: BrowserWebMCPTool[] = [];
    const signals: AbortSignal[] = [];
    const modelContext: BrowserModelContext = {
      registerTool: vi.fn(async (tool, options) => {
        tools.push(tool);
        if (options?.signal) signals.push(options.signal);
      }),
    };
    const provider = new WebMCPProvider(
      createEarlyWebMCPToolRegistry(createP0ProviderPlatform()),
      () => modelContext,
    );

    await expect(provider.start()).resolves.toBe("ready");
    expect(tools.map(({ name }) => name)).toEqual(WEBMCP_TOOL_NAMES);
    expect(tools.every(({ inputSchema }) => inputSchema.additionalProperties === false)).toBe(
      true,
    );
    await expect(tools[0]?.execute({ include: ["limits"] })).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ limits: expect.any(Object) }),
      }),
    );

    provider.stop();
    expect(provider.status).toBe("stopped");
    expect(signals).toHaveLength(WEBMCP_TOOL_NAMES.length);
    expect(signals.every(({ aborted }) => aborted)).toBe(true);
  });

  it("keeps the application functional when WebMCP is unavailable", async () => {
    const provider = new WebMCPProvider(
      createEarlyWebMCPToolRegistry(createP0ProviderPlatform()),
      () => undefined,
    );

    await expect(provider.start()).resolves.toBe("unavailable");
    expect(provider.status).toBe("unavailable");
  });

  it("can register again after cleanup", async () => {
    const registerTool = vi.fn(async () => undefined);
    const provider = new WebMCPProvider(
      createEarlyWebMCPToolRegistry(createP0ProviderPlatform()),
      () => ({ registerTool }),
    );

    await provider.start();
    provider.stop();
    await expect(provider.start()).resolves.toBe("ready");
    expect(registerTool).toHaveBeenCalledTimes(WEBMCP_TOOL_NAMES.length * 2);
  });

  it("rolls back partial registrations when the browser rejects a tool", async () => {
    const signals: AbortSignal[] = [];
    const modelContext: BrowserModelContext = {
      registerTool: vi.fn(async (_tool, options) => {
        if (options?.signal) signals.push(options.signal);
        if (signals.length === 2) throw new DOMException("Blocked", "NotAllowedError");
      }),
    };
    const provider = new WebMCPProvider(
      createEarlyWebMCPToolRegistry(createP0ProviderPlatform()),
      () => modelContext,
    );

    await expect(provider.start()).rejects.toThrow("Blocked");
    expect(provider.status).toBe("failed");
    expect(signals.every(({ aborted }) => aborted)).toBe(true);
  });
});
