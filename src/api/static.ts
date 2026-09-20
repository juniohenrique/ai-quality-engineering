import { readFile } from "node:fs/promises";
import { extname, join, resolve, dirname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

// dist/api/static.js -> dist/api -> dist -> root -> public
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PUBLIC_DIR = resolve(__dirname, "../../public");

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

export async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  if (request.method !== "GET") {
    return false;
  }

  const requestedPath = new URL(request.url ?? "/", "http://localhost").pathname;
  
  // Não servir /users como HTML se o Accept não incluir text/html (para API)
  if (requestedPath === "/users" && !request.headers.accept?.includes("text/html")) {
    return false;
  }

  // Mapeamento de rotas sem extensão para arquivos HTML
  const routeFiles: Record<string, string> = {
    "/": "/index.html",
    "/login": "/login.html",
    "/users": "/users.html",
    "/user-form": "/user-form.html",
  };
  
  // Se é uma rota mapeada, usar o arquivo correspondente
  // Caso contrário, usar o path solicitado (ex: /css/user-form.css)
  const fileName = routeFiles[requestedPath] ?? requestedPath;

  // Sanitização contra path traversal:
  // 1. Bloquear ".." explícito no pathname
  if (fileName.includes("..")) {
    return false;
  }

  // 2. Resolver o caminho completo com join (aceita subpastas)
  const filePath = resolve(join(PUBLIC_DIR, fileName));

  // 3. Validar que o resultado final ainda está dentro de PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return false;
  }

  // 4. Tentar ler o arquivo
  try {
    const body = await readFile(filePath);
    const contentType = contentTypes[extname(filePath)] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": contentType });
    response.end(body);
    return true;
  } catch {
    // 5. Se o arquivo não existir, retornar false (cai nas rotas de API)
    return false;
  }
}
