"use client";

import {
  BookOpenCheck,
  ChevronDown,
  Code2,
  GraduationCap,
  History,
  Home,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavigationItem = Readonly<{
  active?: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
}>;

const navigationItems: readonly NavigationItem[] = [
  { href: "#home", icon: Home, label: "Home" },
  {
    active: true,
    href: "#guided-class",
    icon: BookOpenCheck,
    label: "Guided Class",
  },
  { href: "#practice", icon: Code2, label: "Practice" },
  { href: "#history", icon: History, label: "History" },
  { href: "#resources", icon: Library, label: "Resources" },
];

export function NavigationSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.aside
      animate={{ width: isCollapsed ? 76 : 256 }}
      aria-label="Primary navigation"
      className="order-2 flex h-full min-h-[42rem] shrink-0 flex-col overflow-hidden rounded-[1.25rem] border bg-sidebar text-sidebar-foreground shadow-panel md:order-none max-md:!w-full max-md:min-h-0"
      data-navigation-collapsed={isCollapsed}
      initial={false}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-sidebar-border px-4">
        {isCollapsed ? (
          <Button
            aria-controls="primary-navigation-links"
            aria-expanded="false"
            aria-label="Expand navigation"
            className="group/nav-logo relative size-10 shrink-0 rounded-2xl shadow-sm max-md:hidden"
            onClick={() => setIsCollapsed(false)}
            size="icon-sm"
            title="Expand navigation"
          >
            <GraduationCap
              aria-hidden="true"
              className="absolute size-5 transition-[opacity,transform] group-hover/nav-logo:scale-75 group-hover/nav-logo:opacity-0 group-focus-visible/nav-logo:scale-75 group-focus-visible/nav-logo:opacity-0"
              data-navigation-brand-icon
            />
            <PanelLeftOpen
              aria-hidden="true"
              className="absolute size-5 scale-75 opacity-0 transition-[opacity,transform] group-hover/nav-logo:scale-100 group-hover/nav-logo:opacity-100 group-focus-visible/nav-logo:scale-100 group-focus-visible/nav-logo:opacity-100"
              data-navigation-expand-icon
            />
          </Button>
        ) : (
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap aria-hidden="true" className="size-5" />
          </div>
        )}
        <div className={cn("min-w-0 flex-1", isCollapsed && "hidden")}>
          <div className="flex items-center gap-2">
            <span
              className="truncate text-base font-bold tracking-tight"
              translate="no"
            >
              Lessonique
            </span>
            <span
              className="rounded-md bg-primary px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-primary-foreground"
              translate="no"
            >
              AI
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Learn by building
          </p>
        </div>
        {!isCollapsed ? (
          <Button
            aria-controls="primary-navigation-links"
            aria-expanded="true"
            aria-label="Collapse navigation"
            className="shrink-0 max-md:hidden"
            onClick={() => setIsCollapsed(true)}
            size="icon-sm"
            variant="ghost"
          >
            <PanelLeftClose aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <nav
        aria-label="Main navigation"
        className="flex flex-1 flex-col gap-1.5 px-3 py-5"
        id="primary-navigation-links"
      >
        {navigationItems.map(({ active, href, icon: Icon, label }) => (
          <a
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
            href={href}
            key={href}
            title={isCollapsed ? label : undefined}
          >
            <Icon
              aria-hidden="true"
              className={cn("size-5 shrink-0", active && "text-primary")}
            />
            <span className={cn("truncate", isCollapsed && "sr-only")}>
              {label}
            </span>
            {active && !isCollapsed ? (
              <Sparkles
                aria-hidden="true"
                className="ml-auto size-4 text-primary"
              />
            ) : null}
          </a>
        ))}
      </nav>

      <div className="p-3">
        <button
          aria-label="Open learner profile"
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl border border-sidebar-border bg-background/60 p-2.5 text-left transition-colors hover:bg-sidebar-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            isCollapsed && "justify-center",
          )}
          type="button"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
            AM
          </span>
          <span className={cn("min-w-0 flex-1", isCollapsed && "sr-only")}>
            <span className="block truncate text-sm font-semibold">
              Alex Morgan
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              Learner
            </span>
          </span>
          {!isCollapsed ? (
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          ) : null}
        </button>
      </div>
    </motion.aside>
  );
}
