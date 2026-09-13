import type { ServerResponse } from "node:http";
import type { UserService } from "../services/user.service.js";
import type { CreateUserInput, UpdateUserInput } from "../services/user.service.js";

export class UserController {
  constructor(
    private readonly service: Pick<
      UserService,
      "createUser" | "deleteUser" | "findUserById" | "listUsers" | "updateUser"
    >,
  ) {}

  async handleCreate(input: unknown, response: ServerResponse): Promise<void> {
    if (!isCreateUserInput(input)) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_request" }));
      return;
    }

    try {
      const user = await this.service.createUser(input);

      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify(user));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "invalid_request",
        }),
      );
    }
  }

  async handleList(response: ServerResponse): Promise<void> {
    const users = await this.service.listUsers();

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(users));
  }

  async handleFindById(id: string, response: ServerResponse): Promise<void> {
    const user = await this.service.findUserById(id);

    if (!user) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(user));
  }

  async handleUpdate(id: string, input: unknown, response: ServerResponse): Promise<void> {
    if (!isUpdateUserInput(input)) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid_request" }));
      return;
    }

    try {
      const user = await this.service.updateUser(id, input);

      if (!user) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(user));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "invalid_request",
        }),
      );
    }
  }

  async handleDelete(id: string, response: ServerResponse): Promise<void> {
    const deleted = await this.service.deleteUser(id);

    if (!deleted) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    response.writeHead(204);
    response.end();
  }
}

function isCreateUserInput(input: unknown): input is CreateUserInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.email === "string" &&
    typeof candidate.name === "string" &&
    candidate.email.trim().length > 0 &&
    candidate.name.trim().length > 0
  );
}

const isUpdateUserInput = isCreateUserInput satisfies (input: unknown) => input is UpdateUserInput;
