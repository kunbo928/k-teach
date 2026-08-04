import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type ServerResponse } from "node:http";
import path from "node:path";
import { createConnection } from "node:net";

import { createServer as createViteServer, type Plugin, type ViteDevServer } from "vite";
import { userCacheDir } from "./user-paths.ts";

export interface PreviewRuntimeOptions {
  projectRoot: string;
  host: string;
  port: number;
  teaches: readonly PreviewRuntimeTeach[];
  cacheDir?: string;
  onInputChange?: (file: string) => Promise<void>;
}

export interface PreviewRuntimeTeach {
  id: string;
  title: string;
  root: string;
  artifactRoot?: string;
}

export interface PreviewRuntime {
  url: string;
  port: number;
  instanceId: string;
  reused: boolean;
  notices: string[];
  closed: Promise<"closed" | "project-missing">;
  close(): Promise<void>;
}

const TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function errorPage(title: string, detail: string, nextAction: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#f3f0e8;color:#17251e;font:16px/1.7 system-ui,sans-serif}main{max-width:720px;margin:12vh auto;padding:32px;border-top:6px solid #1f5a43;background:#fff}code{background:#e8eee9;padding:2px 6px}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><p><strong>下一步：</strong>${escapeHtml(nextAction)}</p></main></body></html>`;
}

async function artifactEntries(teach: PreviewRuntimeTeach, kind: "ppt" | "wechat") {
  const directory = path.join(teach.artifactRoot ?? teach.root, kind);
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ id: entry.name, teachId: teach.id }));
  } catch {
    return [];
  }
}

