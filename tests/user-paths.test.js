import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { userCacheDir, userConfigDir } from "../src/user-paths.ts";

test("user paths follow XDG on Linux", () => {
  const environment = { XDG_CONFIG_HOME: "/config", XDG_CACHE_HOME: "/cache", HOME: "/home/learner" };
  assert.equal(userConfigDir({ environment, platform: "linux" }), path.join("/config", "k-teach"));
  assert.equal(userCacheDir({ environment, platform: "linux" }), path.join("/cache", "k-teach"));
});

test("user paths preserve the established home layout on macOS", () => {
  const environment = { HOME: "/Users/learner" };
  assert.equal(userConfigDir({ environment, platform: "darwin" }), path.join("/Users/learner", ".config", "k-teach"));
  assert.equal(userCacheDir({ environment, platform: "darwin" }), path.join("/Users/learner", ".cache", "k-teach"));
});

test("user paths use roaming config and local cache on Windows", () => {
  const environment = {
    APPDATA: "C:\\Users\\learner\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\learner\\AppData\\Local",
    USERPROFILE: "C:\\Users\\learner",
  };
  assert.equal(userConfigDir({ environment, platform: "win32" }), path.join(environment.APPDATA, "k-teach"));
  assert.equal(userCacheDir({ environment, platform: "win32" }), path.join(environment.LOCALAPPDATA, "k-teach", "cache"));
});
