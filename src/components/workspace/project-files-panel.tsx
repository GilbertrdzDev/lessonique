"use client";

import {
  ChevronDown,
  ChevronRight,
  CodeXml,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceFile } from "@/core/workspace/contracts";
import { cn } from "@/lib/utils";

const WORKSPACE_ROOT_NAME = "lessonique-workspace";

type ProjectFileOperation =
  | Readonly<{ kind: "create-file" }>
  | Readonly<{ kind: "create-folder" }>
  | Readonly<{
      kind: "rename-file" | "rename-folder" | "delete-file" | "delete-folder";
      path: string;
    }>;

export type ProjectFilesPanelProps = Readonly<{
  activeFilePath?: string;
  directories: readonly string[];
  files: readonly WorkspaceFile[];
  onCreateDirectory(path: string): void | Promise<void>;
  onCreateFile(path: string): void | Promise<void>;
  onDeleteDirectory(path: string): void | Promise<void>;
  onDeleteFile(path: string): void | Promise<void>;
  onRenameDirectory(path: string, nextPath: string): void | Promise<void>;
  onRenameFile(path: string, nextPath: string): void | Promise<void>;
  onSelect(path: string): void;
}>;

export type WorkspaceFileTreeNode = WorkspaceFileTreeFolder | WorkspaceFileTreeFile;

export type WorkspaceFileTreeFolder = Readonly<{
  type: "folder";
  name: string;
  path: string;
  children: readonly WorkspaceFileTreeNode[];
}>;

export type WorkspaceFileTreeFile = Readonly<{
  type: "file";
  name: string;
  path: string;
  file: WorkspaceFile;
}>;

type MutableFolder = {
  type: "folder";
  name: string;
  path: string;
  children: Map<string, MutableFolder | WorkspaceFileTreeFile>;
};

