import { describe, expect, it } from "vitest";
import { serveStatic } from "../../../src/api/static.js";

function createResponse() {
  let statusCode = 0;
  let contentType = "";
  let body = Buffer.alloc(0);

  return {
    response: {
      writeHead: (status: number, headers: Record<string, string>) => {
        statusCode = status;
        contentType = headers["content-type"] ?? "";
      },
      end: (responseBody: Buffer) => {
        body = responseBody;
      },
    },
    getResult: () => ({ statusCode, contentType, body: body.toString() }),
  };
}

describe("serveStatic", () => {
  it("serves the home page at the root route", async () => {
    const output = createResponse();

    await expect(
      serveStatic({ method: "GET", url: "/" } as never, output.response as never),
    ).resolves.toBe(true);

    expect(output.getResult()).toMatchObject({
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
    });
    expect(output.getResult().body).toContain("AI Quality Engineering");
  });

  it("does not handle missing files or non-GET requests", async () => {
    const missing = createResponse();
    const post = createResponse();

    await expect(
      serveStatic({ method: "GET", url: "/missing.html" } as never, missing.response as never),
    ).resolves.toBe(false);
    await expect(
      serveStatic({ method: "POST", url: "/" } as never, post.response as never),
    ).resolves.toBe(false);
  });

  it.each(["/login", "/users", "/user-form"])("serves the %s route", async (url) => {
    const output = createResponse();

    await expect(
      serveStatic({ method: "GET", url, headers: { accept: "text/html" } } as never, output.response as never),
    ).resolves.toBe(true);

    expect(output.getResult()).toMatchObject({
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
    });
  });
});
