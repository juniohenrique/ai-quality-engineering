import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Pool, QueryResult } from "pg";
import { User } from "../../../src/domain/user.js";
import { UserService } from "../../../src/services/user.service.js";
import {
  PasswordResetService,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "../../../src/services/password-reset.service.js";
import type { UserRepository } from "../../../src/repositories/user.repository.js";

/**
 * Cria um mock minimal e configurável para o `Pool` do `pg`.
 *
 * Como `Pool.query` é um método sobrecarregado em @types/pg, usar
 * `vi.mocked(pool.query).mockResolvedValue(...)` sofre com inferência de
 * tipo imprecisa. Por isso mantemos referências diretas aos `vi.fn()`
 * subjacentes e usamos-nos para configuração, contornando os overloads
 * sem precisar de `as never`.
 */
function createPoolMock() {
  const clientQuery = vi.fn();
  const client = {
    query: clientQuery,
    release: vi.fn(),
  };

  const query = vi.fn();
  const pool = {
    query,
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;

  return { pool, query, client, clientQuery };
}

/** Cria um `UserService` real com repositório de mentirinha e espiã `findByEmail`. */
function createUserServiceMock(): {
  userService: UserService;
  findByEmail: ReturnType<typeof vi.fn>;
} {
  const findByEmail = vi.fn();
  const userService = new UserService({} as unknown as UserRepository);
  vi.spyOn(userService, "findByEmail").mockImplementation(findByEmail);
  return { userService, findByEmail };
}

describe("PasswordResetService", () => {
  describe("createResetToken", () => {
    it("returns a non-empty rawToken and the userId when the user exists", async () => {
      const { pool, query } = createPoolMock();
      const { userService } = createUserServiceMock();

      const user = new User({
        id: "user-1",
        email: "ada@example.com",
        userName: "Ada Lovelace",
      });
      vi.mocked(userService.findByEmail).mockResolvedValue(user);

      query.mockResolvedValue({ rowCount: 1 } as QueryResult);

      const service = new PasswordResetService(pool, userService);

      const result = await service.createResetToken("ada@example.com");

      expect(result).not.toBeNull();
      expect(result).toEqual({
        rawToken: expect.any(String),
        userId: "user-1",
        email: "ada@example.com",
      });
      expect(result?.rawToken.length).toBeGreaterThan(0);
    });

    it("returns null when the user does not exist", async () => {
      const { pool, query } = createPoolMock();
      const { userService, findByEmail } = createUserServiceMock();

      vi.mocked(findByEmail).mockResolvedValue(undefined);

      const service = new PasswordResetService(pool, userService);

      await expect(service.createResetToken("nobody@example.com")).resolves.toBeNull();

      // Nenhuma query deve ser executada quando o usuário não existe.
      expect(query).not.toHaveBeenCalled();
    });

    it("stores the SHA-256 hash of the rawToken, not the rawToken itself", async () => {
      const { pool, query } = createPoolMock();
      const { userService } = createUserServiceMock();

      const user = new User({
        id: "user-1",
        email: "ada@example.com",
        userName: "Ada Lovelace",
      });
      vi.mocked(userService.findByEmail).mockResolvedValue(user);

      query.mockResolvedValue({ rowCount: 1 } as QueryResult);

      const service = new PasswordResetService(pool, userService);

      const result = await service.createResetToken("ada@example.com");

      expect(result).not.toBeNull();

      // O INSERT é o segundo call (o primeiro é o DELETE de tokens anteriores).
      const insertCall = query.mock.calls[1];
      const sql = insertCall[0] as string;
      const params = insertCall[1] as unknown[];

      expect(sql).toContain("INSERT INTO password_reset_tokens");

      const expectedHash = createHash("sha256").update(result!.rawToken).digest("hex");
      expect(params).toContain(expectedHash);
      // O rawToken em si NUNCA deve aparecer como parâmetro.
      expect(params).not.toContain(result!.rawToken);
    });

    it("deletes previous tokens for the user before inserting a new one", async () => {
      const { pool, query } = createPoolMock();
      const { userService } = createUserServiceMock();

      const user = new User({
        id: "user-1",
        email: "ada@example.com",
        userName: "Ada Lovelace",
      });
      vi.mocked(userService.findByEmail).mockResolvedValue(user);

      query.mockResolvedValue({ rowCount: 1 } as QueryResult);

      const service = new PasswordResetService(pool, userService);

      await service.createResetToken("ada@example.com");

      expect(query).toHaveBeenCalledTimes(2);

      const deleteCall = query.mock.calls[0];
      expect(deleteCall[0]).toBe("DELETE FROM password_reset_tokens WHERE user_id = $1");
      expect(deleteCall[1]).toEqual(["user-1"]);

      const insertCall = query.mock.calls[1];
      expect(insertCall[0] as string).toContain("INSERT INTO password_reset_tokens");
      expect(insertCall[1]?.[0]).toBe("user-1");
    });
  });

  describe("validateToken", () => {
    it("returns the userId when the token is valid", async () => {
      const { pool, query } = createPoolMock();
      const { userService } = createUserServiceMock();

      const rawToken = "valid-raw-token";
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      query.mockResolvedValue({ rows: [{ user_id: "user-1" }] });

      const service = new PasswordResetService(pool, userService);

      const result = await service.validateToken(rawToken);

      expect(result).toEqual({ userId: "user-1" });

      const [sql, params] = query.mock.calls[0];
      expect(sql as string).toContain("token_hash = $1");
      expect(sql as string).toContain("used_at IS NULL");
      expect(sql as string).toContain("expires_at > NOW()");
      expect(params).toEqual([tokenHash]);
    });

    it("returns null when the token does not exist", async () => {
      const { pool, query } = createPoolMock();
      const { userService } = createUserServiceMock();

      query.mockResolvedValue({ rows: [] });

      const service = new PasswordResetService(pool, userService);

      await expect(service.validateToken("non-existent")).resolves.toBeNull();
    });

    it("returns null when the token has expired", async () => {
      const { pool, query } = createPoolMock();
      const { userService } = createUserServiceMock();

      // O SQL filtra por expires_at > NOW(), portanto um token expirado
      // resulta em um conjunto de linhas vazio.
      query.mockResolvedValue({ rows: [] });

      const service = new PasswordResetService(pool, userService);

      await expect(service.validateToken("expired-token")).resolves.toBeNull();
    });

    it("returns null when the token has already been used", async () => {
      const { pool, query } = createPoolMock();
      const { userService } = createUserServiceMock();

      // O SQL filtra por used_at IS NULL; um token já usado não aparece.
      query.mockResolvedValue({ rows: [] });

      const service = new PasswordResetService(pool, userService);

      await expect(service.validateToken("used-token")).resolves.toBeNull();
    });
  });

  describe("consumeToken", () => {
    it("updates the password and marks the token as used on a valid token", async () => {
      const { pool, client, clientQuery } = createPoolMock();
      const { userService } = createUserServiceMock();

      const rawToken = "valid-raw-token";
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const newPasswordHash = "hashed-new-password";

      // Ordem: BEGIN, SELECT, UPDATE users, UPDATE tokens, COMMIT
      clientQuery
        .mockResolvedValueOnce({} as QueryResult) // BEGIN
        .mockResolvedValueOnce({ rows: [{ user_id: "user-1" }] }) // SELECT
        .mockResolvedValueOnce({ rowCount: 1 } as QueryResult) // UPDATE users
        .mockResolvedValueOnce({ rowCount: 1 } as QueryResult) // UPDATE tokens
        .mockResolvedValueOnce({} as QueryResult); // COMMIT

      const service = new PasswordResetService(pool, userService);

      const result = await service.consumeToken(rawToken, newPasswordHash);

      expect(result).toBe(true);

      // BEGIN
      expect(clientQuery).toHaveBeenNthCalledWith(1, "BEGIN");

      // SELECT dentro da transação usa o hash do rawToken e os filtros de vigência.
      const selectSql = clientQuery.mock.calls[1][0] as string;
      const selectParams = clientQuery.mock.calls[1][1];
      expect(selectSql).toContain("token_hash = $1");
      expect(selectSql).toContain("used_at IS NULL");
      expect(selectSql).toContain("expires_at > NOW()");
      expect(selectParams).toEqual([tokenHash]);

      // UPDATE users
      expect(clientQuery).toHaveBeenNthCalledWith(
        3,
        "UPDATE users SET password_hash = $2 WHERE id = $1",
        ["user-1", newPasswordHash],
      );

      // UPDATE password_reset_tokens
      expect(clientQuery).toHaveBeenNthCalledWith(
        4,
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1",
        [tokenHash],
      );

      // COMMIT
      expect(clientQuery).toHaveBeenNthCalledWith(5, "COMMIT");

      // O client foi liberado de volta ao pool.
      expect(client.release).toHaveBeenCalled();
    });

    it("returns false and performs no updates when the token is invalid", async () => {
      const { pool, client, clientQuery } = createPoolMock();
      const { userService } = createUserServiceMock();

      const rawToken = "invalid-token";
      const newPasswordHash = "hashed-new-password";

      // Ordem: BEGIN, SELECT (vazio), ROLLBACK, [client.release]
      clientQuery
        .mockResolvedValueOnce({} as QueryResult) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT → sem linha
        .mockResolvedValueOnce({} as QueryResult); // ROLLBACK

      const service = new PasswordResetService(pool, userService);

      const result = await service.consumeToken(rawToken, newPasswordHash);

      expect(result).toBe(false);

      // BEGIN
      expect(clientQuery).toHaveBeenNthCalledWith(1, "BEGIN");

      // SELECT foi emitido dentro da transação.
      const selectSql = clientQuery.mock.calls[1][0] as string;
      expect(selectSql).toContain("token_hash = $1");
      expect(selectSql).toContain("used_at IS NULL");
      expect(selectSql).toContain("expires_at > NOW()");

      // Nenhum UPDATE nem COMMIT deve ter sido emitido.
      const updateCalls = clientQuery.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].startsWith("UPDATE"),
      );
      expect(updateCalls).toHaveLength(0);

      const commitCalls = clientQuery.mock.calls.filter((call) => call[0] === "COMMIT");
      expect(commitCalls).toHaveLength(0);

      // ROLLBACK foi emitido como 3ª chamada.
      expect(clientQuery).toHaveBeenNthCalledWith(3, "ROLLBACK");

      // O client foi liberado.
      expect(client.release).toHaveBeenCalled();
    });

    it("rolls back and rethrows when a query fails", async () => {
      const { pool, client, clientQuery } = createPoolMock();
      const { userService } = createUserServiceMock();

      // BEGIN resolve, SELECT rejeita, ROLLBACK resolve (via catch interno).
      clientQuery
        .mockResolvedValueOnce({} as QueryResult) // BEGIN
        .mockRejectedValueOnce(new Error("DB error")) // SELECT falha
        .mockResolvedValueOnce({} as QueryResult); // ROLLBACK

      const service = new PasswordResetService(pool, userService);

      await expect(service.consumeToken("x", "y")).rejects.toThrow("DB error");

      expect(client.release).toHaveBeenCalled();
    });
  });

  describe("PASSWORD_RESET_TOKEN_TTL_MS", () => {
    it("exports a TTL of 15 minutes in milliseconds", () => {
      expect(PASSWORD_RESET_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
    });
  });
});
