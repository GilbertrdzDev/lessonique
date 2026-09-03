import { describe, expect, it, vi } from "vitest";

import { CapabilityValidationError } from "./capabilities";
import { WEBMCP_TOOL_INPUT_SCHEMAS } from "./schemas";
import { ToolActivityLogger } from "./tool-activity-logger";
import {
  ToolInvocationError,
  ToolInvocationService,
} from "./tool-invocation-service";
import { ToolRegistry } from "./tool-registry";

describe("ToolInvocationService", () => {
  it("publishes the complete lifecycle and stores one privacy-safe activity entry", async () => {
    const phases: string[] = [];
    const invocation = new ToolInvocationService({
      createOperationId: () => "operation.fixture",
      now: () => "2026-08-30T12:00:00.000Z",
    });
    const registry = new ToolRegistry(invocation);
    const capabilityCheck = vi.fn();
    const handler = vi.fn(() => ({
      ok: true,
      status: "completed" as const,
      revision: 7,
      data: { secretPayload: "not logged" },
    }));
    registry.subscribe((event) => phases.push(event.phase));
    registry.register({
      name: "get_system_capabilities",
      title: "Capabilities",
      description: "Fixture",
      inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.get_system_capabilities,
      capabilityCheck,
      handler,
    });

    await expect(registry.invoke("get_system_capabilities", {})).resolves.toEqual({
      ok: true,
      operationId: "operation.fixture",
      status: "completed",
      revision: 7,
      data: { secretPayload: "not logged" },
    });
    expect(phases).toEqual([
      "received",
      "validated",
      "capability_checked",
      "executing",
      "succeeded",
    ]);
    expect(capabilityCheck).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ operationId: "operation.fixture" }),
    );
    expect(registry.activityLogger.getSnapshot()).toEqual([
      {
        operationId: "operation.fixture",
        toolName: "get_system_capabilities",
        phase: "succeeded",
        receivedAt: "2026-08-30T12:00:00.000Z",
        updatedAt: "2026-08-30T12:00:00.000Z",
        status: "completed",
        revision: 7,
      },
    ]);
  });

  it("returns a compact schema error without invoking capability or business logic", async () => {
    const capabilityCheck = vi.fn();
    const handler = vi.fn(() => ({ ok: true, status: "completed" as const }));
    const service = new ToolInvocationService({ createOperationId: () => "operation.invalid" });

    const result = await service.invoke(
      {
        name: "get_system_capabilities",
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.get_system_capabilities,
        capabilityCheck,
        handler,
      },
      { include: ["unknown-section"], privateValue: "must-not-leak" },
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        operationId: "operation.invalid",
        status: "failed",
        error: expect.objectContaining({
          code: "invalid_input",
          message: expect.stringContaining("include[0]"),
          recoverable: true,
        }),
      }),
    );
    expect(result.error?.message).toContain("privateValue");
    expect(capabilityCheck).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.stringify(service.activityLogger.getSnapshot())).not.toContain("must-not-leak");
  });

  it("stores a student-facing presentation without retaining validated file content", async () => {
    const service = new ToolInvocationService({
      createOperationId: () => "operation.file",
      now: () => "2026-08-30T12:00:00.000Z",
    });
    await service.invoke(
      {
        name: "apply_workspace_changes",
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.apply_workspace_changes,
        handler: () => ({ ok: true, status: "completed" }),
      },
      {
        operations: [
          {
            type: "replace_file",
            path: "variables.js",
            content: "private source content",
          },
        ],
      },
    );

    expect(service.activityLogger.getSnapshot()[0]?.presentation).toEqual({
      kind: "file",
      summary: "ChatGPT updated `variables.js`.",
      dedupeKey: "file:update:variables.js",
    });
    expect(JSON.stringify(service.activityLogger.getSnapshot())).not.toContain(
      "private source content",
    );
  });

  it("preserves structured capability alternatives and does not execute after rejection", async () => {
    const handler = vi.fn(() => ({ ok: true, status: "completed" as const }));
    const service = new ToolInvocationService({
      createOperationId: () => "operation.unsupported",
    });

    const result = await service.invoke(
      {
        name: "get_system_capabilities",
        inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.get_system_capabilities,
        capabilityCheck: () => {
          throw new CapabilityValidationError({
            category: "profile",
            requestedId: "profile.unknown",
            message: "The requested profile is not registered.",
            supportedAlternatives: ["profile.vanilla-web", "profile.javascript-console"],
          });
        },
        handler,
      },
      {},
    );

    expect(result).toEqual({
      ok: false,
      operationId: "operation.unsupported",
      status: "failed",
      error: {
        code: "unsupported_capability",
        message: "The requested profile is not registered.",
        recoverable: true,
        supportedAlternatives: ["profile.vanilla-web", "profile.javascript-console"],
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(service.activityLogger.getSnapshot()[0]?.phase).toBe("failed");
  });

  it("sanitizes unexpected failures while retaining declared recoverable errors", async () => {
    const ids = ["operation.declared", "operation.unexpected"];
    const service = new ToolInvocationService({ createOperationId: () => ids.shift()! });
    const baseDefinition = {
      name: "get_system_capabilities" as const,
      inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.get_system_capabilities,
    };

    await expect(
      service.invoke(
        {
          ...baseDefinition,
          handler: () => {
            throw new ToolInvocationError({
              code: "temporarily_unavailable",
              message: "Try the operation again.",
              recoverable: true,
            });
          },
        },
        {},
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        error: {
          code: "temporarily_unavailable",
          message: "Try the operation again.",
          recoverable: true,
        },
      }),
    );
    await expect(
      service.invoke(
        {
          ...baseDefinition,
          handler: () => {
            throw new Error("Sensitive implementation detail");
          },
        },
        {},
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        error: {
          code: "internal_error",
          message: "The tool invocation failed unexpectedly.",
          recoverable: false,
        },
      }),
    );
  });

  it("records cancellation without running the handler", async () => {
    const controller = new AbortController();
    controller.abort();
    const handler = vi.fn(() => ({ ok: true, status: "completed" as const }));
    const service = new ToolInvocationService({ createOperationId: () => "operation.cancelled" });

    await expect(
      service.invoke(
        {
          name: "get_system_capabilities",
          inputSchema: WEBMCP_TOOL_INPUT_SCHEMAS.get_system_capabilities,
          handler,
        },
        {},
        { signal: controller.signal },
      ),
    ).resolves.toEqual({
      ok: false,
      operationId: "operation.cancelled",
      status: "cancelled",
      error: {
        code: "operation_cancelled",
        message: "The tool invocation was cancelled.",
        recoverable: true,
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(service.activityLogger.getSnapshot()[0]?.phase).toBe("cancelled");
  });
});

describe("ToolActivityLogger", () => {
  it("retains the configured number of invocations and defensively clones errors", () => {
    const logger = new ToolActivityLogger(2);
    for (const sequence of [1, 2, 3]) {
      logger.record({
        operationId: `operation.${sequence}`,
        toolName: "inspect_classroom",
        phase: "received",
        occurredAt: `2026-08-30T12:00:0${sequence}.000Z`,
      });
    }
    logger.record({
      operationId: "operation.3",
      toolName: "inspect_classroom",
      phase: "failed",
      occurredAt: "2026-08-30T12:00:04.000Z",
      status: "failed",
      error: {
        code: "fixture",
        message: "Fixture",
        recoverable: true,
        supportedAlternatives: ["one"],
      },
    });

    const snapshot = logger.getSnapshot();
    expect(snapshot.map(({ operationId }) => operationId)).toEqual([
      "operation.2",
      "operation.3",
    ]);
    snapshot[1]?.error?.supportedAlternatives?.push("mutated");
    expect(logger.getSnapshot()[1]?.error?.supportedAlternatives).toEqual(["one"]);
  });
});
