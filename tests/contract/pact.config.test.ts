import { describe, expect, it } from "vitest";
import { pactBroker, pactOptions } from "./pact.config.js";

describe("Pact configuration", () => {
  it("defines the consumer, provider, pact directory, and broker defaults", () => {
    expect(pactOptions).toMatchObject({
      consumer: "ai-quality-engineering-consumer",
      provider: "ai-quality-engineering-api",
      dir: "pacts",
    });
    expect(pactBroker.baseUrl).toMatch(/^https?:\/\//);
  });
});
