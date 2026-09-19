import { createServer, type IncomingMessage } from "node:http";
import { URL } from "node:url";
import { loadEnv } from "./config/env.js";
import { HealthController } from "./controllers/health.controller.js";
import { createPool, waitForDatabase } from "./db/client.js";
import { serveStatic } from "./api/static.js";
import { UserController } from "./controllers/user.controller.js";
import { HealthRepository } from "./repositories/health.repository.js";
import { InMemoryUserRepository } from "./repositories/in-memory-user.repository.js";
import { PostgresUserRepository } from "./repositories/postgres-user.repository.js";
import { HealthService } from "./services/health.service.js";
import { UserService } from "./services/user.service.js";
import { writeErrorResponse } from "./http/error-response.js";

const { port, databaseUrl } = loadEnv();
const pool = createPool(databaseUrl);

const healthRepository = new HealthRepository(pool);
const healthService = new HealthService(healthRepository);
const healthController = new HealthController(healthService);
const userRepository =
  process.env.USER_REPOSITORY === "memory"
    ? new InMemoryUserRepository()
    : new PostgresUserRepository(pool);
const userService = new UserService(userRepository);
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

  if (await serveStatic(request, response)) {
    return;
  }

  const userIdMatch = requestUrl.pathname.match(/^\/users\/([^/]+)$/);
  const userId = userIdMatch?.[1];

  if (userId !== undefined) {
    if (request.method === "DELETE") {
      await userController.handleDelete(userId, response);
      return;
    }

    if (request.method === "PUT") {
      try {
        const body = await readRequestBody(request);
        await userController.handleUpdate(userId, JSON.parse(body), response);
      } catch {
        writeErrorResponse(response, 400, "invalid_request", "Invalid request");
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
        writeErrorResponse(response, 400, "invalid_request", "Invalid request");
      }
      return;
    }

    await userController.handleList(response);
    return;
  }

  if (requestUrl.pathname !== "/health") {
    writeErrorResponse(response, 404, "not_found", "Route not found");
    return;
  }

  await healthController.handleHealth(response);
});

const databaseReady = await waitForDatabase(pool);

if (!databaseReady) {
  console.error("Database unavailable after retrying connection");
}

server.listen(port, () => {
  console.log(`AI Quality Engineering app listening on port ${port}`);
});

const shutdown = async (): Promise<void> => {
  server.close();
  await pool.end();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
