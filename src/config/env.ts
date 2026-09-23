import "dotenv/config";

export interface AppEnv {
  port: number;
  databaseUrl: string;
  rabbitmqUrl?:  string | undefined;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const databaseUrl = source.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const port = Number(source.PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }

  return { port, databaseUrl, rabbitmqUrl: source.RABBITMQ_URL };
}
