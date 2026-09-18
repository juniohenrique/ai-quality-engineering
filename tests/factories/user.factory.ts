import { User, type UserProperties } from "../../src/domain/user.js";

const defaultUser: UserProperties = {
  id: "user-1",
  email: "user@example.com",
  name: "Ada Lovelace",
};

export class UserFactory {
  static create(overrides: Partial<UserProperties> = {}): User {
    return new User({ ...defaultUser, ...overrides });
  }
}
