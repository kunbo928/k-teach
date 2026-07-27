import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

export interface PreviewOptions {
  host: string;
  port: number;
}

export interface PreviewServer {
  url: string;
  close(): Promise<void>;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export async function startPreviewServer(
  root: string,
  options: PreviewOptions,
): Promise<PreviewServer> {
  const absoluteRoot = path.resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const rawPath = new URL(request.url ?? "/", "http://localhost").pathname;
      const decoded = decodeURIComponent(rawPath);
      if (decoded.split("/").includes("..")) {
        response.writeHead(404).end("Not found");
        return;
      }
      const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
      const filePath = path.resolve(absoluteRoot, relative);
      if (
        filePath !== absoluteRoot &&
        !filePath.startsWith(`${absoluteRoot}${path.sep}`)
      ) {
        response.writeHead(404).end("Not found");
        return;
      }
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error("Not a file");
      response.writeHead(200, {
        "Content-Type":
          CONTENT_TYPES[path.extname(filePath)] ??
          "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

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
