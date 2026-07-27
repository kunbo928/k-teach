import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { validateDocument } from "../src/schema.ts";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("bin/k-teach.js");
const fixturesPath = path.resolve("tests/fixtures/diagrams");

async function runCli(args, cwd) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd,
      encoding: "utf8",
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: error.code,
    };
  }
}

test("Diagram Spec schema accepts the core flow vocabulary", async () => {
  const spec = {
    schema_version: 1,
    id: "request-flow",
    title: "请求处理流程",
    description: "从收到请求到返回响应的主流程。",
    kind: "flow",
    direction: "top-to-bottom",
    nodes: [
      { id: "receive", label: "收到请求", role: "start" },
      { id: "validate", label: "验证输入", role: "decision" },
      { id: "respond", label: "返回响应", role: "end" },
    ],
    edges: [
      { from: "receive", to: "validate" },
      { from: "validate", to: "respond", label: "有效" },
    ],
  };

  assert.deepEqual(await validateDocument("diagram-spec", spec), []);
});

test("render diagram creates deterministic accessible SVG, PNG, and manifest", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "k-teach-diagram-"));
  const input = path.join(fixturesPath, "flow.yaml");

  const first = await runCli(
    ["render", "diagram", input, "--output", output],
    process.cwd(),
  );
  assert.equal(first.exitCode, 0, first.stderr);
  const svgPath = path.join(output, "request-flow.svg");
  const pngPath = path.join(output, "request-flow@2x.png");
  const manifestPath = path.join(output, "request-flow.manifest.json");
  const [svg, firstPng, firstManifest] = await Promise.all([
    readFile(svgPath, "utf8"),
    readFile(pngPath),
    readFile(manifestPath, "utf8"),
    stat(pngPath),
  ]);

  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-labelledby="request-flow-title request-flow-desc"/);
  assert.match(svg, /viewBox="0 0 [0-9]+ [0-9]+"/);
  assert.doesNotMatch(svg.match(/^<svg[^>]+>/)?.[0] ?? "", /(?:width|height)=/);
  assert.match(svg, /var\(--kt-diagram-accent, #315c49\)/);
  const manifest = JSON.parse(firstManifest);
  assert.deepEqual(await validateDocument("diagram-manifest", manifest), []);
  assert.equal(manifest.kind, "flow");
  assert.equal(manifest.scale, 2);
  assert.deepEqual(manifest.files, [
    "request-flow.svg",
    "request-flow@2x.png",
  ]);

  const second = await runCli(
    ["render", "diagram", input, "--output", output],
    process.cwd(),
  );
  assert.equal(second.exitCode, 0, second.stderr);
  assert.equal(await readFile(svgPath, "utf8"), svg);
  assert.deepEqual(await readFile(pngPath), firstPng);
  assert.equal(await readFile(manifestPath, "utf8"), firstManifest);
});

test("flow, relationship, and state fixtures all render through one command", async () => {
  for (const fixture of ["flow.yaml", "relationship.yaml", "state.yaml"]) {
    const output = await mkdtemp(path.join(tmpdir(), "k-teach-kinds-"));
    const result = await runCli(
      [
        "render",
        "diagram",
        path.join(fixturesPath, fixture),
        "--output",
        output,
      ],
      process.cwd(),
    );
    assert.equal(result.exitCode, 0, `${fixture}: ${result.stderr}`);
  }
});
