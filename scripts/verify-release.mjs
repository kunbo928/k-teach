import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifest = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);
const refType = process.env.GITHUB_REF_TYPE;
const refName = process.env.GITHUB_REF_NAME;

function fail(message) {
  process.stderr.write(`release-metadata-invalid: ${message}\n`);
  process.exitCode = 1;
}

if (refType !== "tag") {
  fail("release must run from a tag.");
} else if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(refName ?? "")) {
  fail(`tag ${refName ?? "<missing>"} is not v<SemVer>.`);
} else if (refName.slice(1) !== manifest.version) {
  fail(
    `tag ${refName} does not match package version ${manifest.version}.`,
  );
} else if (manifest.name !== "k-teach") {
  fail("package name must be k-teach.");
} else if (manifest.private !== false) {
  fail("package must explicitly set private to false.");
} else if (manifest.license !== "MIT") {
  fail("package license must be MIT.");
} else if (
  manifest.repository?.url !==
  "git+https://github.com/kunbo928/k-teach.git"
) {
  fail("repository URL does not match the publishing repository.");
} else {
  process.stdout.write(`Release metadata valid for ${manifest.name}@${manifest.version}.\n`);
}
