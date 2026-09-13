import { createServer } from "node:http";
import { Pool } from "pg";
import { HealthController } from "./controllers/health.controller.js";
import { HealthRepository } from "./repositories/health.repository.js";
import { HealthService } from "./services/health.service.js";

const port = Number(process.env.PORT ?? 3000);
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/quality";
const pool = new Pool({ connectionString: databaseUrl });

const healthRepository = new HealthRepository(pool);
const healthService = new HealthService(healthRepository);
const healthController = new HealthController(healthService);

const server = createServer(async (request, response) => {
  if (request.url !== "/health") {
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
