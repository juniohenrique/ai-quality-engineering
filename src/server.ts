import { createServer } from "node:http";
import { Pool } from "pg";

const port = Number(process.env.PORT ?? 3000);
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/quality";
const pool = new Pool({ connectionString: databaseUrl });

const server = createServer(async (request, response) => {
  if (request.url !== "/health") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    await pool.query("SELECT 1");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", database: "connected" }));
  } catch {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ status: "degraded", database: "unavailable" }),
    );
  }
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
