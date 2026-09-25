import { describe, expect, it } from "vitest";
import { User } from "../../../src/domain/user.js";

describe("User", () => {
  it("stores a valid id, email and userName", () => {
    const user = new User({
      id: "user-1",
      email: "  USER@EXAMPLE.COM ",
      userName: " Ada Lovelace ",
    });

    expect(user).toEqual({
      id: "user-1",
      email: "user@example.com",
      userName: "Ada Lovelace",
      passwordHash: null,
      role: "user",
    });
  });

  it.each([
    ["", "valid@example.com", "Ada", "User id is required"],
    ["user-1", "invalid-email", "Ada", "User email is invalid"],
    ["user-1", "valid@example.com", "", "User name is required"],
  ])("rejects invalid user data", (id, email, name, message) => {
    expect(() => new User({ id, email, userName: name })).toThrow(message);
  });
});
