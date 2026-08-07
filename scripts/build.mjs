import { readdir, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(packageRoot, "src");
const outputRoot = path.join(packageRoot, "dist");
const manifest = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);

if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error("package.json must contain a semantic version before building.");
}

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
  })
    .replaceAll(/(from\s+["'][^"']+)\.ts(["'])/g, "$1.js$2")
    .replaceAll("__K_TEACH_PACKAGE_VERSION__", manifest.version)
    .replace(/[ \t]+$/gm, "");
  await writeFile(
    path.join(outputRoot, file.replace(/\.ts$/, ".js")),
    javascript,
    "utf8",
  );
}

const { emitWebTeachingThemesCss } = await import(
  path.join(outputRoot, "teaching-themes.js")
);
const teachingThemesCss = path.join(
  packageRoot,
  "assets",
  "field-manual",
  "teaching-themes.css",
);
await mkdir(path.dirname(teachingThemesCss), { recursive: true });
await writeFile(teachingThemesCss, emitWebTeachingThemesCss(), "utf8");

process.stderr.write(`Built ${sourceFiles.length} modules in dist/.\n`);
