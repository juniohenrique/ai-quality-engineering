import type { AuthContext } from "./auth.middleware.js";

/**
 * Checks whether the authenticated context satisfies the required role.
 *
 * Authorization is **exact-match** (non-hierarchical): an `admin` role does
 * NOT implicitly satisfy a `user` requirement and vice-versa.
 */
export function requireRole(
  context: AuthContext,
  required: "admin" | "user",
): boolean {
  return context.role === required;
}
