import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { UserService } from "./user.service.js";

/**
 * Time-to-live (em milissegundos) de um token de redefinição de senha.
 *
 * Exportada como constante para que os testes de unidade possam fazer
 * asserções sobre a expiração sem depender do relógio real.
 */
export const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Serviço de redefinição de senha.
 *
 * Gerencia o ciclo de vida dos tokens one-time usados para redefinir
 * senhas: criação, validação e consumo (marcação como usado). Os tokens
 * são armazenados como hash SHA-256 na tabela `password_reset_tokens`;
 * o valor bruto nunca é persistido.
 */
export class PasswordResetService {
  constructor(
    private readonly pool: Pool,
    private readonly userService: UserService,
  ) {}

  /**
   * Cria um novo token de redefinição de senha para o usuário identificado
   * pelo e-mail informado.
   *
   * - Se o usuário não existir, retorna `null` para não revelar a
   *   existência (ou ausência) do e-mail.
   - - Gera um token bruto criptograficamente aleatório, calcula seu
   *   hash SHA-256 e persite apenas o hash.
   * - Invalida (deleta) tokens anteriores do mesmo usuário, mantendo
   *   apenas um token ativo de cada vez.
   *
   * @returns `{ rawToken, userId, email }` ou `null` quando o usuário não existe.
   */
  async createResetToken(
    email: string,
  ): Promise<{ rawToken: string; userId: string; email: string } | null> {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      return null;
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = toSha256(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    // Mantém apenas um token ativo por usuário: remove os tokens
    // anteriores antes de inserir o novo. A ordem (DELETE → INSERT)
    // garante atomicidade dessa invariante no escopo da mesma
    // conexão quando envolvido por uma transação externa.
    await this.pool.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [user.id]);

    await this.pool.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [user.id, tokenHash, expiresAt],
    );

    return { rawToken, userId: user.id, email: user.email };
  }

  /**
   * Valida um token bruto verificando sua existência e vigência.
   *
   * Um token é considerado válido quando:
   * - o hash SHA-256 corresponde a um registro na tabela;
   * - ainda não foi usado (`used_at IS NULL`);
   * - ainda não expirou (`expires_at > now()`).
   *
   * @returns `{ userId }` quando válido, `null` caso contrário.
   */
  async validateToken(rawToken: string): Promise<{ userId: string } | null> {
    const tokenHash = toSha256(rawToken);

    const result = await this.pool.query<{ user_id: string }>(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()",
      [tokenHash],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return { userId: row.user_id };
  }

  /**
   * Consome um token de redefinição de senha dentro de uma transação.
   *
   * - Valida o token novamente dentro da mesma transação (isolamento).
   * - Atualiza a senha do usuário com o `newPasswordHash` informado.
   * - Marca o token como usado (`used_at = now()`).
   *
   * @returns `true` quando o token foi válido e consumido com sucesso,
   *          `false` quando o token é inválido (nada é alterado).
   */
  async consumeToken(rawToken: string, newPasswordHash: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const tokenHash = toSha256(rawToken);

      const result = await client.query<{ user_id: string }>(
        "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()",
        [tokenHash],
      );

      const row = result.rows[0];

      if (!row) {
        await client.query("ROLLBACK");
        return false;
      }

      const userId = row.user_id;

      await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
        userId,
        newPasswordHash,
      ]);

      await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1", [
        tokenHash,
      ]);

      await client.query("COMMIT");

      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

/**
 * Calcula o hash SHA-256 de uma string e retorna o digeste em
 * hexadecimal. Usado tanto na persistência quanto na validação de
 * tokens, garantindo que o valor bruto nunca seja armazenado.
 */
function toSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
