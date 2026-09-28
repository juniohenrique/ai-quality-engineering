import { describe, expect, it, vi } from "vitest";
import { UserController } from "../../../src/controllers/user.controller.js";
import { UserService } from "../../../src/services/user.service.js";
import { InMemoryUserRepository } from "../../../src/repositories/in-memory-user.repository.js";
import type { AuthContext } from "../../../src/middlewares/auth.middleware.js";

const adminCtx: AuthContext = {
  userId: "admin-1",
  role: "admin",
  jti: "test-jti-admin",
};

const userCtx: AuthContext = {
  userId: "user-1",
  role: "user",
  jti: "test-jti-user",
};

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

describe("POST /users – duplicate email handling", () => {
  it("maps EMAIL_ALREADY_EXISTS error to 409", async () => {
    const controller = new UserController({
      createUser: vi.fn().mockRejectedValue(
        (() => {
          const e = new Error("dup");
          (e as unknown as { code: string }).code = "EMAIL_ALREADY_EXISTS";
          return e;
        })(),
      ),
      deleteUser: vi.fn(),
      findUserById: vi.fn(),
      listUsers: vi.fn(),
      updateUser: vi.fn(),
    });
    const output = createResponse();
    await controller.handleCreate(
      adminCtx,
      { email: "dup@example.com", userName: "Dup" },
      output.response as never,
    );
    expect(output.getStatusCode()).toBe(409);
    expect(JSON.parse(output.getBody())).toEqual({ error: "email_already_exists", message: "dup" });
  });
});

describe("PUT /users/:id – duplicate email handling", () => {
  it("maps EMAIL_ALREADY_EXISTS error to 409", async () => {
    const emailError = new Error("dup");
    (emailError as unknown as { code: string }).code = "EMAIL_ALREADY_EXISTS";
    const controller = new UserController({
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      findUserById: vi
        .fn()
        .mockResolvedValue({ id: "1", email: "old@example.com", userName: "Old" }),
      listUsers: vi.fn(),
      updateUser: vi.fn().mockRejectedValue(emailError),
    });
    const output = createResponse();
    await controller.handleUpdate(
      adminCtx,
      "1",
      { email: "dup@example.com", userName: "Dup" },
      output.response as never,
    );
    expect(output.getStatusCode()).toBe(409);
    expect(JSON.parse(output.getBody())).toEqual({ error: "email_already_exists", message: "dup" });
  });
});

describe("POST /users – whitespace validation", () => {
  it.each([
    { email: "   ", userName: "Ada" },
    { email: "ada@example.com", userName: "   " },
    { email: "   ", userName: "   " },
  ])("returns 400 for whitespace-only fields", async (input) => {
    const controller = new UserController(new UserService(new InMemoryUserRepository()));
    const output = createResponse();
    await controller.handleCreate(adminCtx, input, output.response as never);
    expect(output.getStatusCode()).toBe(400);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });
});

describe("authorization", () => {
  it("returns 401 when context is null on list", async () => {
    const controller = new UserController(new InMemoryUserRepository() as never);
    const output = createResponse();
    await controller.handleList(null, output.response as never);
    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 403 when role is user on list", async () => {
    const controller = new UserController(new InMemoryUserRepository() as never);
    const output = createResponse();
    await controller.handleList(userCtx, output.response as never);
    expect(output.getStatusCode()).toBe(403);
  });

  it("returns 401 when context is null on create", async () => {
    const controller = new UserController(new InMemoryUserRepository() as never);
    const output = createResponse();
    await controller.handleCreate(
      null,
      { email: "x@x.com", userName: "X" },
      output.response as never,
    );
    expect(output.getStatusCode()).toBe(401);
  });

  it("returns 403 when role is user on delete", async () => {
    const controller = new UserController(new InMemoryUserRepository() as never);
    const output = createResponse();
    await controller.handleDelete(userCtx, "user-1", output.response as never);
    expect(output.getStatusCode()).toBe(403);
  });
});
