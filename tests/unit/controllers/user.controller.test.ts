import { describe, expect, it, vi } from "vitest";
import { UserController } from "../../../src/controllers/user.controller.js";
import { InMemoryUserRepository } from "../../../src/repositories/in-memory-user.repository.js";
import { UserService } from "../../../src/services/user.service.js";

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

describe("GET /users", () => {
  it("returns all users as JSON", async () => {
    const service = new UserService(new InMemoryUserRepository());
    const firstUser = await service.createUser({
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
    const secondUser = await service.createUser({
      email: "grace@example.com",
      name: "Grace Hopper",
    });
    const controller = new UserController(service);
    let statusCode: number | undefined;
    let body = "";
    const response = {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (responseBody: string) => {
        body = responseBody;
      },
    };

    await controller.handleList(response as never);

    expect(statusCode).toBe(200);
    expect(JSON.parse(body)).toEqual([firstUser, secondUser]);
  });
});

describe("POST /users", () => {
  it("creates a user and returns it as JSON", async () => {
    const controller = new UserController(new UserService(new InMemoryUserRepository()));
    const output = createResponse();

    await controller.handleCreate(
      { email: " ADA@EXAMPLE.COM ", name: " Ada Lovelace " },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(201);
    expect(JSON.parse(output.getBody())).toMatchObject({
      id: expect.any(String),
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
  });

  it("returns 400 for an invalid payload", async () => {
    const controller = new UserController(new UserService(new InMemoryUserRepository()));
    const output = createResponse();

    await controller.handleCreate(
      { email: "invalid-email", name: "Ada Lovelace" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(400);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "User email is invalid",
    });
  });

  it.each([null, {}, { email: "ada@example.com" }, { name: "Ada Lovelace" }])(
    "returns 400 for a structurally invalid payload: %s",
    async (input) => {
      const createUser = vi.fn();
      const controller = new UserController({
        createUser,
        deleteUser: vi.fn(),
        findUserById: vi.fn(),
        listUsers: vi.fn(),
        updateUser: vi.fn(),
      });
      const output = createResponse();

      await controller.handleCreate(input, output.response as never);

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid request",
      });
      expect(createUser).not.toHaveBeenCalled();
    },
  );

  it("returns the service error when creation fails", async () => {
    const controller = new UserController({
      createUser: vi.fn().mockRejectedValue(new Error("creation failed")),
      deleteUser: vi.fn(),
      findUserById: vi.fn(),
      listUsers: vi.fn(),
      updateUser: vi.fn(),
    });
    const output = createResponse();

    await controller.handleCreate(
      { email: "ada@example.com", name: "Ada Lovelace" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(400);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "creation failed",
    });
  });

  it("uses a generic message when creation throws a non-Error value", async () => {
    const controller = new UserController({
      createUser: vi.fn().mockRejectedValue("creation failed"),
      deleteUser: vi.fn(),
      findUserById: vi.fn(),
      listUsers: vi.fn(),
      updateUser: vi.fn(),
    });
    const output = createResponse();

    await controller.handleCreate(
      { email: "ada@example.com", name: "Ada Lovelace" },
      output.response as never,
    );

    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });
});

describe("GET /users/:id", () => {
  it("returns the user matching the requested id", async () => {
    const service = new UserService(new InMemoryUserRepository());
    const user = await service.createUser({
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
    const controller = new UserController(service);
    let statusCode: number | undefined;
    let body = "";
    const response = {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (responseBody: string) => {
        body = responseBody;
      },
    };

    await controller.handleFindById(user.id, response as never);

    expect(statusCode).toBe(200);
    expect(JSON.parse(body)).toEqual(user);
  });

  it("returns 404 when the user does not exist", async () => {
    const controller = new UserController(new UserService(new InMemoryUserRepository()));
    let statusCode: number | undefined;
    let body = "";
    const response = {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (responseBody: string) => {
        body = responseBody;
      },
    };

    await controller.handleFindById("missing-user", response as never);

    expect(statusCode).toBe(404);
    expect(JSON.parse(body)).toEqual({
      error: "not_found",
      message: "User not found",
    });
  });
});

describe("PUT /users/:id", () => {
  it("updates and returns the user", async () => {
    const service = new UserService(new InMemoryUserRepository());
    const user = await service.createUser({
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
    const controller = new UserController(service);
    let statusCode: number | undefined;
    let body = "";
    const response = {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (responseBody: string) => {
        body = responseBody;
      },
    };

    await controller.handleUpdate(
      user.id,
      { email: "ada.updated@example.com", name: "Ada Byron Lovelace" },
      response as never,
    );

    expect(statusCode).toBe(200);
    expect(JSON.parse(body)).toEqual({
      id: user.id,
      email: "ada.updated@example.com",
      name: "Ada Byron Lovelace",
    });
  });

  it("returns 404 when updating a missing user", async () => {
    const controller = new UserController(new UserService(new InMemoryUserRepository()));
    let statusCode: number | undefined;
    let body = "";
    const response = {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (responseBody: string) => {
        body = responseBody;
      },
    };

    await controller.handleUpdate(
      "missing-user",
      { email: "missing@example.com", name: "Missing User" },
      response as never,
    );

    expect(statusCode).toBe(404);
    expect(JSON.parse(body)).toEqual({
      error: "not_found",
      message: "User not found",
    });
  });
});

describe("DELETE /users/:id", () => {
  it("deletes the user and returns 204", async () => {
    const service = new UserService(new InMemoryUserRepository());
    const user = await service.createUser({
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
    const controller = new UserController(service);
    const output = createResponse();

    await controller.handleDelete(user.id, output.response as never);

    expect(output.getStatusCode()).toBe(204);
    await expect(service.findUserById(user.id)).resolves.toBeUndefined();
  });

  it("returns 404 when deleting a missing user", async () => {
    const controller = new UserController(new UserService(new InMemoryUserRepository()));
    const output = createResponse();

    await controller.handleDelete("missing-user", output.response as never);

    expect(output.getStatusCode()).toBe(404);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "not_found",
      message: "User not found",
    });
  });

  it.each([null, {}, { email: "ada@example.com" }, { name: "Ada Lovelace" }])(
    "returns 400 for a structurally invalid payload: %s",
    async (input) => {
      const updateUser = vi.fn();
      const controller = new UserController({
        createUser: vi.fn(),
        deleteUser: vi.fn(),
        findUserById: vi.fn(),
        listUsers: vi.fn(),
        updateUser,
      });
      const output = createResponse();

      await controller.handleUpdate("user-1", input, output.response as never);

      expect(output.getStatusCode()).toBe(400);
      expect(JSON.parse(output.getBody())).toEqual({
        error: "invalid_request",
        message: "Invalid request",
      });
      expect(updateUser).not.toHaveBeenCalled();
    },
  );

  it("returns the service error when updating fails", async () => {
    const controller = new UserController({
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      findUserById: vi.fn(),
      listUsers: vi.fn(),
      updateUser: vi.fn().mockRejectedValue(new Error("update failed")),
    });
    const output = createResponse();

    await controller.handleUpdate(
      "user-1",
      { email: "ada@example.com", name: "Ada Lovelace" },
      output.response as never,
    );

    expect(output.getStatusCode()).toBe(400);
    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "update failed",
    });
  });

  it("uses a generic message when updating throws a non-Error value", async () => {
    const controller = new UserController({
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      findUserById: vi.fn(),
      listUsers: vi.fn(),
      updateUser: vi.fn().mockRejectedValue("update failed"),
    });
    const output = createResponse();

    await controller.handleUpdate(
      "user-1",
      { email: "ada@example.com", name: "Ada Lovelace" },
      output.response as never,
    );

    expect(JSON.parse(output.getBody())).toEqual({
      error: "invalid_request",
      message: "Invalid request",
    });
  });
});
