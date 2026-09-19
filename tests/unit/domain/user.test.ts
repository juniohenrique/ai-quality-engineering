import { describe, expect, it } from "vitest";
import { User } from "../../../src/domain/user.js";

describe("User", () => {
  it("stores a valid id, email and name", () => {
    const user = new User({
      id: "user-1",
      email: "  USER@EXAMPLE.COM ",
      name: " Ada Lovelace ",
    });

    expect(user).toEqual({
      id: "user-1",
      email: "user@example.com",
      name: "Ada Lovelace",
    });
  });

  it.each([
    ["", "valid@example.com", "Ada", "User id is required"],
    ["user-1", "invalid-email", "Ada", "User email is invalid"],
    ["user-1", "valid@example.com", "", "User name is required"],
  ])("rejects invalid user data", (id, email, name, message) => {
    expect(() => new User({ id, email, name })).toThrow(message);
  });
});
