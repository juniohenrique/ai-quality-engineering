import type { Pool } from "pg";
import { User } from "../domain/user.js";
import type { UserRepository } from "./user.repository.js";

export class EmailAlreadyExistsError extends Error {
  readonly code = "EMAIL_ALREADY_EXISTS";

  constructor() {
    super("User email is already in use");
  }
}

export class UserNotFoundError extends Error {
  readonly code = "USER_NOT_FOUND";

  constructor() {
    super("User not found");
  }
}

interface UserRow {
  id: string;
  email: string;
  userName: string;
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async findAll(): Promise<User[]> {
    const result = await this.pool.query<UserRow>(
      "SELECT id, email, user_name AS \"userName\" FROM users ORDER BY created_at, id",
    );
    return result.rows.map(toUser);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(
      "SELECT id, email, user_name AS userName FROM users WHERE email = $1",
      [email],
    );
    return result.rows[0] ? toUser(result.rows[0]) : undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(
      "SELECT id, email, user_name AS userName FROM users WHERE id = $1",
      [id],
    );
    return result.rows[0] ? toUser(result.rows[0]) : undefined;
  }

    async save(user: User): Promise<void> {
    try {
            await this.pool.query("INSERT INTO users (id, email, user_name) VALUES ($1, $2, $3)", [
        user.id,
        user.email,
        user.userName,
      ]);
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async update(user: User): Promise<void> {
    try {
      const result = await this.pool.query(
        "UPDATE users SET email = $2, user_name = $3, updated_at = NOW() WHERE id = $1",
        [user.id, user.email, user.userName],
      );

      if (result.rowCount === 0) {
        throw new UserNotFoundError();
      }
    } catch (error) {
      throw mapDatabaseError(error);
    }
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM users WHERE id = $1", [id]);
    return result.rowCount !== 0;
  }
}

function toUser(row: UserRow): User {
    // The SQL queries alias `user_name` as `userName`, so the row exposes
    // `userName` directly. Map it to the domain property here.
    return new User({ id: row.id, email: row.email, userName: row.userName });
}

function mapDatabaseError(error: unknown): Error {
  if (isDatabaseError(error) && error.code === "23505") {
    return new EmailAlreadyExistsError();
  }

  return error instanceof Error ? error : new Error("Database operation failed");
}

function isDatabaseError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error;
}
