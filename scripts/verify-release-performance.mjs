import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve(
  ".next/server/app/page/react-loadable-manifest.json",
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expectedLazyModules = [
  { label: "Monaco editor", marker: "Workspace code editor" },
  { label: "Sandpack runtime", marker: "lessonique.preview.v1" },
];
const lazyChunks = await Promise.all(
  Object.values(manifest).map(async (entry) => {
    if (!Array.isArray(entry?.files) || entry.files.length === 0) {
      throw new Error("A lazy production entry has no chunk files.");
    }
    const contents = await Promise.all(
      entry.files.map((file) => readFile(resolve(".next", file), "utf8")),
    );
    return contents.join("\n");
  }),
);

for (const expectedModule of expectedLazyModules) {
  if (!lazyChunks.some((chunk) => chunk.includes(expectedModule.marker))) {
    throw new Error(
      `The production manifest does not contain a lazy ${expectedModule.label} chunk.`,
    );
  }
}

console.log(
  `Verified ${expectedLazyModules.length} lazy workspace runtime modules in the production manifest.`,
);
