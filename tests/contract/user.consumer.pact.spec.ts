import { PactV3 } from "@pact-foundation/pact";
import { describe, expect, it } from "vitest";
import { UserApiClient } from "../helpers/user-api-client.js";
import { pactOptions } from "./pact.config.js";

const user = {
  id: "user-1",
  email: "ada@example.com",
  userName: "Ada Lovelace",
};

describe("User API consumer contract", () => {
  it("defines the GET /users/:id response expected by the consumer", async () => {
    const provider = new PactV3(pactOptions);

    await provider
      .given("a user with id user-1 exists")
      .uponReceiving("a request for a user by id")
      .withRequest({
        method: "GET",
        path: "/users/user-1",
        headers: { "content-type": "application/json" },
      })
      .willRespondWith({
        status: 200,
        headers: { "content-type": "application/json" },
        body: user,
      })
      .executeTest(async (mockServer) => {
        const client = new UserApiClient(mockServer.url);
        const response = await client.getById(user.id);

        expect(response.status).toBe(200);
        expect(response.body).toEqual(user);
      });
  });
});
