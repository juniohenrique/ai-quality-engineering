import type { ServerResponse } from "node:http";
import { writeErrorResponse } from "../http/error-response.js";

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthController {
  async handleLogin(input: unknown, response: ServerResponse): Promise<void> {
    if (!isLoginInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid request");
      return;
    }

    if (input.email !== "test@example.com" || input.password !== "password") {
      writeErrorResponse(response, 401, "invalid_credentials", "Invalid credentials");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ token: "fake-token" }));
  }
}

function isLoginInput(input: unknown): input is LoginInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.email === "string" &&
    typeof candidate.password === "string" &&
    candidate.email.trim().length > 0 &&
    candidate.password.length > 0
  );
}
