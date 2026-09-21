import { describe, expect, it } from "vitest";
import { AuthController } from "../../../src/controllers/auth.controller.js";

function createResponse() {
  let statusCode: number | undefined;
  let body = "";
  return {
    response: {
      writeHead: (code: number) => { statusCode = code; },
      end: (responseBody: string) => { body = responseBody; },
    },
    getStatusCode: () => statusCode,
    getBody: () => body,
  };
}

describe("POST /auth/login – input validation", () => {
  it.each([
    null,
    {},
    { email: "", password: "password" },
    { email: "test@example.com", password: "" },
    { email: "   ", password: "password" },
    { email: "test@example.com", password: "   " },
  ])("returns 400 for invalid input %p", async (input) => {
    const controller = new AuthController();
    const output = createResponse();
    await controller.handleLogin(input as any, output.response as never);
    expect(output.getStatusCode()).toBe(400);
    expect(JSON.parse(output.getBody())).toEqual({ error: "invalid_request", message: "Invalid request" });
  });
});
