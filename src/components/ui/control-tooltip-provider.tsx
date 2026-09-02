"use client";

import { useEffect, type ReactNode } from "react";
import {
  delegate,
  hideAll,
  type Instance,
  type Props,
  type ReferenceElement,
} from "tippy.js";

export const CONTROL_TOOLTIP_SELECTOR = "[data-tooltip]";

export const CONTROL_TOOLTIP_OPTIONS: Pick<
  Props,
  | "allowHTML"
  | "animation"
  | "aria"
  | "arrow"
  | "delay"
  | "duration"
  | "hideOnClick"
  | "ignoreAttributes"
  | "inertia"
  | "interactive"
  | "maxWidth"
  | "offset"
  | "placement"
  | "theme"
  | "touch"
  | "trigger"
  | "zIndex"
> = {
  allowHTML: false,
  animation: "scale",
  aria: { content: "describedby", expanded: false },
  arrow: false,
  delay: [250, 60],
  duration: [220, 140],
  hideOnClick: true,
  ignoreAttributes: true,
  inertia: true,
  interactive: false,
  maxWidth: 240,
  offset: [0, 7],
  placement: "top",
  theme: "lessonique",
  touch: false,
  trigger: "mouseenter focus",
  zIndex: 35,
};

const GUIDANCE_ROOT_SELECTOR =
  '[data-guidance-generation], [data-slot="assistant-overlay-host"]';

export function ControlTooltipProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    const host = document.body;
    const delegatedTooltip = delegate(host, {
      ...CONTROL_TOOLTIP_OPTIONS,
      appendTo: () => host,
      content: readTooltipContent,
      onCreate(instance) {
        if (instance.reference.matches(CONTROL_TOOLTIP_SELECTOR)) {
          hideAll({ exclude: instance });
          instance.popper.dataset.controlTooltipRoot = "true";
        }
      },
      onShow(instance) {
        return synchronizeTooltipContent(instance);
      },
      onTrigger(instance) {
        hideAll({ exclude: instance });
        synchronizeTooltipContent(instance);
      },
      target: CONTROL_TOOLTIP_SELECTOR,
    });
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof Element) {
          synchronizeReferenceTooltip(record.target);
          continue;
        }
        record.removedNodes.forEach(destroyRemovedTooltips);
      }
    });

    observer.observe(host, {
      attributeFilter: ["data-tooltip"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      delegatedTooltip.destroy();
    };
  }, []);

  return children;
}

function readTooltipContent(reference: Element): string {
  if (reference.closest(GUIDANCE_ROOT_SELECTOR)) return "";
  return reference.getAttribute("data-tooltip")?.trim() ?? "";
}

function synchronizeTooltipContent(instance: Instance): false | undefined {
  const content = readTooltipContent(instance.reference);
  if (!content) {
    instance.hide();
    return false;
  }
  if (instance.props.content !== content) {
    instance.setContent(content);
  }
  return undefined;
}

function synchronizeReferenceTooltip(reference: Element): void {
  const instance = (reference as ReferenceElement)._tippy;
  if (instance) synchronizeTooltipContent(instance);
}

function destroyRemovedTooltips(node: Node): void {
  if (!(node instanceof Element)) return;
  destroyReferenceTooltip(node);
  node
    .querySelectorAll(CONTROL_TOOLTIP_SELECTOR)
    .forEach(destroyReferenceTooltip);
}

function destroyReferenceTooltip(reference: Element): void {
  (reference as ReferenceElement)._tippy?.destroy();
}
