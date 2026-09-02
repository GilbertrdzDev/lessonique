import type { WorkspaceFile } from "./contracts";

export function deriveWorkspaceDirectories(
  files: readonly WorkspaceFile[],
  explicitDirectories: readonly string[] = [],
): string[] {
  const directories = new Set<string>();
  explicitDirectories.forEach((path) => addPathWithAncestors(directories, path));
  files.forEach(({ path }) => {
    const segments = path.split("/").slice(0, -1);
    segments.forEach((_, index) => {
      directories.add(segments.slice(0, index + 1).join("/"));
    });
  });
  return [...directories].toSorted((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

export function isSameOrDescendantPath(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`);
}

export function replaceWorkspacePathPrefix(
  path: string,
  previousPrefix: string,
  nextPrefix: string,
): string {
  return path === previousPrefix
    ? nextPrefix
    : `${nextPrefix}${path.slice(previousPrefix.length)}`;
}

export function getWorkspaceParentPath(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
}

export function getWorkspaceEntryName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function addPathWithAncestors(paths: Set<string>, path: string): void {
  const segments = path.split("/");
  segments.forEach((_, index) => {
    const candidate = segments.slice(0, index + 1).join("/");
    if (candidate.length > 0) {
      paths.add(candidate);
    }
  });
}
