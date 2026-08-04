import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";

import type { WechatAccount, WechatAccountRegistry } from "./domain.ts";
import { KTeachError } from "./errors.ts";
import { validateDocument } from "./schema.ts";
import { userConfigDir } from "./user-paths.ts";

export function wechatAccountsPath(environment: NodeJS.ProcessEnv = process.env): string {
  return path.join(userConfigDir({ environment }), "wechat-accounts.yaml");
}

export async function readWechatAccounts(file = wechatAccountsPath()): Promise<WechatAccountRegistry> {
  try {
    const value = parse(await readFile(file, "utf8")) as unknown;
    const errors = await validateDocument("wechat-accounts", value);
    if (errors.length > 0) throw new KTeachError("validation-failed", `WeChat account registry is invalid: ${errors.join("; ")}.`, `Correct ${file}; never add AppSecret to this file.`);
    return value as WechatAccountRegistry;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { schema_version: 1, accounts: [] };
    throw error;
  }
}

export async function addWechatAccount(account: WechatAccount, file = wechatAccountsPath()): Promise<void> {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(account.alias)) throw new KTeachError("validation-failed", "WeChat account alias contains unsupported characters.", "Use letters, digits, hyphens, or underscores.");
  const registry = await readWechatAccounts(file);
  const existing = registry.accounts.findIndex((item) => item.alias === account.alias);
  if (existing >= 0) registry.accounts[existing] = account;
  else registry.accounts.push(account);
  registry.accounts.sort((left, right) => left.alias.localeCompare(right.alias));
  const errors = await validateDocument("wechat-accounts", registry);
  if (errors.length > 0) throw new KTeachError("validation-failed", `WeChat account is invalid: ${errors.join("; ")}.`, "Provide alias, display name, and AppID only.");
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, stringify(registry), { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);
}

export async function requireWechatAccount(alias: string, file = wechatAccountsPath()): Promise<WechatAccount> {
  const registry = await readWechatAccounts(file);
  const account = registry.accounts.find((item) => item.alias === alias);
  if (!account) throw new KTeachError("credential-missing", `WeChat account alias is not registered: ${alias}.`, `Run k-teach wechat account add ${alias} --app-id <id> --name <name>.`);
  return account;
}

export async function markWechatAccountSuccessful(alias: string, file = wechatAccountsPath()): Promise<void> {
  const registry = await readWechatAccounts(file);
  if (!registry.accounts.some((item) => item.alias === alias)) return;
  registry.last_successful_alias = alias;
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, stringify(registry), { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);
}

export function maskedAppId(appId: string): string {
  return `${"•".repeat(Math.min(6, Math.max(2, appId.length - 6)))}${appId.slice(-6)}`;
}
