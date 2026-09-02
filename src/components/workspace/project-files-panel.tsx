"use client";

import { ContextMenu } from "@base-ui/react/context-menu";
import { Dialog } from "@base-ui/react/dialog";
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
} from "lucide-react";
import {
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { WorkspaceFile } from "@/core/workspace/contracts";
import { cn } from "@/lib/utils";

const WORKSPACE_ROOT_NAME = "lessonique-workspace";

type InlineProjectFileOperation =
  | Readonly<{
      kind: "create-file" | "create-folder";
      parentPath: string;
    }>
  | Readonly<{
      kind: "rename-file" | "rename-folder";
      path: string;
    }>;

type DeleteProjectFileOperation = Readonly<{
  kind: "delete-file" | "delete-folder";
  path: string;
}>;

type ProjectFileEntryType = "file" | "folder";

type InlineOperationBindings = Readonly<{
  error?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isSubmitting: boolean;
  onCancel(): void;
  onSubmit(): void;
  onValueChange(value: string): void;
  operation?: InlineProjectFileOperation;
  value: string;
}>;

type ProjectFileTreeActions = InlineOperationBindings &
  Readonly<{
    onBeginCreate(entryType: ProjectFileEntryType, parentPath: string): void;
    onBeginDelete(entryType: ProjectFileEntryType, path: string): void;
    onBeginRename(entryType: ProjectFileEntryType, path: string): void;
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
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const inlineSubmissionRef = useRef(false);
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
  const [inlineOperation, setInlineOperation] = useState<InlineProjectFileOperation>();
  const [inlineValue, setInlineValue] = useState("");
  const [inlineError, setInlineError] = useState<string>();
  const [isInlineSubmitting, setIsInlineSubmitting] = useState(false);
  const [deleteOperation, setDeleteOperation] = useState<DeleteProjectFileOperation>();
  const [deleteError, setDeleteError] = useState<string>();
  const [isDeleting, setIsDeleting] = useState(false);
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

  useEffect(() => {
    if (!inlineOperation) return;
    const animationFrame = window.requestAnimationFrame(() => {
      inlineInputRef.current?.focus();
      inlineInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [inlineOperation]);

  const toggleFolder = (path: string) => {
    setExpandedFolderPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const beginCreate = (entryType: ProjectFileEntryType, parentPath: string) => {
    setQuery("");
    setDeleteOperation(undefined);
    setInlineError(undefined);
    setInlineValue("");
    setInlineOperation({
      kind: entryType === "file" ? "create-file" : "create-folder",
      parentPath,
    });
    setExpandedFolderPaths((current) => new Set(current).add(parentPath));
  };

  const beginRename = (entryType: ProjectFileEntryType, path: string) => {
    setQuery("");
    setDeleteOperation(undefined);
    setInlineError(undefined);
    setInlineValue(getEntryName(path));
    setInlineOperation({
      kind: entryType === "file" ? "rename-file" : "rename-folder",
      path,
    });
    setExpandedFolderPaths((current) => {
      const next = new Set(current);
      getAncestorFolderPaths(path).forEach((folderPath) => next.add(folderPath));
      return next;
    });
  };

  const cancelInlineOperation = () => {
    if (inlineSubmissionRef.current) return;
    setInlineOperation(undefined);
    setInlineError(undefined);
    setInlineValue("");
  };

  const submitInlineOperation = async () => {
    const operation = inlineOperation;
    const name = inlineValue.trim();
    if (!operation || inlineSubmissionRef.current) return;
    if (!name) {
      cancelInlineOperation();
      return;
    }
    if (name.includes("/") || name.includes("\\")) {
      setInlineError("Enter a name without folder separators.");
      return;
    }

    inlineSubmissionRef.current = true;
    setIsInlineSubmitting(true);
    setInlineError(undefined);
    try {
      if (operation.kind === "create-file") {
        await onCreateFile(joinPath(operation.parentPath, name));
      } else if (operation.kind === "create-folder") {
        const createdPath = joinPath(operation.parentPath, name);
        await onCreateDirectory(createdPath);
        setExpandedFolderPaths((current) => new Set(current).add(createdPath));
      } else if (operation.kind === "rename-file") {
        await onRenameFile(operation.path, joinPath(getParentPath(operation.path), name));
      } else if (operation.kind === "rename-folder") {
        await onRenameDirectory(operation.path, joinPath(getParentPath(operation.path), name));
      }
      setInlineOperation(undefined);
      setInlineValue("");
    } catch (error) {
      setInlineError(getOperationError(error));
    } finally {
      inlineSubmissionRef.current = false;
      setIsInlineSubmitting(false);
    }
  };

  const beginDelete = (entryType: ProjectFileEntryType, path: string) => {
    if (inlineSubmissionRef.current) return;
    setInlineOperation(undefined);
    setInlineError(undefined);
    setInlineValue("");
    setDeleteError(undefined);
    setDeleteOperation({
      kind: entryType === "file" ? "delete-file" : "delete-folder",
      path,
    });
  };

  const closeDeleteConfirmation = () => {
    if (isDeleting) return;
    setDeleteOperation(undefined);
    setDeleteError(undefined);
  };

  const confirmDelete = async () => {
    const operation = deleteOperation;
    if (!operation || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(undefined);
    try {
      if (operation.kind === "delete-file") await onDeleteFile(operation.path);
      else await onDeleteDirectory(operation.path);
      setDeleteOperation(undefined);
    } catch (error) {
      setDeleteError(getOperationError(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const treeActions: ProjectFileTreeActions = {
    error: inlineError,
    inputRef: inlineInputRef,
    isSubmitting: isInlineSubmitting,
    onBeginCreate: beginCreate,
    onBeginDelete: beginDelete,
    onBeginRename: beginRename,
    onCancel: cancelInlineOperation,
    onSubmit: () => void submitInlineOperation(),
    onValueChange: setInlineValue,
    operation: inlineOperation,
    value: inlineValue,
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
            <PanelAction icon={FilePlus2} label="Create file" onClick={() => beginCreate("file", "")} />
            <PanelAction icon={FolderPlus} label="Create folder" onClick={() => beginCreate("folder", "")} />
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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
        <div aria-label="Workspace file tree" role="tree">
          <FolderTreeItem
            actions={treeActions}
            activeFilePath={activeFilePath}
            depth={0}
            expandedFolderPaths={expandedFolderPaths}
            isSearching={isSearching}
            node={visibleTree}
            onSelect={onSelect}
            onToggle={toggleFolder}
          />
        </div>
        {filteredFiles.length === 0 && filteredDirectories.length === 0 && !inlineOperation ? (
          <p className="px-7 py-3 text-xs text-muted-foreground" role="status">
            {isSearching ? "No matching files or folders." : "No project files yet."}
          </p>
        ) : null}
      </div>

      <DeleteConfirmation
        error={deleteError}
        isDeleting={isDeleting}
        onCancel={closeDeleteConfirmation}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open) closeDeleteConfirmation();
        }}
        operation={deleteOperation}
      />
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
  actions,
  activeFilePath,
  depth,
  expandedFolderPaths,
  isSearching,
  node,
  onSelect,
  onToggle,
}: Readonly<{
  actions: ProjectFileTreeActions;
  activeFilePath?: string;
  depth: number;
  expandedFolderPaths: ReadonlySet<string>;
  isSearching: boolean;
  node: WorkspaceFileTreeFolder;
  onSelect(path: string): void;
  onToggle(path: string): void;
}>) {
  const isExpanded = isSearching || expandedFolderPaths.has(node.path);
  const isRoot = !node.path;
  const isRenaming =
    actions.operation?.kind === "rename-folder" && actions.operation.path === node.path;
  const isCreatingHere =
    (actions.operation?.kind === "create-file" ||
      actions.operation?.kind === "create-folder") &&
    actions.operation.parentPath === node.path;
  const FolderIcon = isRoot ? CodeXml : isExpanded ? FolderOpen : Folder;
  const folderRow = (
    <div
      className="group flex h-7 w-full min-w-0 items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-within:bg-muted/60 focus-within:text-foreground"
      data-project-entry-row={isRoot ? WORKSPACE_ROOT_NAME : node.path}
      role="none"
    >
      {isRenaming ? (
        <InlineRenameContent
          actions={actions}
          depth={depth}
          entryType="folder"
          icon={FolderIcon}
          path={node.path}
        />
      ) : (
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
      )}
    </div>
  );

  return (
    <div
      aria-expanded={isExpanded}
      aria-label={isRoot ? WORKSPACE_ROOT_NAME : node.path}
      aria-selected={false}
      role="treeitem"
    >
      {isRenaming ? folderRow : (
        <ContextMenu.Root>
          <ContextMenu.Trigger>{folderRow}</ContextMenu.Trigger>
          <EntryContextMenu
            entryType="folder"
            isRoot={isRoot}
            onCreateFile={() => actions.onBeginCreate("file", node.path)}
            onCreateFolder={() => actions.onBeginCreate("folder", node.path)}
            onDelete={() => actions.onBeginDelete("folder", node.path)}
            onRename={() => actions.onBeginRename("folder", node.path)}
            path={isRoot ? WORKSPACE_ROOT_NAME : node.path}
          />
        </ContextMenu.Root>
      )}
      {isExpanded ? (
        <div role="group">
          {isCreatingHere ? (
            <InlineCreationRow actions={actions} depth={depth + 1} parentPath={node.path} />
          ) : null}
          {node.children.map((child) => child.type === "folder" ? (
            <FolderTreeItem
              actions={actions}
              activeFilePath={activeFilePath}
              depth={depth + 1}
              expandedFolderPaths={expandedFolderPaths}
              isSearching={isSearching}
              key={`folder:${child.path}`}
              node={child}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ) : (
            <FileTreeItem
              actions={actions}
              activeFilePath={activeFilePath}
              depth={depth + 1}
              key={`file:${child.path}`}
              node={child}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FileTreeItem({ actions, activeFilePath, depth, node, onSelect }: Readonly<{
  actions: ProjectFileTreeActions;
  activeFilePath?: string;
  depth: number;
  node: WorkspaceFileTreeFile;
  onSelect(path: string): void;
}>) {
  const isActive = node.path === activeFilePath;
  const isRenaming =
    actions.operation?.kind === "rename-file" && actions.operation.path === node.path;
  const fileRow = (
    <div
      className={cn(
        "group flex h-8 w-full min-w-0 items-center rounded-md transition-colors focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary/40",
        isActive
          ? "bg-primary/15 font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-within:bg-muted/60 focus-within:text-foreground",
      )}
      data-project-entry-row={node.path}
      role="none"
    >
      {isRenaming ? (
        <InlineRenameContent
          actions={actions}
          depth={depth}
          entryType="file"
          icon={FileCode2}
          path={node.path}
        />
      ) : (
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
      )}
    </div>
  );

  return (
    <div
      aria-label={node.path}
      aria-selected={isActive}
      role="treeitem"
    >
      {isRenaming ? fileRow : (
        <ContextMenu.Root>
          <ContextMenu.Trigger>{fileRow}</ContextMenu.Trigger>
          <EntryContextMenu
            entryType="file"
            onDelete={() => actions.onBeginDelete("file", node.path)}
            onRename={() => actions.onBeginRename("file", node.path)}
            path={node.path}
          />
        </ContextMenu.Root>
      )}
      {isRenaming && actions.error ? (
        <InlineOperationError depth={depth} error={actions.error} />
      ) : null}
    </div>
  );
}

function InlineRenameContent({ actions, depth, entryType, icon: Icon, path }: Readonly<{
  actions: InlineOperationBindings;
  depth: number;
  entryType: ProjectFileEntryType;
  icon: typeof Folder;
  path: string;
}>) {
  return (
    <div
      className="flex h-full min-w-0 flex-1 items-center gap-1.5 pr-1"
      style={{ paddingLeft: `${entryType === "folder" ? 0.35 + depth * 0.85 : 1.2 + depth * 0.85}rem` }}
    >
      {entryType === "folder" ? <span aria-hidden="true" className="size-3 shrink-0" /> : null}
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
      <InlineNameInput
        ariaLabel={`Rename ${entryType} ${path}`}
        disabled={actions.isSubmitting}
        error={actions.error}
        inputRef={actions.inputRef}
        onCancel={actions.onCancel}
        onSubmit={actions.onSubmit}
        onValueChange={actions.onValueChange}
        value={actions.value}
      />
    </div>
  );
}

function InlineCreationRow({ actions, depth, parentPath }: Readonly<{
  actions: InlineOperationBindings;
  depth: number;
  parentPath: string;
}>) {
  const operation = actions.operation;
  if (!operation?.kind.startsWith("create-")) return null;
  const entryType = operation.kind === "create-file" ? "file" : "folder";
  const Icon = entryType === "file" ? FileCode2 : FolderPlus;
  const destination = parentPath || WORKSPACE_ROOT_NAME;
  return (
    <div
      aria-label={`New ${entryType} in ${destination}`}
      aria-selected={false}
      role="treeitem"
    >
      <div
        className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md bg-primary/10 pr-1 text-foreground ring-1 ring-inset ring-primary/25"
        data-inline-create-parent={destination}
        style={{ paddingLeft: `${1.2 + depth * 0.85}rem` }}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        <InlineNameInput
          ariaLabel={`New ${entryType} name in ${destination}`}
          disabled={actions.isSubmitting}
          error={actions.error}
          inputRef={actions.inputRef}
          onCancel={actions.onCancel}
          onSubmit={actions.onSubmit}
          onValueChange={actions.onValueChange}
          value={actions.value}
        />
      </div>
      {actions.error ? <InlineOperationError depth={depth} error={actions.error} /> : null}
    </div>
  );
}

function InlineNameInput({
  ariaLabel,
  disabled,
  error,
  inputRef,
  onCancel,
  onSubmit,
  onValueChange,
  value,
}: Readonly<{
  ariaLabel: string;
  disabled: boolean;
  error?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onCancel(): void;
  onSubmit(): void;
  onValueChange(value: string): void;
  value: string;
}>) {
  const ignoreBlurRef = useRef(false);
  return (
    <input
      aria-invalid={Boolean(error)}
      aria-label={ariaLabel}
      className="h-6 min-w-0 flex-1 rounded border border-primary/45 bg-background px-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/25"
      disabled={disabled}
      onBlur={() => {
        if (ignoreBlurRef.current) return;
        if (value.trim()) onSubmit();
        else onCancel();
      }}
      onChange={(event) => onValueChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          ignoreBlurRef.current = true;
          onCancel();
        }
      }}
      ref={inputRef}
      spellCheck={false}
      value={value}
    />
  );
}

function InlineOperationError({ depth, error }: Readonly<{ depth: number; error: string }>) {
  return (
    <p
      className="py-1 pr-2 text-[0.65rem] leading-tight text-destructive"
      role="alert"
      style={{ paddingLeft: `${1.2 + depth * 0.85}rem` }}
    >
      {error}
    </p>
  );
}

function EntryContextMenu({
  entryType,
  isRoot = false,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRename,
  path,
}: Readonly<{
  entryType: ProjectFileEntryType;
  isRoot?: boolean;
  onCreateFile?(): void;
  onCreateFolder?(): void;
  onDelete(): void;
  onRename(): void;
  path: string;
}>) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Positioner className="z-50 outline-none">
        <ContextMenu.Popup
          aria-label={`${entryType === "folder" ? "Folder" : "File"} actions for ${path}`}
          className="min-w-36 origin-[var(--transform-origin)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
        >
          {entryType === "folder" ? (
            <>
              <ContextMenuItem icon={FilePlus2} label="New File" onClick={onCreateFile} />
              <ContextMenuItem icon={FolderPlus} label="New Folder" onClick={onCreateFolder} />
              {!isRoot ? <ContextMenu.Separator className="my-1 h-px bg-border" /> : null}
            </>
          ) : null}
          {!isRoot ? (
            <>
              <ContextMenuItem icon={Pencil} label="Rename" onClick={onRename} />
              <ContextMenuItem destructive icon={Trash2} label="Delete" onClick={onDelete} />
            </>
          ) : null}
        </ContextMenu.Popup>
      </ContextMenu.Positioner>
    </ContextMenu.Portal>
  );
}

function ContextMenuItem({ destructive = false, icon: Icon, label, onClick }: Readonly<{
  destructive?: boolean;
  icon: typeof FilePlus2;
  label: string;
  onClick?(): void;
}>) {
  return (
    <ContextMenu.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none select-none data-highlighted:bg-muted data-highlighted:text-foreground",
        destructive && "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive",
      )}
      data-context-menu-action={label}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </ContextMenu.Item>
  );
}

function DeleteConfirmation({
  error,
  isDeleting,
  onCancel,
  onConfirm,
  onOpenChange,
  operation,
}: Readonly<{
  error?: string;
  isDeleting: boolean;
  onCancel(): void;
  onConfirm(): void;
  onOpenChange(open: boolean): void;
  operation?: DeleteProjectFileOperation;
}>) {
  const entryType = operation?.kind === "delete-folder" ? "folder" : "file";
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={Boolean(operation)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 min-h-dvh bg-background/65 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <Dialog.Title className="text-sm font-semibold">
            Delete {entryType}?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">
            This will delete <span className="font-medium text-foreground">{operation?.path}</span>
            {entryType === "folder" ? " and every file and folder inside it" : " from the lesson workspace"}.
          </Dialog.Description>
          {error ? <p className="mt-2 text-xs text-destructive" role="alert">{error}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              disabled={isDeleting}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 disabled:opacity-50"
              disabled={isDeleting}
              onClick={onConfirm}
              type="button"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PanelAction({ icon: Icon, label, onClick }: Readonly<{
  icon: typeof FilePlus2;
  label: string;
  onClick(): void;
}>) {
  return (
    <button
      aria-label={label}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      data-tooltip={label}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
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

function getOperationError(error: unknown): string {
  return error instanceof Error ? error.message : "The file operation failed.";
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
