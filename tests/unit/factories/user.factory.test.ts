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
});
