import { describe, expect, it } from "vitest";
import { UserFactory } from "../../factories/user.factory.js";

describe("UserFactory", () => {
  it("creates deterministic users with valid defaults", () => {
    expect(UserFactory.create()).toEqual(UserFactory.create());
    expect(UserFactory.create()).toEqual({
      id: "user-1",
      email: "user@example.com",
      name: "Ada Lovelace",
    });
  });

  it("allows overriding selected properties", () => {
    expect(
      UserFactory.create({
        id: "user-2",
        name: "Grace Hopper",
      }),
    ).toEqual({
      id: "user-2",
      email: "user@example.com",
      name: "Grace Hopper",
    });
  });

  it("creates a deterministic batch with isolated IDs", () => {
    expect(UserFactory.createMany(3)).toEqual([
      UserFactory.create({ id: "user-1" }),
      UserFactory.create({ id: "user-2" }),
      UserFactory.create({ id: "user-3" }),
    ]);
  });

  it.each([-1, 1.5])("rejects an invalid count: %s", (count) => {
    expect(() => UserFactory.createMany(count)).toThrow(
      "User count must be a non-negative integer",
    );
  });
});
