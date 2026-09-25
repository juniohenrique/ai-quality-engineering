import { User, type UserProperties } from "../../src/domain/user.js";

const defaultUser: UserProperties = {
  id: "user-1",
  email: "user@example.com",
  userName: "Ada Lovelace",
  passwordHash: null,
  role: "user",
};

export class UserFactory {
  /** Creates one deterministic user, optionally replacing defaults. */
  static create(overrides: Partial<UserProperties> = {}): User {
    return new User({ ...defaultUser, ...overrides });
  }

  /** Creates deterministic users with distinct IDs for batch scenarios. */
  static createMany(count: number, overrides: Partial<UserProperties> = {}): User[] {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("User count must be a non-negative integer");
    }

    return Array.from({ length: count }, (_, index) =>
      UserFactory.create({
        ...overrides,
        id: overrides.id ?? `user-${index + 1}`,
      }),
    );
  }
}
