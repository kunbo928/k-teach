import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveConfig, resolveTeachOutputDirectory } from "../src/config.ts";

test("config precedence is CLI, workspace, user, then defaults", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-config-"));
  const userConfigDir = path.join(root, "user");
  const workspace = path.join(root, "workspace");
  await mkdir(userConfigDir);
  await mkdir(workspace);
  await writeFile(
    path.join(userConfigDir, "config.yaml"),
    "output_dir: user-output\nvisuals: off\nwechat_account: personal\n",
  );
  await writeFile(
    path.join(workspace, "config.yaml"),
    "schema_version: 1\noutput_dir: workspace-output\nvisuals: auto\n",
  );

  const config = await resolveConfig({
    cwd: workspace,
    userConfigDir,
    cli: { visuals: "required" },
  });

  assert.deepEqual(config, {
    schema_version: 1,
    design_profile: "field-manual",
    output_dir: path.join(workspace, "workspace-output"),
    visuals: "required",
    wechat_account: "personal",
  });
});

test("config rejects unknown keys and secret-shaped keys", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-secret-"));
  await writeFile(
    path.join(root, "config.yaml"),
    "schema_version: 1\napp_secret: should-not-live-here\n",
  );

  await assert.rejects(
    () => resolveConfig({ cwd: root, userConfigDir: path.join(root, "none") }),
    (error) =>
      error.code === "invalid-workspace" &&
      error.context.keys.includes("app_secret"),
  );
});

test("default output directory follows the nearest Teach id", () => {
  assert.equal(
    resolveTeachOutputDirectory(path.join("project", "main"), path.join("project", "teachs", "main")),
    path.join("project", "main"),
  );
  assert.equal(
    resolveTeachOutputDirectory(path.join("project", "main"), path.join("project", "teachs", "alpha")),
    path.join("project", "alpha"),
  );
  assert.equal(
    resolveTeachOutputDirectory(path.join("custom", "output"), path.join("project", "teachs", "alpha")),
    path.join("custom", "output"),
  );
});
