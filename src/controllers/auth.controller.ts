import type { ServerResponse } from "node:http";
import jwt from "jsonwebtoken";
import { writeErrorResponse } from "../http/error-response.js";
import {
  type AuthTokenPayload,
  type JwtPayload,
  isJwtExpired,
  issueToken,
  parseToken,
  tokenBlacklist,
} from "../utils/jwt.js";

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

    const token = issueToken({ sub: input.email, email: input.email });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ token }));
  }

  async handleLogout(response: ServerResponse, token?: string): Promise<void> {
    if (token !== undefined) {
      tokenBlacklist.invalid(token);
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Logged out" }));
  }
}

export function verifyAuthToken(
  token: string,
): { valid: true; payload: AuthTokenPayload } | { valid: false; reason: string } {
  if (tokenBlacklist.isValid(token) === false) {
    return { valid: false, reason: "token_revoked" };
  }

  let payload: JwtPayload;
  try {
    payload = parseToken(token) as JwtPayload;
  } catch (error) {
   if (error instanceof jwt.TokenExpiredError) {
     return { valid: false, reason: "token_expired" };
   }
   return { valid: false, reason: "token_invalid" };
 }

  if (typeof payload === "string" || payload.sub === undefined || payload.email === undefined) {
    return { valid: false, reason: "token_invalid" };
  }

  if (isJwtExpired(payload)) {
    return { valid: false, reason: "token_expired" };
  }

  return {
    valid: true,
    payload: { sub: payload.sub, email: payload.email },
  };
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
    candidate.password.trim().length > 0
  );
}
