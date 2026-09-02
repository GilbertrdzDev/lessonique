import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(
  workspaceRoot,
  "node_modules",
  "monaco-editor",
  "min",
  "vs",
);
const vendorDirectory = join(workspaceRoot, "public", "vendor");
const targetDirectory = join(vendorDirectory, "monaco", "vs");

if (!existsSync(sourceDirectory)) {
  throw new Error(
    "Monaco Editor assets are unavailable. Install project dependencies first.",
  );
}

if (!targetDirectory.startsWith(`${vendorDirectory}${sep}`)) {
  throw new Error("Refusing to synchronize Monaco assets outside public/vendor.");
}

rmSync(targetDirectory, { force: true, recursive: true });
mkdirSync(dirname(targetDirectory), { recursive: true });
cpSync(sourceDirectory, targetDirectory, { recursive: true });
