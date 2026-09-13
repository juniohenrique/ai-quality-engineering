import { createServer, type IncomingMessage } from "node:http";
import { URL } from "node:url";
import { Pool } from "pg";
import { HealthController } from "./controllers/health.controller.js";
import { UserController } from "./controllers/user.controller.js";
import { HealthRepository } from "./repositories/health.repository.js";
import { InMemoryUserRepository } from "./repositories/in-memory-user.repository.js";
import { HealthService } from "./services/health.service.js";
import { UserService } from "./services/user.service.js";

const port = Number(process.env.PORT ?? 3000);
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/quality";
const pool = new Pool({ connectionString: databaseUrl });

const healthRepository = new HealthRepository(pool);
const healthService = new HealthService(healthRepository);
const healthController = new HealthController(healthService);
const userService = new UserService(new InMemoryUserRepository());
const userController = new UserController(userService);

const readRequestBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const userIdMatch = requestUrl.pathname.match(/^\/users\/([^/]+)$/);
  const userId = userIdMatch?.[1];

  if (userId !== undefined) {
    if (request.method === "PUT") {
      try {
        const body = await readRequestBody(request);
        await userController.handleUpdate(userId, JSON.parse(body), response);
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid_request" }));
      }
      return;
    }

    await userController.handleFindById(userId, response);
    return;
  }

  if (requestUrl.pathname === "/users") {
    if (request.method === "POST") {
      try {
        const body = await readRequestBody(request);
        await userController.handleCreate(JSON.parse(body), response);
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid_request" }));
      }
      return;
    }

    await userController.handleList(response);
    return;
  }

  if (requestUrl.pathname !== "/health") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  await healthController.handleHealth(response);
});

server.listen(port, () => {
  console.log(`AI Quality Engineering app listening on port ${port}`);
});

const shutdown = async (): Promise<void> => {
  server.close();
  await pool.end();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
