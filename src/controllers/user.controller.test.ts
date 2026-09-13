import { describe, expect, it } from "vitest";
import { UserController } from "./user.controller.js";
import { InMemoryUserRepository } from "../repositories/in-memory-user.repository.js";
import { UserService } from "../services/user.service.js";

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
      error: "User email is invalid",
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
    expect(JSON.parse(body)).toEqual({ error: "not_found" });
  });
});
