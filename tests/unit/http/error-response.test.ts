import { describe, expect, it } from "vitest";
import { writeErrorResponse } from "../../../src/http/error-response.js";

describe("writeErrorResponse", () => {
  it("writes errors using the standard shape", () => {
    let statusCode: number | undefined;
    let headers: Record<string, string> | undefined;
    let body = "";
    const response = {
      writeHead: (code: number, responseHeaders: Record<string, string>) => {
        statusCode = code;
        headers = responseHeaders;
      },
      end: (responseBody: string) => {
        body = responseBody;
      },
    };

    writeErrorResponse(response as never, 404, "not_found", "User not found");

    expect(statusCode).toBe(404);
    expect(headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(body)).toEqual({
      error: "not_found",
      message: "User not found",
    });
  });
});