async function projectIndex(teaches: readonly PreviewRuntimeTeach[]): Promise<string> {
  const teachItems = teaches
    .map((teach) => `<li><a href="/teachs/${encodeURIComponent(teach.id)}/">${escapeHtml(teach.title)}</a></li>`)
    .join("");
  const ppt = (await Promise.all(teaches.map((teach) => artifactEntries(teach, "ppt")))).flat();
  const wechat = (await Promise.all(teaches.map((teach) => artifactEntries(teach, "wechat")))).flat();
  const derived = [
    ...ppt.map((item) => `<li><a href="/ppt/${encodeURIComponent(item.id)}/">PPT · ${escapeHtml(item.id)}</a></li>`),
    ...wechat.map((item) => `<li><a href="/wechat/${encodeURIComponent(item.id)}/">公众号 · ${escapeHtml(item.id)}</a></li>`),
  ].join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>K Teach Project Preview</title></head><body><main><h1>Learning Project</h1><h2>Teachs</h2><ul>${teachItems}</ul><h2>派生产物</h2><ul>${derived || "<li>尚未生成 PPT 或公众号预览</li>"}</ul></main></body></html>`;
}

function safeFile(root: string, requestPath: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return undefined;
  }
  if (decoded.split("/").includes("..")) return undefined;
  const relative = decoded === "/" || decoded === "" ? "index.html" : decoded.replace(/^\/+/, "");
  const absoluteRoot = path.resolve(root);
  const file = path.resolve(absoluteRoot, relative);
  return file === absoluteRoot || file.startsWith(`${absoluteRoot}${path.sep}`) ? file : undefined;
}

async function sendFile(root: string, requestPath: string, response: ServerResponse): Promise<boolean> {
  const file = safeFile(root, requestPath);
  if (!file) return false;
  try {
    const info = await stat(file);
    if (!info.isFile()) return false;
    const headers = {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (path.extname(file) === ".html") {
      const source = await readFile(file, "utf8");
      const client = `<script data-k-teach-preview-client>(()=>{let revision;setInterval(async()=>{try{const response=await fetch('/__k_teach/health',{cache:'no-store'}),state=await response.json();if(revision!==undefined&&state.revision!==revision&&!state.last_error)location.reload();revision=state.revision;let overlay=document.querySelector('[data-k-teach-preview-error]');if(state.last_error){if(!overlay){overlay=document.createElement('aside');overlay.dataset.kTeachPreviewError='';overlay.style.cssText='position:fixed;z-index:2147483647;left:16px;right:16px;bottom:16px;padding:14px 18px;background:#6b1f1f;color:white;font:14px/1.5 system-ui;box-shadow:0 8px 32px #0008';document.body.append(overlay)}overlay.textContent='K Teach render failed · '+state.last_error}else overlay?.remove()}catch{}},1000)})()</script>`;
      response.writeHead(200, headers);
      response.end(source.includes("</body>") ? source.replace("</body>", `${client}</body>`) : `${source}${client}`);
      return true;
    }
    response.writeHead(200, headers);
    createReadStream(file).pipe(response);
    return true;
  } catch {
    return false;
  }
}

function previewPlugin(options: PreviewRuntimeOptions, instanceId: string): Plugin {
  const teaches = new Map(options.teaches.map((teach) => [teach.id, teach]));
  let revision = 0;
  let lastError: string | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  return {
    name: "k-teach-preview-runtime",
    configureServer(server) {
      const changed = (file: string) => {
        if (file.includes(`${path.sep}.k-teach${path.sep}output${path.sep}`) || file.includes(`${path.sep}.git${path.sep}`)) return;
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
          void (options.onInputChange?.(file) ?? Promise.resolve()).then(() => {
            lastError = undefined;
            revision += 1;
          }).catch((error) => {
            lastError = error instanceof Error ? error.message : String(error);
            revision += 1;
          });
        }, 160);
      };
      server.watcher.on("add", changed);
      server.watcher.on("change", changed);
      server.watcher.on("unlink", changed);
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        if (pathname === "/__k_teach/health") {
          const projectExists = await access(options.projectRoot).then(() => true, () => false);
          response.writeHead(projectExists ? 200 : 410, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          response.end(JSON.stringify({ service: "k-teach-preview", instance_id: instanceId, project_root: path.resolve(options.projectRoot), project_exists: projectExists, routes: options.teaches.map((teach) => teach.id), revision, last_error: lastError }));
          return;
        }
        if (pathname === "/") {
          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          response.end(await projectIndex(options.teaches));
          return;
        }
        const teachMatch = pathname.match(/^\/teachs\/([^/]+)(\/.*)?$/);
        if (teachMatch) {
          const teach = teaches.get(decodeURIComponent(teachMatch[1]));
          if (teach && await sendFile(teach.root, teachMatch[2] ?? "/", response)) return;
          response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          response.end(errorPage("Teach 预览不存在", pathname, "先运行 k-teach render web，再刷新此页面。"));
          return;
        }
        const artifactMatch = pathname.match(/^\/(ppt|wechat)\/([^/]+)(\/.*)?$/);
        if (artifactMatch) {
          const kind = artifactMatch[1] as "ppt" | "wechat";
          const id = decodeURIComponent(artifactMatch[2]);
          let root: string | undefined;
          for (const teach of options.teaches) {
            const candidate = path.join(teach.artifactRoot ?? teach.root, kind, id);
            if (await access(candidate).then(() => true, () => false)) {
              root = candidate;
              break;
            }
          }
          const suffix = artifactMatch[3];
          const requested = !suffix || suffix === "/" ? (kind === "wechat"
            ? await access(path.join(root ?? "", "proposals.html")).then(() => "/proposals.html", () => "/preview.html")
            : "/index.html") : suffix;
          if (root && await sendFile(root, requested, response)) return;
          response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
          response.end(errorPage("派生产物尚未生成", `${kind}/${id}`, `先运行对应的 k-teach render ${kind === "ppt" ? "ppt" : "wechat"} 命令。`));
          return;
        }
        next();
      });
    },
  };
}

async function probe(port: number, host: string): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetch(`http://${host}:${port}/__k_teach/health`, {
      signal: AbortSignal.timeout(350),
    });
    if (!response.ok) return undefined;
    return await response.json() as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function portOccupied(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const finish = (occupied: boolean) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.setTimeout(350);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function writeInstanceRecord(options: PreviewRuntimeOptions, port: number, instanceId: string): Promise<void> {
  const cacheRoot = path.join(options.cacheDir ?? userCacheDir({ cwd: options.projectRoot }), "preview-instances");
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
  const key = Buffer.from(path.resolve(options.projectRoot)).toString("base64url");
  const destination = path.join(cacheRoot, `${key}.json`);
  await writeFile(destination, `${JSON.stringify({ pid: process.pid, port, project_root: path.resolve(options.projectRoot), instance_id: instanceId }, null, 2)}\n`, { mode: 0o600 });
  await chmod(destination, 0o600);
}

export async function startPreviewRuntime(options: PreviewRuntimeOptions): Promise<PreviewRuntime> {
  const projectIdentity = await stat(options.projectRoot);
  const notices: string[] = [];
  let selectedPort = options.port;
  if (selectedPort > 0) {
    for (let candidate = selectedPort; candidate < selectedPort + 20; candidate += 1) {
      const health = await probe(candidate, options.host);
      if (health?.service === "k-teach-preview" && health.project_root === path.resolve(options.projectRoot)) {
        return {
          url: `http://${options.host}:${candidate}/`,
          port: candidate,
          instanceId: String(health.instance_id),
          reused: true,
          notices,
          closed: Promise.resolve("closed"),
          close: async () => {},
        };
      }
      if (health) {
        notices.push(`Port ${candidate} belongs to another healthy K Teach project; using the next port.`);
        continue;
      }
      if (await portOccupied(candidate, options.host)) {
        notices.push(`Port ${candidate} is occupied by a non-K-Teach service; it was left untouched and the next port will be used.`);
        continue;
      }
      selectedPort = candidate;
      break;
    }
  }
  const instanceId = randomUUID();
  let resolveClosed!: (reason: "closed" | "project-missing") => void;
  const closed = new Promise<"closed" | "project-missing">((resolve) => { resolveClosed = resolve; });
  let closing: Promise<void> | undefined;
  let vite: ViteDevServer | undefined;
  const http = createHttpServer((request, response) => vite?.middlewares(request, response, () => {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(errorPage("预览路由不存在", request.url ?? "/", "返回项目预览首页选择已有产物。"));
  }));
  vite = await createViteServer({
    appType: "custom",
    clearScreen: false,
    configFile: false,
    cacheDir: path.join(options.cacheDir ?? userCacheDir({ cwd: options.projectRoot }), "vite"),
    root: options.projectRoot,
    logLevel: "silent",
    plugins: [previewPlugin(options, instanceId)],
    server: { middlewareMode: true, hmr: false, watch: { ignored: ["**/.git/**"] } },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      http.once("error", reject);
      http.listen(selectedPort, options.host, resolve);
    });
  } catch (error) {
    await vite.close();
    throw error;
  }
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Preview runtime has no TCP address.");
  const url = `http://${options.host}:${address.port}/`;
  const health = await fetch(new URL("__k_teach/health", url));
  if (!health.ok) {
    await vite.close();
    http.close();
    throw new Error(`Preview health check failed with HTTP ${health.status}.`);
  }
  await writeInstanceRecord(options, address.port, instanceId);
  const closeRuntime = (reason: "closed" | "project-missing" = "closed"): Promise<void> => {
    if (closing) return closing;
    closing = (async () => {
      clearInterval(rootMonitor);
      await vite?.close();
      await new Promise<void>((resolve, reject) => http.close((error) => error ? reject(error) : resolve()));
      resolveClosed(reason);
    })();
    return closing;
  };
  const rootMonitor = setInterval(() => {
    void stat(options.projectRoot).then((current) => {
      if (current.dev !== projectIdentity.dev || current.ino !== projectIdentity.ino) throw new Error("project identity changed");
    }).catch(() => {
        process.stderr.write(`invalid-workspace: Learning Project root disappeared: ${options.projectRoot}\nNext action: Restore the project or start preview from an existing Learning Project.\n`);
        void closeRuntime("project-missing");
      });
  }, 500);
  rootMonitor.unref();
  return {
    url,
    port: address.port,
    instanceId,
    reused: false,
    notices,
    closed,
    close: () => closeRuntime("closed"),
  };
}
