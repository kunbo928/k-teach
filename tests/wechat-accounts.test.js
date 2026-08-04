import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  addWechatAccount,
  maskedAppId,
  readWechatAccounts,
  requireWechatAccount,
} from "../src/wechat-accounts.ts";
import { resolveWechatCredentials } from "../src/wechat-publisher.ts";

test("user account registry stores multiple AppIDs but never a secret", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-accounts-"));
  const file = path.join(root, "k-teach", "wechat-accounts.yaml");
  await addWechatAccount({ alias: "b", name: "帐号 B", app_id: "wxBBBBBB" }, file);
  await addWechatAccount({ alias: "a", name: "帐号 A", app_id: "wxAAAAAA" }, file);
  const registry = await readWechatAccounts(file);
  assert.deepEqual(registry.accounts.map((item) => item.alias), ["a", "b"]);
  assert.equal((await requireWechatAccount("b", file)).name, "帐号 B");
  const source = await readFile(file, "utf8");
  assert.doesNotMatch(source, /secret|APP_SECRET/i);
  if (process.platform !== "win32") {
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  }
  assert.equal(maskedAppId("wx123456789"), "•••••456789");
});

test("registered AppID combines with alias-specific environment secret", () => {
  const credentials = resolveWechatCredentials(
    "account-a",
    { K_TEACH_WECHAT_ACCOUNT_A_APP_SECRET: "secret-value" },
    "registered-app-id",
  );
  assert.deepEqual(credentials, {
    appId: "registered-app-id",
    appSecret: "secret-value",
  });
});
