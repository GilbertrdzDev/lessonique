import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const packageManifest = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const productionDependencies = Object.keys(packageManifest.dependencies ?? {});
const forbiddenDependencyName = /(?:^|[-_/])(audio|speech|text-to-speech|tts|voice)(?:$|[-_/])/iu;
const forbiddenDependencies = productionDependencies.filter((dependency) =>
  forbiddenDependencyName.test(dependency),
);
if (forbiddenDependencies.length > 0) {
  throw new Error(
    `Forbidden in-app voice or audio dependencies: ${forbiddenDependencies.join(", ")}`,
  );
}

const runtimePatterns = [
  { label: "speech synthesis playback", pattern: /\bspeechSynthesis\s*\.\s*speak\s*\(/u },
  { label: "speech recognition", pattern: /\bnew\s+(?:webkit)?SpeechRecognition\s*\(/u },
  { label: "audio context", pattern: /\bnew\s+(?:webkit)?AudioContext\s*\(/u },
  { label: "HTML audio playback", pattern: /\bnew\s+Audio\s*\(/u },
];
const sourceFiles = await collectFiles(resolve("src"), (path) =>
  [".ts", ".tsx", ".js", ".jsx"].includes(extname(path)) &&
  !/\.(?:test|spec)\.[^.]+$/u.test(path),
);
const bundleFiles = await collectFiles(
  resolve(".next/static"),
  (path) => extname(path) === ".js",
);
const violations = [];
for (const [scope, files] of [
  ["source", sourceFiles],
  ["browser bundle", bundleFiles],
]) {
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    for (const check of runtimePatterns) {
      if (check.pattern.test(contents)) {
        violations.push(`${scope}: ${check.label} in ${file}`);
      }
    }
  }
}
if (violations.length > 0) {
  throw new Error(`Forbidden browser runtime behavior found:\n${violations.join("\n")}`);
}

console.log(
  `Verified ${productionDependencies.length} production dependencies, ${sourceFiles.length} source files, and ${bundleFiles.length} browser chunks with no voice, audio, speech, or TTS implementation.`,
);

async function collectFiles(root, include) {
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name))
    .filter(include);
}
