import { describe, expect, it } from "vitest";
import { AuthController } from "../../../src/controllers/auth.controller.js";

function createResponse() {
  let statusCode: number | undefined;
  let body = "";

  return {
    response: {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (responseBody: string) => {
        body = responseBody;
      },
    },
    getStatusCode: () => statusCode,
    getBody: () => body,
  };
}

describe("POST /auth/login", () => {
  it("returns a fake token for valid credentials", async () => {
    const output = createResponse();

    await new AuthController().handleLogin(
      { email: "test@example.com", password: "password" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(200);
    expect(JSON.parse(output.getBody())).toEqual({ token: "fake-token" });
  });

  it("rejects invalid credentials", async () => {
    const output = createResponse();

    await new AuthController().handleLogin(
      { email: "test@example.com", password: "wrong" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(401);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_credentials",
      message: "Invalid credentials",
    });
  });
});
