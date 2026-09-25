import type { IncomingMessage, ServerResponse } from "node:http";
import { writeErrorResponse } from "../http/error-response.js";
import type { AuthTokenPayload } from "../utils/jwt.js";
import { verifyAuthToken } from "../controllers/auth.controller.js";

export interface AuthenticatedRequest extends IncomingMessage {
  user: AuthTokenPayload;
}

export function extractBearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;

  if (!header) {
    return undefined;
  }

  return parseBearerHeader(header);
}

function parseBearerHeader(header: string): string | undefined {
  const [scheme, token] = header.split(" ");

  if (scheme === undefined || token === undefined) {
    return undefined;
  }

  const normalizedScheme = scheme.toLowerCase();
  if (normalizedScheme !== "bearer") {
    return undefined;
  }

  return token.length > 0 ? token : undefined;
}

export function authenticate(
  request: IncomingMessage,
  response: ServerResponse,
): { authenticated: false } | { authenticated: true; user: AuthTokenPayload } {
  const token = extractBearerToken(request);

  if (token === undefined) {
    writeErrorResponse(response, 401, "missing_token", "Authorization header is required");
    return { authenticated: false };
  }

  const result = verifyAuthToken(token);

  if (!result.valid) {
    const statusCode = result.reason === "token_expired" ? 401 : 401;
    writeErrorResponse(
      response,
      statusCode,
      result.reason,
      result.reason === "token_expired"
        ? "Token expired"
        : result.reason === "token_revoked"
          ? "Token revoked"
          : "Invalid token",
    );
    return { authenticated: false };
  }

  (request as AuthenticatedRequest).user = result.payload;
  return { authenticated: true, user: result.payload };
}
