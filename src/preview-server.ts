import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";

export interface PreviewOptions {
  host: string;
  port: number;
}

export interface PreviewServer {
  url: string;
  close(): Promise<void>;
}

export interface ProjectPreviewTeach {
  id: string;
  title: string;
  root: string;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function escaped(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function projectIndex(teaches: readonly ProjectPreviewTeach[]): string {
  const entries = teaches
    .map(
      (teach) =>
        `<li><a href="/teachs/${encodeURIComponent(teach.id)}/">${escaped(teach.title)}</a></li>`,
    )
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>K Teach Project Preview</title>
</head>
<body>
  <main>
    <h1>Learning Project</h1>
    <p>选择一门 Teach 开始学习。</p>
    <ul>${entries}</ul>
  </main>
</body>
</html>`;
}

function serveFile(
  root: string,
  requestPath: string,
  response: ServerResponse,
): void {
  const decoded = decodeURIComponent(requestPath);
  if (decoded.split("/").includes("..")) {
    response.writeHead(404).end("Not found");
    return;
  }
  const relative =
    decoded === "/" || decoded === "" ? "index.html" : decoded.replace(/^\/+/, "");
  const absoluteRoot = path.resolve(root);
  const filePath = path.resolve(absoluteRoot, relative);
  if (
    filePath !== absoluteRoot &&
    !filePath.startsWith(`${absoluteRoot}${path.sep}`)
  ) {
    response.writeHead(404).end("Not found");
    return;
  }
  void stat(filePath)
    .then((fileStat) => {
      if (!fileStat.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "Content-Type":
          CONTENT_TYPES[path.extname(filePath)] ??
          "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      createReadStream(filePath).pipe(response);
    })
    .catch(() => {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    });
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  options: PreviewOptions,
): Promise<PreviewServer> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Preview server did not expose a TCP address.");
  return {
    url: `http://${options.host}:${address.port}/`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

export async function startPreviewServer(
  root: string,
  options: PreviewOptions,
): Promise<PreviewServer> {
  return listen((request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://localhost").pathname;
    serveFile(root, requestPath, response);
  }, options);
}

export async function startProjectPreviewServer(
  teaches: readonly ProjectPreviewTeach[],
  options: PreviewOptions,
): Promise<PreviewServer> {
  const teachesById = new Map(teaches.map((teach) => [teach.id, teach]));
  const index = projectIndex(teaches);
  return listen((request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://localhost").pathname;
    if (requestPath === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(index);
      return;
    }
    const match = requestPath.match(/^\/teachs\/([^/]+)(\/.*)?$/);
    const teachId = match ? decodeURIComponent(match[1]) : undefined;
    const teach = teachId ? teachesById.get(teachId) : undefined;
    if (!teach) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    serveFile(teach.root, match?.[2] ?? "/", response);
  }, options);
}
