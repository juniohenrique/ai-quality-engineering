import type { PactV3Options } from "@pact-foundation/pact";
import { SpecificationVersion } from "@pact-foundation/pact";

export const pactOptions: PactV3Options = {
  consumer: "ai-quality-engineering-consumer",
  provider: "ai-quality-engineering-api",
  dir: "pacts",
  spec: SpecificationVersion.SPECIFICATION_VERSION_V3,
  logLevel: "warn",
};
