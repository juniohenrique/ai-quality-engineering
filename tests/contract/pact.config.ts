import type { PactV3Options } from "@pact-foundation/pact";
import { SpecificationVersion } from "@pact-foundation/pact";

export interface PactBrokerConfig {
  baseUrl: string;
  token?: string;
}

export const pactOptions: PactV3Options = {
  consumer: "ai-quality-engineering-consumer",
  provider: "ai-quality-engineering-api",
  dir: "pacts",
  spec: SpecificationVersion.SPECIFICATION_VERSION_V3,
  logLevel: "warn",
};

export const pactBroker: PactBrokerConfig = {
  baseUrl: process.env.PACT_BROKER_BASE_URL ?? "http://localhost:9292",
  ...(process.env.PACT_BROKER_TOKEN ? { token: process.env.PACT_BROKER_TOKEN } : {}),
};
