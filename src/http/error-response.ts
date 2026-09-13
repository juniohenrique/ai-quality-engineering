import type { ServerResponse } from "node:http";

export interface ErrorResponse {
  error: string;
  message: string;
}

export function writeErrorResponse(
  response: ServerResponse,
  statusCode: number,
  error: string,
  message: string,
): void {
  const payload: ErrorResponse = { error, message };

  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
