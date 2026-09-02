import { describe, expect, it, vi } from "vitest";

import {
  SandpackRuntimeAdapter,
  type SandpackRuntimeHost,
} from "./sandpack-runtime-adapter";

describe("SandpackRuntimeAdapter", () => {
  it("keeps provider files until the Sandpack host mounts", async () => {
    const adapter = createAdapter();
    await adapter.replaceFiles([
      {
        path: "index.html",
        languageId: "language.html",
        content: "<main>Ready</main>",
        visible: true,
      },
    ]);
    const host = createHost();

    adapter.attachHost(host);
    await vi.waitFor(() =>
      expect(host.replaceFiles).toHaveBeenCalledWith(
        {
          "/index.html": "<main>Ready</main>",
        },
        true,
      ),
    );
    expect(adapter.getSnapshot().status).toBe("ready");
    expect(adapter.getSnapshot().automaticExecutionEnabled).toBe(true);
  });

  it("executes only declared Sandpack runtime actions", async () => {
    const adapter = createAdapter();
    const host = createHost();
    adapter.attachHost(host);

    const run = await adapter.executeAction("runtime.run");
    const unsupported = await adapter.executeAction("runtime.shell");

    expect(run.accepted).toBe(true);
    expect(host.run).toHaveBeenCalledOnce();
    expect(unsupported.accepted).toBe(false);
    expect(adapter.getSnapshot().status).toBe("ready");
  });

  it("keeps automatic execution stopped across edits until Run enables it", async () => {
    const adapter = createAdapter();
    const host = createHost();
    adapter.attachHost(host);
    await vi.waitFor(() => expect(host.replaceFiles).toHaveBeenCalled());
    await adapter.replaceFiles([
      {
        path: "script.js",
        languageId: "language.javascript",
        content: "console.log('ready');",
        visible: true,
      },
    ]);

    await adapter.executeAction("runtime.stop");
    await adapter.replaceFiles([
      {
        path: "script.js",
        languageId: "language.javascript",
        content: "console.log('stopped');",
        visible: true,
      },
    ]);

    expect(adapter.getSnapshot()).toEqual(
      expect.objectContaining({
        automaticExecutionEnabled: false,
        status: "stopped",
      }),
    );
    expect(host.replaceFiles).toHaveBeenLastCalledWith(
      { "/script.js": "console.log('stopped');" },
      false,
    );
    expect(host.clearConsole).not.toHaveBeenCalled();

    await adapter.executeAction("runtime.run");

    expect(host.run).toHaveBeenCalledOnce();
    expect(adapter.getSnapshot()).toEqual(
      expect.objectContaining({
        automaticExecutionEnabled: true,
        status: "ready",
      }),
    );
  });

  it("restores default automatic execution when a new environment starts", async () => {
    const adapter = createAdapter();
    const host = createHost();
    adapter.attachHost(host);
    await vi.waitFor(() => expect(host.replaceFiles).toHaveBeenCalled());
    await adapter.executeAction("runtime.stop");
    await adapter.replaceFiles([]);
    await adapter.reset();

    await adapter.replaceFiles([
      {
        path: "script.js",
        languageId: "language.javascript",
        content: "console.log('ready');",
        visible: true,
      },
    ]);

    expect(adapter.getSnapshot()).toEqual(
      expect.objectContaining({
        automaticExecutionEnabled: true,
        status: "ready",
      }),
    );
    expect(host.replaceFiles).toHaveBeenLastCalledWith(
      { "/script.js": "console.log('ready');" },
      true,
    );
  });

  it("can explicitly re-enable automatic execution during file synchronization", async () => {
    const adapter = createAdapter();
    const host = createHost();
    adapter.attachHost(host);
    await vi.waitFor(() => expect(host.replaceFiles).toHaveBeenCalled());
    await adapter.executeAction("runtime.stop");

    await adapter.replaceFiles(
      [
        {
          path: "script.js",
          languageId: "language.javascript",
          content: "console.log('new lesson');",
          visible: true,
        },
      ],
      { automaticExecutionEnabled: true },
    );

    expect(adapter.getSnapshot()).toEqual(
      expect.objectContaining({
        automaticExecutionEnabled: true,
        status: "ready",
      }),
    );
    expect(host.replaceFiles).toHaveBeenLastCalledWith(
      { "/script.js": "console.log('new lesson');" },
      true,
    );
  });

  it("does not commit a replacement when host synchronization fails", async () => {
    const adapter = createAdapter();
    await adapter.replaceFiles([]);
    const host = createHost();
    adapter.attachHost(host);
    await vi.waitFor(() => expect(host.replaceFiles).toHaveBeenCalled());
    vi.mocked(host.replaceFiles).mockRejectedValueOnce(new Error("Host failed."));

    await expect(
      adapter.replaceFiles([
        {
          path: "script.js",
          languageId: "language.javascript",
          content: "throw new Error();",
          visible: true,
        },
      ]),
    ).rejects.toThrow("Host failed.");

    expect(adapter.getSnapshot().files).toEqual([]);
  });
});

function createAdapter(): SandpackRuntimeAdapter {
  return new SandpackRuntimeAdapter("runtime.sandpack-vanilla", {
    run: "runtime.run",
    stop: "runtime.stop",
    restart: "runtime.restart",
    clearConsole: "runtime.clear-console",
  });
}

function createHost(): SandpackRuntimeHost {
  return {
    replaceFiles: vi.fn(async () => undefined),
    run: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    restart: vi.fn(async () => undefined),
    clearConsole: vi.fn(async () => undefined),
  };
}
