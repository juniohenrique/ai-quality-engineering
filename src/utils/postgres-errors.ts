/**
 * Utility for inspecting PostgreSQL-specific error codes.
 *
 * The `pg` library exposes the server-side SQLSTATE in the `code` property of
 * the error object that is thrown when a query fails.  These codes are stable
 * across PostgreSQL versions and can be used to branch application logic — for
 * example, detecting a `unique_violation` without parsing the error message.
 *
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */

/**
 * SQLSTATE for PostgreSQL `unique_violation` (also applies to PRIMARY KEY
 * violations).  When a UNIQUE or PRIMARY KEY constraint is violated the server
 * returns this code in `error.code`.
 */
export const UNIQUE_VIOLATION_CODE = "23505" as const;

/**
 * Type guard that determines whether an unknown error originated from a
 * PostgreSQL UNIQUE constraint violation.
 *
 * The `pg` library sets `error.code` to the SQLSTATE string `"23505"` when
 * a UNIQUE or PRIMARY KEY constraint is breached.  The optional `schema`
 * and `table` fields are available on more recent versions of `pg` but are
 * not relied upon here — the `code` property alone is sufficient and stable.
 *
 * @param error - The caught value (can be of any type).
 * @returns `true` when the error carries `code === "23505"`.
 *
 * @example
 * try {
 *   await repository.create(payment);
 * } catch (error) {
 *   if (isUniqueViolation(error)) {
 *     // handle duplicate gracefully
 *   }
 *   throw error;
 * }
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code: unknown }).code === UNIQUE_VIOLATION_CODE;
  }
  return false;
}
