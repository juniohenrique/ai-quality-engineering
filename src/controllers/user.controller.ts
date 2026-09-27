import type { ServerResponse } from "node:http";
import type { UserService } from "../services/user.service.js";
import type { CreateUserInput, UpdateUserInput } from "../services/user.service.js";
import { writeErrorResponse } from "../http/error-response.js";
import { toUserResponse } from "../http/user-response.js";
import type { AuthContext } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/authz.middleware.js";

export class UserController {
  constructor(
    private readonly service: Pick<
      UserService,
      "createUser" | "changeRole" | "deleteUser" | "findUserById" | "listUsers" | "updateUser"
    >,
  ) {}

  async handleCreate(
    context: AuthContext | null,
    input: unknown,
    response: ServerResponse,
  ): Promise<void> {
    if (!this.authorize(context, response)) return;

    if (!isCreateUserInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid request");
      return;
    }

    try {
      const user = await this.service.createUser(input);

      response.writeHead(201, { "content-type": "application/json" });
      response.end(JSON.stringify(toUserResponse(user)));
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

  async handleList(context: AuthContext | null, response: ServerResponse): Promise<void> {
    if (!this.authorize(context, response)) return;

    const users = await this.service.listUsers();

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(users.map(toUserResponse)));
  }

  async handleFindById(
    context: AuthContext | null,
    id: string,
    response: ServerResponse,
  ): Promise<void> {
    if (!this.authorize(context, response)) return;

    const user = await this.service.findUserById(id);

    if (!user) {
      writeErrorResponse(response, 404, "not_found", "User not found");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(toUserResponse(user)));
  }

  async handleUpdate(
    context: AuthContext | null,
    id: string,
    input: unknown,
    response: ServerResponse,
  ): Promise<void> {
    if (!this.authorize(context, response)) return;

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
      response.end(JSON.stringify(toUserResponse(user)));
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

  async handleChangeRole(
    context: AuthContext | null,
    id: string,
    input: unknown,
    response: ServerResponse,
  ): Promise<void> {
    if (!this.authorize(context, response)) return;

    if (!isChangeRoleInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid request");
      return;
    }

    // Anti-self: admin não altera a própria role
    if (context!.userId === id) {
      writeErrorResponse(response, 403, "forbidden", "Cannot change your own role");
      return;
    }

    const user = await this.service.changeRole(id, input.role);
    if (!user) {
      writeErrorResponse(response, 404, "not_found", "User not found");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(toUserResponse(user)));
  }

  async handleDelete(
    context: AuthContext | null,
    id: string,
    response: ServerResponse,
  ): Promise<void> {
    if (!this.authorize(context, response)) return;

    const deleted = await this.service.deleteUser(id);

    if (!deleted) {
      writeErrorResponse(response, 404, "not_found", "User not found");
      return;
    }

    response.writeHead(204);
    response.end();
  }

  // ── private helpers ─────────────────────────────────────────────────

  private authorize(context: AuthContext | null, response: ServerResponse): context is AuthContext {
    if (context === null) {
      writeErrorResponse(response, 401, "unauthorized", "Unauthorized");
      return false;
    }
    if (!requireRole(context, "admin")) {
      writeErrorResponse(response, 403, "forbidden", "Forbidden");
      return false;
    }
    return true;
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

interface ChangeRoleInput {
  role: "admin" | "user";
}

function isChangeRoleInput(input: unknown): input is ChangeRoleInput {
  if (typeof input !== "object" || input === null) return false;
  const c = input as Record<string, unknown>;
  return c.role === "admin" || c.role === "user";
}

function getUserErrorStatus(error: unknown): number {
  return isUserError(error) && error.code === "EMAIL_ALREADY_EXISTS" ? 409 : 400;
}

function isUserError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}
