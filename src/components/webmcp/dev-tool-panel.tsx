"use client";

import { Braces, Play, RefreshCcw, TestTube2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DEV_TOOL_FIXTURES,
  getWebMCPToolJsonSchema,
  isAcceptedDevToolFixtureRun,
  runDevToolFixtureSuite,
  type DevToolFixtureRun,
  type WebMCPToolName,
} from "@/core/webmcp";

import { useWebMCPRuntime } from "./webmcp-registration-provider";

const INITIAL_TOOL: WebMCPToolName = "get_system_capabilities";

export function DevToolPanel() {
  const { registry } = useWebMCPRuntime();
  const definitions = useMemo(() => registry.list(), [registry]);
  const [selectedTool, setSelectedTool] = useState<WebMCPToolName>(INITIAL_TOOL);
  const [payload, setPayload] = useState(() => formatFixture(INITIAL_TOOL));
  const [isOpen, setIsOpen] = useState(false);
  const [result, setResult] = useState("No invocation has run yet.");
  const [suiteResults, setSuiteResults] = useState<readonly DevToolFixtureRun[]>(
    [],
  );
  const [isRunning, setIsRunning] = useState(false);
  const selectedDefinition = registry.require(selectedTool);

  function selectTool(toolName: WebMCPToolName): void {
    setSelectedTool(toolName);
    setPayload(formatFixture(toolName));
    setResult("Fixture loaded. Run the selected tool to inspect its result.");
  }

  async function runSelected(): Promise<void> {
    setIsRunning(true);
    try {
      const input = JSON.parse(payload) as unknown;
      const invocation = await registry.invoke(selectedTool, input);
      setResult(JSON.stringify(invocation, null, 2));
    } catch (error) {
      setResult(
        JSON.stringify(
          {
            ok: false,
            status: "failed",
            error: {
              code: "invalid_dev_panel_json",
              message:
                error instanceof Error ? error.message : "The JSON is invalid.",
            },
          },
          null,
          2,
        ),
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function runAllFixtures(): Promise<void> {
    setIsRunning(true);
    setSuiteResults([]);
    try {
      const runs = await runDevToolFixtureSuite(registry);
      setSuiteResults(runs);
      setResult(
        JSON.stringify(
          {
            invoked: runs.length,
            accepted: runs.filter(isAcceptedDevToolFixtureRun).length,
            failed: runs
              .filter((run) => !isAcceptedDevToolFixtureRun(run))
              .map(({ toolName, result: invocation }) => ({
                toolName,
                error: invocation.error,
              })),
          },
          null,
          2,
        ),
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <details
      className="group rounded-2xl border border-dashed border-primary/35 bg-background/60 p-3"
      data-slot="webmcp-dev-panel"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold marker:hidden">
        <TestTube2 aria-hidden="true" className="size-4 text-primary" />
        WebMCP Dev Panel
        <span className="ml-auto rounded-lg bg-secondary px-2 py-1 text-[0.62rem] font-medium text-muted-foreground">
          {definitions.length} tools
        </span>
      </summary>

      {isOpen ? <div className="mt-3 space-y-3 border-t pt-3">
        <label className="block text-[0.68rem] font-semibold" htmlFor="dev-tool-name">
          WebMCP tool
        </label>
        <select
          className="h-9 w-full rounded-xl border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={isRunning}
          id="dev-tool-name"
          onChange={(event) =>
            selectTool(event.target.value as WebMCPToolName)
          }
          value={selectedTool}
        >
          {definitions.map((definition) => (
            <option key={definition.name} value={definition.name}>
              {definition.name}
            </option>
          ))}
        </select>
        <p className="text-[0.65rem] leading-relaxed text-muted-foreground">
          {selectedDefinition.description}
        </p>

        <label className="block text-[0.68rem] font-semibold" htmlFor="dev-tool-input">
          Tool input JSON
        </label>
        <textarea
          className="min-h-40 w-full resize-y rounded-xl border bg-background p-2 font-mono text-[0.68rem] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={isRunning}
          id="dev-tool-input"
          onChange={(event) => setPayload(event.target.value)}
          spellCheck={false}
          value={payload}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            disabled={isRunning}
            onClick={() => void runSelected()}
            size="sm"
            type="button"
          >
            <Play aria-hidden="true" />
            Run selected tool
          </Button>
          <Button
            disabled={isRunning}
            onClick={() => void runAllFixtures()}
            size="sm"
            type="button"
            variant="secondary"
          >
            <TestTube2 aria-hidden="true" />
            Run all fixtures
          </Button>
          <Button
            disabled={isRunning}
            onClick={() => selectTool(selectedTool)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RefreshCcw aria-hidden="true" />
            Reload fixture
          </Button>
        </div>

        <details className="rounded-xl border bg-background/70 p-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[0.68rem] font-semibold marker:hidden">
            <Braces aria-hidden="true" className="size-3.5" />
            Closed input schema
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[0.62rem] leading-relaxed text-muted-foreground">
            {JSON.stringify(getWebMCPToolJsonSchema(selectedTool), null, 2)}
          </pre>
        </details>

        {suiteResults.length > 0 ? (
          <ol
            aria-label="Dev fixture results"
            className="grid gap-1.5"
            data-dev-suite-results
          >
            {suiteResults.map(({ toolName, result: invocation }) => (
              <li
                className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[0.65rem]"
                data-status={invocation.status}
                data-tool-name={toolName}
                key={toolName}
              >
                <code>{toolName}</code>
                <span className="font-semibold text-foreground">
                  {invocation.status}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        <div>
          <p className="text-[0.68rem] font-semibold">Invocation result</p>
          <pre
            aria-live="polite"
            className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-secondary/70 p-2 text-[0.62rem] leading-relaxed"
            role="status"
          >
            {result}
          </pre>
        </div>
      </div> : null}
    </details>
  );
}

function formatFixture(toolName: WebMCPToolName): string {
  return JSON.stringify(DEV_TOOL_FIXTURES[toolName], null, 2);
}
