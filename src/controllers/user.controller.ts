import type { ServerResponse } from "node:http";
import type { UserService } from "../services/user.service.js";
import type { CreateUserInput, UpdateUserInput } from "../services/user.service.js";
import { writeErrorResponse } from "../http/error-response.js";

export class UserController {
  constructor(
    private readonly service: Pick<
      UserService,
      "createUser" | "deleteUser" | "findUserById" | "listUsers" | "updateUser"
    >,
  ) {}

  async handleCreate(input: unknown, response: ServerResponse): Promise<void> {
    if (!isCreateUserInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid request");
      return;
    }

    try {
      const user = await this.service.createUser(input);

      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify(user));
    } catch (error) {
      const statusCode = getUserErrorStatus(error);
      writeErrorResponse(
        response,
        statusCode,
        statusCode === 409 ? "email_already_exists" : "invalid_request",
        error instanceof Error ? error.message : "Invalid request",
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
      writeErrorResponse(response, 404, "not_found", "User not found");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(user));
  }

  async handleUpdate(id: string, input: unknown, response: ServerResponse): Promise<void> {
    if (!isUpdateUserInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid request");
      return;
    }

    try {
      const user = await this.service.updateUser(id, input);

      if (!user) {
        writeErrorResponse(response, 404, "not_found", "User not found");
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(user));
    } catch (error) {
      const statusCode = getUserErrorStatus(error);
      writeErrorResponse(
        response,
        statusCode,
        statusCode === 409 ? "email_already_exists" : "invalid_request",
        error instanceof Error ? error.message : "Invalid request",
      );
    }
  }

  async handleDelete(id: string, response: ServerResponse): Promise<void> {
    const deleted = await this.service.deleteUser(id);

    if (!deleted) {
      writeErrorResponse(response, 404, "not_found", "User not found");
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
    typeof candidate.userName === "string" &&
    candidate.email.trim().length > 0 &&
    candidate.userName.trim().length > 0
  );
}

const isUpdateUserInput = isCreateUserInput satisfies (input: unknown) => input is UpdateUserInput;

function getUserErrorStatus(error: unknown): number {
  return isUserError(error) && error.code === "EMAIL_ALREADY_EXISTS" ? 409 : 400;
}

function isUserError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}
