import type { User } from "../domain/user.js";

export interface UserResponse {
  id: string;
  email: string;
  userName: string;
  role: string;
}

/**
 * Serializes a User entity into a safe HTTP response object.
 * Always omits `passwordHash` to prevent leaking password hashes over the API.
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    userName: user.userName,
    role: user.role,
  };
}
