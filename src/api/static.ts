import { readFile } from "node:fs/promises";
import { extname, normalize, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath, URL } from "node:url";

const publicDirectory = fileURLToPath(new URL("../../public/", import.meta.url));
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  if (request.method !== "GET") {
    return false;
  }

  const requestedPath = new URL(request.url ?? "/", "http://localhost").pathname;
  if (requestedPath === "/users" && !request.headers.accept?.includes("text/html")) {
    return false;
  }

  const routeFiles: Record<string, string> = {
    "/": "/index.html",
    "/login": "/login.html",
    "/users": "/users.html",
    "/user-form": "/user-form.html",
  };
  const fileName = routeFiles[requestedPath] ?? requestedPath;
  const filePath = resolve(publicDirectory, `.${fileName}`);

  if (!normalize(filePath).startsWith(normalize(publicDirectory))) {
    return false;
  }

  try {
    const body = await readFile(filePath);
    const contentType = contentTypes[extname(filePath)] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": contentType });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}