export function ProjectFilesPanel({
  activeFilePath,
  directories,
  files,
  onCreateDirectory,
  onCreateFile,
  onDeleteDirectory,
  onDeleteFile,
  onRenameDirectory,
  onRenameFile,
  onSelect,
}: ProjectFilesPanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const operationInputRef = useRef<HTMLInputElement>(null);
  const visibleFiles = useMemo(() => files.filter(({ visible }) => visible), [files]);
  const completeTree = useMemo(
    () => buildWorkspaceFileTree(visibleFiles, directories),
    [directories, visibleFiles],
  );
  const initialFolderPaths = useMemo(() => collectFolderPaths(completeTree), [completeTree]);
  const knownFolderPathsRef = useRef(initialFolderPaths);
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(
    () => new Set(initialFolderPaths),
  );
  const [query, setQuery] = useState("");
  const [operation, setOperation] = useState<ProjectFileOperation>();
  const [operationValue, setOperationValue] = useState("");
  const [operationError, setOperationError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const filteredFiles = useMemo(
    () => filterWorkspaceFiles(visibleFiles, query),
    [query, visibleFiles],
  );
  const filteredDirectories = useMemo(
    () => filterWorkspaceDirectories(directories, query),
    [directories, query],
  );
  const visibleTree = useMemo(
    () => buildWorkspaceFileTree(filteredFiles, filteredDirectories),
    [filteredDirectories, filteredFiles],
  );
  const isSearching = query.trim().length > 0;

  useEffect(() => {
    const currentFolderPaths = collectFolderPaths(completeTree);
    setExpandedFolderPaths((current) => {
      const next = new Set([...current].filter((path) => currentFolderPaths.has(path)));
      currentFolderPaths.forEach((path) => {
        if (!knownFolderPathsRef.current.has(path)) next.add(path);
      });
      getAncestorFolderPaths(activeFilePath).forEach((path) => next.add(path));
      return setsEqual(current, next) ? current : next;
    });
    knownFolderPathsRef.current = currentFolderPaths;
  }, [activeFilePath, completeTree]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement)
      ) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => operationInputRef.current?.focus(), [operation]);

  const toggleFolder = (path: string) => {
    setExpandedFolderPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const beginOperation = (next: ProjectFileOperation) => {
    setOperation(next);
    setOperationError(undefined);
    setOperationValue(
      next.kind.startsWith("rename-") && "path" in next ? getEntryName(next.path) : "",
    );
  };

  const closeOperation = () => {
    if (isSubmitting) return;
    setOperation(undefined);
    setOperationError(undefined);
    setOperationValue("");
  };

  const submitOperation = async () => {
    if (!operation) return;
    setIsSubmitting(true);
    setOperationError(undefined);
    try {
      if (operation.kind === "create-file") await onCreateFile(operationValue.trim());
      else if (operation.kind === "create-folder") await onCreateDirectory(operationValue.trim());
      else if (operation.kind === "rename-file") {
        await onRenameFile(operation.path, joinPath(getParentPath(operation.path), operationValue));
      } else if (operation.kind === "rename-folder") {
        await onRenameDirectory(operation.path, joinPath(getParentPath(operation.path), operationValue));
      } else if (operation.kind === "delete-file") await onDeleteFile(operation.path);
      else await onDeleteDirectory(operation.path);
      setOperation(undefined);
      setOperationValue("");
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "The file operation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside
      aria-labelledby="project-files-title"
      className="flex h-full min-h-0 min-w-0 flex-col border-b bg-card/35 md:border-r md:border-b-0"
      data-slot="project-files-panel"
      id="project-files-panel"
    >
      <div className="border-b border-border/70 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-xs font-semibold" id="project-files-title">Project Files</h3>
            <span className="text-[0.65rem] text-muted-foreground">
              {visibleFiles.length} {visibleFiles.length === 1 ? "file" : "files"}
            </span>
          </div>
          <div className="flex shrink-0 gap-1">
            <PanelAction icon={FilePlus2} label="Create file" onClick={() => beginOperation({ kind: "create-file" })} />
            <PanelAction icon={FolderPlus} label="Create folder" onClick={() => beginOperation({ kind: "create-folder" })} />
          </div>
        </div>
        <label className="relative mt-3 block">
          <span className="sr-only">Search project files</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-keyshortcuts="Control+K Meta+K"
            className="h-9 w-full rounded-lg border bg-background/55 pr-12 pl-8 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Search files..."
            ref={searchInputRef}
            type="search"
            value={query}
          />
          <kbd aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-card px-1.5 py-0.5 text-[0.56rem] leading-none text-muted-foreground">Ctrl K</kbd>
        </label>
      </div>

      {operation ? (
        <OperationForm
          error={operationError}
          inputRef={operationInputRef}
          isSubmitting={isSubmitting}
          onCancel={closeOperation}
          onSubmit={() => void submitOperation()}
          onValueChange={setOperationValue}
          operation={operation}
          value={operationValue}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
        <div aria-label="Workspace file tree" role="tree">
          <FolderTreeItem
            activeFilePath={activeFilePath}
            depth={0}
            expandedFolderPaths={expandedFolderPaths}
            isSearching={isSearching}
            node={visibleTree}
            onBeginOperation={beginOperation}
            onSelect={onSelect}
            onToggle={toggleFolder}
          />
        </div>
        {filteredFiles.length === 0 && filteredDirectories.length === 0 ? (
          <p className="px-7 py-3 text-xs text-muted-foreground" role="status">
            {isSearching ? "No matching files or folders." : "No project files yet."}
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export function filterWorkspaceFiles(files: readonly WorkspaceFile[], query: string): WorkspaceFile[] {
  const normalizedQuery = query.trim().toLowerCase();
  return files.filter(
    (file) => file.visible && (!normalizedQuery || file.path.toLowerCase().includes(normalizedQuery)),
  );
}

export function filterWorkspaceDirectories(directories: readonly string[], query: string): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  return directories.filter((path) => !normalizedQuery || path.toLowerCase().includes(normalizedQuery));
}

export function buildWorkspaceFileTree(
  files: readonly WorkspaceFile[],
  directories: readonly string[] = [],
): WorkspaceFileTreeFolder {
  const root: MutableFolder = {
    type: "folder",
    name: WORKSPACE_ROOT_NAME,
    path: "",
    children: new Map(),
  };
  directories.forEach((path) => ensureFolderPath(root, path));
  files.forEach((file) => {
    if (!file.visible) return;
    const segments = file.path.split("/");
    const parent = ensureFolderPath(root, segments.slice(0, -1).join("/"));
    const name = segments.at(-1);
    if (name) parent.children.set(`file:${name}`, { type: "file", name, path: file.path, file });
  });
  return finalizeFolder(root);
}

function FolderTreeItem({
  activeFilePath,
  depth,
  expandedFolderPaths,
  isSearching,
  node,
  onBeginOperation,
  onSelect,
  onToggle,
}: Readonly<{
  activeFilePath?: string;
  depth: number;
  expandedFolderPaths: ReadonlySet<string>;
  isSearching: boolean;
  node: WorkspaceFileTreeFolder;
  onBeginOperation(operation: ProjectFileOperation): void;
  onSelect(path: string): void;
  onToggle(path: string): void;
}>) {
  const isExpanded = isSearching || expandedFolderPaths.has(node.path);
  const isRoot = !node.path;
  const FolderIcon = isRoot ? CodeXml : isExpanded ? FolderOpen : Folder;
  return (
    <div
      aria-expanded={isExpanded}
      aria-label={isRoot ? WORKSPACE_ROOT_NAME : node.path}
      aria-selected={false}
      role="treeitem"
    >
      <div
        className="group flex h-7 w-full min-w-0 items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-within:bg-muted/60 focus-within:text-foreground"
        data-project-entry-row={isRoot ? WORKSPACE_ROOT_NAME : node.path}
        role="none"
      >
        <button
          aria-expanded={isExpanded}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 pr-1 text-left text-xs text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
          data-folder-path={isRoot ? WORKSPACE_ROOT_NAME : node.path}
          onClick={() => onToggle(node.path)}
          style={{ paddingLeft: `${0.35 + depth * 0.85}rem` }}
          title={isRoot ? WORKSPACE_ROOT_NAME : node.path}
          type="button"
        >
          {isExpanded ? <ChevronDown aria-hidden="true" className="size-3 shrink-0" /> : <ChevronRight aria-hidden="true" className="size-3 shrink-0" />}
          <FolderIcon aria-hidden="true" className={cn("size-3.5 shrink-0", isRoot && "text-primary")} />
          <span className={cn("truncate", isRoot && "font-medium text-foreground")}>{node.name}</span>
        </button>
        {!isRoot ? (
          <EntryActions
            entryType="folder"
            onDelete={() => onBeginOperation({ kind: "delete-folder", path: node.path })}
            onRename={() => onBeginOperation({ kind: "rename-folder", path: node.path })}
            path={node.path}
          />
        ) : null}
      </div>
      {isExpanded ? (
        <div role="group">
          {node.children.map((child) => child.type === "folder" ? (
            <FolderTreeItem
              activeFilePath={activeFilePath}
              depth={depth + 1}
              expandedFolderPaths={expandedFolderPaths}
              isSearching={isSearching}
              key={`folder:${child.path}`}
              node={child}
              onBeginOperation={onBeginOperation}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ) : (
            <FileTreeItem
              activeFilePath={activeFilePath}
              depth={depth + 1}
              key={`file:${child.path}`}
              node={child}
              onBeginOperation={onBeginOperation}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FileTreeItem({ activeFilePath, depth, node, onBeginOperation, onSelect }: Readonly<{
  activeFilePath?: string;
  depth: number;
  node: WorkspaceFileTreeFile;
  onBeginOperation(operation: ProjectFileOperation): void;
  onSelect(path: string): void;
}>) {
  const isActive = node.path === activeFilePath;
  return (
    <div
      aria-label={node.path}
      aria-selected={isActive}
      className={cn(
        "group flex h-8 w-full min-w-0 items-center rounded-md transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary/40",
        isActive
          ? "bg-primary/15 font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-within:bg-muted/60 focus-within:text-foreground",
      )}
      data-project-entry-row={node.path}
      role="treeitem"
    >
      <button
        className="flex h-full min-w-0 flex-1 items-center gap-2 pr-1 text-left text-xs text-current focus-visible:outline-none"
        data-file-path={node.path}
        onClick={() => onSelect(node.path)}
        style={{ paddingLeft: `${1.2 + depth * 0.85}rem` }}
        title={`${node.path} · ${node.file.languageId}`}
        type="button"
      >
        <FileCode2 aria-hidden="true" className={cn("size-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {isActive ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
      </button>
      <EntryActions
        entryType="file"
        onDelete={() => onBeginOperation({ kind: "delete-file", path: node.path })}
        onRename={() => onBeginOperation({ kind: "rename-file", path: node.path })}
        path={node.path}
      />
    </div>
  );
}

function EntryActions({ entryType, onDelete, onRename, path }: Readonly<{
  entryType: "file" | "folder";
  onDelete(): void;
  onRename(): void;
  path: string;
}>) {
  return (
    <div className="flex shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
      <PanelAction icon={Pencil} label={`Rename ${entryType} ${path}`} onClick={onRename} />
      <PanelAction icon={Trash2} label={`Delete ${entryType} ${path}`} onClick={onDelete} tone="destructive" />
    </div>
  );
}

function PanelAction({ icon: Icon, label, onClick, tone = "default" }: Readonly<{
  icon: typeof FilePlus2;
  label: string;
  onClick(): void;
  tone?: "default" | "destructive";
}>) {
  return (
    <button
      aria-label={label}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        tone === "destructive" && "hover:bg-destructive/10 hover:text-destructive",
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
  );
}

function OperationForm({ error, inputRef, isSubmitting, onCancel, onSubmit, onValueChange, operation, value }: Readonly<{
  error?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isSubmitting: boolean;
  onCancel(): void;
  onSubmit(): void;
  onValueChange(value: string): void;
  operation: ProjectFileOperation;
  value: string;
}>) {
  const isDelete = operation.kind.startsWith("delete-");
  const inputLabel = operation.kind === "create-file" ? "File path" : operation.kind === "create-folder" ? "Folder path" : "New name";
  return (
    <form
      aria-labelledby="project-file-operation-title"
      className="border-b border-border/70 bg-background/45 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      role="dialog"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold" id="project-file-operation-title">{getOperationTitle(operation)}</h4>
          {"path" in operation ? <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{operation.path}</p> : null}
        </div>
        <PanelAction icon={X} label="Cancel file operation" onClick={onCancel} />
      </div>
      {isDelete ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {operation.kind === "delete-folder" ? "This also removes every file and folder inside it." : "This removes the file from the lesson workspace."}
        </p>
      ) : (
        <label className="mt-2 block text-[0.65rem] font-medium text-muted-foreground">
          {inputLabel}
          <input
            aria-invalid={Boolean(error)}
            className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            disabled={isSubmitting}
            onChange={(event) => onValueChange(event.currentTarget.value)}
            ref={inputRef}
            value={value}
          />
        </label>
      )}
      {error ? <p className="mt-2 text-[0.68rem] text-destructive" role="alert">{error}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground" disabled={isSubmitting} onClick={onCancel} type="button">Cancel</button>
        <button
          className={cn(
            "rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50",
            isDelete && "bg-destructive text-destructive-foreground",
          )}
          disabled={isSubmitting || (!isDelete && !value.trim())}
          type="submit"
        >
          {isSubmitting ? "Working…" : getOperationButtonLabel(operation)}
        </button>
      </div>
    </form>
  );
}

function ensureFolderPath(root: MutableFolder, path: string): MutableFolder {
  if (!path) return root;
  const segments = path.split("/");
  let parent = root;
  segments.forEach((segment, index) => {
    const key = `folder:${segment}`;
    const existing = parent.children.get(key);
    if (existing?.type === "folder") {
      parent = existing;
      return;
    }
    const folder: MutableFolder = {
      type: "folder",
      name: segment,
      path: segments.slice(0, index + 1).join("/"),
      children: new Map(),
    };
    parent.children.set(key, folder);
    parent = folder;
  });
  return parent;
}

function finalizeFolder(folder: MutableFolder): WorkspaceFileTreeFolder {
  const children = [...folder.children.values()]
    .map((child) => child.type === "folder" ? finalizeFolder(child) : child)
    .toSorted((left, right) => {
      if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
  return { type: "folder", name: folder.name, path: folder.path, children };
}

function collectFolderPaths(root: WorkspaceFileTreeFolder): Set<string> {
  const paths = new Set<string>();
  const visit = (folder: WorkspaceFileTreeFolder) => {
    paths.add(folder.path);
    folder.children.forEach((child) => {
      if (child.type === "folder") visit(child);
    });
  };
  visit(root);
  return paths;
}

function getAncestorFolderPaths(path: string | undefined): string[] {
  if (!path) return [""];
  const segments = path.split("/").slice(0, -1);
  return ["", ...segments.map((_, index) => segments.slice(0, index + 1).join("/"))];
}

function getParentPath(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function getEntryName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name.trim()}` : name.trim();
}

function getOperationTitle(operation: ProjectFileOperation): string {
  return {
    "create-file": "Create file",
    "create-folder": "Create folder",
    "rename-file": "Rename file",
    "rename-folder": "Rename folder",
    "delete-file": "Delete file?",
    "delete-folder": "Delete folder?",
  }[operation.kind];
}

function getOperationButtonLabel(operation: ProjectFileOperation): string {
  if (operation.kind.startsWith("create-")) return "Create";
  if (operation.kind.startsWith("rename-")) return "Rename";
  return "Delete";
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
