import type { WorkspaceFile } from "@/core/workspace/contracts";

export const PREVIEW_BRIDGE_RUNTIME_PATH =
  "/__lessonique_internal__/preview-bridge.js";

export const PREVIEW_BRIDGE_SCRIPT = String.raw`(() => {
  "use strict";

  const channel = "lessonique.preview.v1";
  const anchorAttribute = "data-lessonique-anchor";
  const tracked = new Map();
  let updateScheduled = false;

  function isAnchorId(value) {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
  }

  function findAnchor(anchorId) {
    for (const element of document.querySelectorAll("[data-lessonique-anchor]")) {
      if (element.getAttribute(anchorAttribute) === anchorId) {
        return element;
      }
    }
    return null;
  }

  function postTarget(requestId, anchorId) {
    const element = findAnchor(anchorId);
    if (!element || !element.isConnected) {
      parent.postMessage({
        channel,
        direction: "preview-to-host",
        type: "target",
        requestId,
        anchorId,
        status: "lost",
      }, "*");
      return;
    }
    const rect = element.getBoundingClientRect();
    parent.postMessage({
      channel,
      direction: "preview-to-host",
      type: "target",
      requestId,
      anchorId,
      status: "resolved",
      geometry: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    }, "*");
  }

  function updateTracked() {
    updateScheduled = false;
    for (const [requestId, anchorId] of tracked) {
      postTarget(requestId, anchorId);
    }
  }

  function scheduleUpdate() {
    if (!updateScheduled) {
      updateScheduled = true;
      requestAnimationFrame(updateTracked);
    }
  }

  addEventListener("message", (event) => {
    const message = event.data;
    if (!message || message.channel !== channel || message.direction !== "host-to-preview") {
      return;
    }
    if (message.type === "resolve" && typeof message.requestId === "string" && isAnchorId(message.anchorId)) {
      tracked.set(message.requestId, message.anchorId);
      postTarget(message.requestId, message.anchorId);
      return;
    }
    if (message.type === "scroll" && isAnchorId(message.anchorId)) {
      findAnchor(message.anchorId)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      scheduleUpdate();
    }
  });

  for (const eventType of ["click", "change", "submit"]) {
    addEventListener(eventType, (event) => {
      const target = event.target instanceof Element
        ? event.target.closest("[data-lessonique-anchor]")
        : null;
      const anchorId = target?.getAttribute(anchorAttribute);
      if (!isAnchorId(anchorId)) {
        return;
      }
      parent.postMessage({
        channel,
        direction: "preview-to-host",
        type: "interaction",
        eventType,
        anchorId,
      }, "*");
    }, true);
  }

  new MutationObserver(scheduleUpdate).observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(scheduleUpdate).observe(document.documentElement);
  }
  addEventListener("resize", scheduleUpdate);
  addEventListener("scroll", scheduleUpdate, true);
})();`;

export type SandpackPreviewFiles = Record<
  string,
  { code: string; hidden?: boolean }
>;

export function createSandpackPreviewFiles(
  files: readonly WorkspaceFile[],
): SandpackPreviewFiles {
  return addPreviewBridge(
    Object.fromEntries(
      files.map(({ path, content }) => [`/${path}`, { code: content }]),
    ),
  );
}

export function createSandpackPreviewFilesFromRuntime(
  files: Readonly<Record<string, string>>,
): SandpackPreviewFiles {
  return addPreviewBridge(
    Object.fromEntries(
      Object.entries(files).map(([path, content]) => [
        path.startsWith("/") ? path : `/${path}`,
        { code: content },
      ]),
    ),
  );
}

function addPreviewBridge(result: SandpackPreviewFiles): SandpackPreviewFiles {
  let htmlPath = Object.keys(result).find((path) => path.endsWith(".html"));
  if (!htmlPath) {
    const scriptPath = Object.keys(result).find((path) => path.endsWith(".js"));
    htmlPath = "/index.html";
    result[htmlPath] = {
      code: `<!doctype html><html lang="en"><body>${
        scriptPath ? `<script src="${scriptPath}"></script>` : ""
      }</body></html>`,
      hidden: true,
    };
  }
  if (htmlPath) {
    const bridgeTag = `<script src="${PREVIEW_BRIDGE_RUNTIME_PATH}"></script>`;
    const html = result[htmlPath]?.code ?? "";
    result[htmlPath] = {
      code: /<\/body\s*>/iu.test(html)
        ? html.replace(/<\/body\s*>/iu, `${bridgeTag}</body>`)
        : `${html}\n${bridgeTag}\n`,
    };
  }
  result[PREVIEW_BRIDGE_RUNTIME_PATH] = {
    code: PREVIEW_BRIDGE_SCRIPT,
    hidden: true,
  };
  return result;
}
