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

  function isBoundedString(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 128;
  }

  function parseQuery(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (value.kind === "registered-anchor" && isAnchorId(value.anchorId)) {
      return { kind: value.kind, anchorId: value.anchorId };
    }
    if (value.kind !== "html-element") return null;
    const keys = Object.keys(value);
    if (keys.some((key) => !["kind", "tagName", "id", "attributeName", "className", "occurrence"].includes(key))) return null;
    if (!Number.isInteger(value.occurrence) || value.occurrence < 0) return null;
    if (value.tagName !== undefined && (typeof value.tagName !== "string" || !/^[A-Za-z][A-Za-z0-9-]*$/.test(value.tagName))) return null;
    if (value.attributeName !== undefined && (typeof value.attributeName !== "string" || !/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(value.attributeName))) return null;
    if (value.id !== undefined && !isBoundedString(value.id)) return null;
    if (value.className !== undefined && (!isBoundedString(value.className) || /\s/.test(value.className))) return null;
    if (!value.tagName && !value.id && !value.attributeName && !value.className) return null;
    return {
      kind: value.kind,
      ...(value.tagName ? { tagName: value.tagName.toLowerCase() } : {}),
      ...(value.id ? { id: value.id } : {}),
      ...(value.attributeName ? { attributeName: value.attributeName.toLowerCase() } : {}),
      ...(value.className ? { className: value.className } : {}),
      occurrence: value.occurrence,
    };
  }

  function findTarget(query) {
    if (query.kind === "registered-anchor") {
      for (const element of document.querySelectorAll("[data-lessonique-anchor]")) {
        if (element.getAttribute(anchorAttribute) === query.anchorId) return element;
      }
      return null;
    }
    const matches = [];
    for (const element of document.getElementsByTagName(query.tagName || "*")) {
      if (query.id && element.id !== query.id) continue;
      if (query.attributeName && !element.hasAttribute(query.attributeName)) continue;
      if (query.className && !element.classList.contains(query.className)) continue;
      matches.push(element);
    }
    return matches[query.occurrence] || null;
  }

  function postTarget(requestId, anchorId, query) {
    const element = findTarget(query);
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
    for (const [requestId, target] of tracked) {
      postTarget(requestId, target.anchorId, target.query);
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
    const query = parseQuery(message.query);
    if (message.type === "resolve" && typeof message.requestId === "string" && isAnchorId(message.anchorId) && query) {
      tracked.set(message.requestId, { anchorId: message.anchorId, query });
      postTarget(message.requestId, message.anchorId, query);
      return;
    }
    if (message.type === "scroll" && isAnchorId(message.anchorId) && query) {
      findTarget(query)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      scheduleUpdate();
    }
  });

  for (const eventType of ["click", "change", "submit"]) {
    addEventListener(eventType, (event) => {
      const target = event.target instanceof Element
        ? event.target.closest("[data-lessonique-anchor]")
        : null;
      let anchorId = target?.getAttribute(anchorAttribute);
      if (!isAnchorId(anchorId) && event.target instanceof Element) {
        for (const trackedTarget of tracked.values()) {
          const trackedElement = findTarget(trackedTarget.query);
          if (trackedElement && (trackedElement === event.target || trackedElement.contains(event.target))) {
            anchorId = trackedTarget.anchorId;
            break;
          }
        }
      }
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
