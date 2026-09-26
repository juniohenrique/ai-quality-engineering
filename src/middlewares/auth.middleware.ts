import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import { TokenService } from "../services/token.service.js";
import { TokenBlacklistService } from "../services/token-blacklist.service.js";

export interface AuthContext {
  userId: string;
  role: "admin" | "user";
  jti: string;
}

const tokenService = new TokenService();
const tokenBlacklist = new TokenBlacklistService();

/**
 * Extracts the JWT payload (without verifying the signature) to read the
 * `jti` claim that `TokenService.verifyAccess` does not surface.
 */
function extractJti(token: string): string | undefined {
  const decoded = jwt.decode(token);

  if (decoded === null || typeof decoded !== "object") {
    return undefined;
  }

  const jti = (decoded as { jti?: unknown }).jti;
  return typeof jti === "string" ? jti : undefined;
}

/**
 * Reads the `Authorization: Bearer <token>` header and, when present and
 * well-formed, verifies the access token and checks the blacklist.
 *
 * Returns the authenticated context on success, or `null` when the header is
 * absent/malformed, the token is invalid/expired, or the token id is revoked.
 *
 * This function never writes to the response — the caller (controller/route
 * handler) decides how to handle an unsuccessful authentication.
 */
export function authenticate(
  request: IncomingMessage,
): AuthContext | null {
  const header = request.headers.authorization;

  if (header === undefined) {
    return null;
  }

  const [scheme, token] = header.split(" ");

  // Must be exactly "Bearer <token>"
  if (scheme !== "Bearer" || token === undefined || token.length === 0) {
    return null;
  }

  let payload;
  try {
    payload = tokenService.verifyAccess(token);
  } catch {
    return null;
  }

  const jti = extractJti(token);

  // Without a jti we cannot perform blacklist checks; treat as unauthenticated.
  if (jti === undefined) {
    return null;
  }

  if (tokenBlacklist.isBlacklisted(jti)) {
    return null;
  }

  return {
    userId: payload.sub,
    role: payload.role as "admin" | "user",
    jti,
  };
}
