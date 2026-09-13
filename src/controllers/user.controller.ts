import type { ServerResponse } from "node:http";
import type { UserService } from "../services/user.service.js";

export class UserController {
  constructor(private readonly service: Pick<UserService, "listUsers">) {}

  async handleList(response: ServerResponse): Promise<void> {
    const users = await this.service.listUsers();

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(users));
  }
}
