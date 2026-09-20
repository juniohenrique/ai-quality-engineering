import { describe, expect, it, vi } from "vitest";
import { User } from "../../../src/domain/user.js";
import {
  EmailAlreadyExistsError,
  PostgresUserRepository,
  UserNotFoundError,
} from "../../../src/repositories/postgres-user.repository.js";

describe("PostgresUserRepository", () => {
  it("maps rows to users and uses parameterized queries", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: "user-1", email: "ada@example.com", userName: "Ada Lovelace" }],
    });
    const repository = new PostgresUserRepository({ query });

        await expect(repository.findById("user-1")).resolves.toEqual(
      new User({ id: "user-1", email: "ada@example.com", userName: "Ada Lovelace" }),
    );
        expect(query).toHaveBeenCalledWith("SELECT id, email, user_name AS userName FROM users WHERE id = $1", [
      "user-1",
    ]);
  });

  it("maps duplicate email errors", async () => {
    const query = vi.fn().mockRejectedValue({ code: "23505" });
    const repository = new PostgresUserRepository({ query });
        const user = new User({ id: "user-1", email: "ada@example.com", userName: "Ada" });

    await expect(repository.save(user)).rejects.toBeInstanceOf(EmailAlreadyExistsError);
  });

  it("maps a missing update to USER_NOT_FOUND", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const repository = new PostgresUserRepository({ query });
        const user = new User({ id: "missing", email: "ada@example.com", userName: "Ada" });

    await expect(repository.update(user)).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
