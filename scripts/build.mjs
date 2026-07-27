import { readdir, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(packageRoot, "src");
const outputRoot = path.join(packageRoot, "dist");

if (path.basename(outputRoot) !== "dist" || path.dirname(outputRoot) !== packageRoot) {
  throw new Error("Refusing to build outside the package dist directory.");
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const sourceFiles = (await readdir(sourceRoot))
  .filter((file) => file.endsWith(".ts"))
  .sort();

for (const file of sourceFiles) {
  const source = await readFile(path.join(sourceRoot, file), "utf8");
  const javascript = stripTypeScriptTypes(source, {
    mode: "strip",
    sourceUrl: `k-teach/src/${file}`,
  }).replaceAll(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2");
  await writeFile(
    path.join(outputRoot, file.replace(/\.ts$/, ".js")),
    javascript,
    "utf8",
  );
}

process.stdout.write(`Built ${sourceFiles.length} modules in dist/.\n`);
