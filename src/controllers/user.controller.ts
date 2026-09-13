import type { ServerResponse } from "node:http";
import type { UserService } from "../services/user.service.js";

export class UserController {
  constructor(private readonly service: Pick<UserService, "findUserById" | "listUsers">) {}

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
}
