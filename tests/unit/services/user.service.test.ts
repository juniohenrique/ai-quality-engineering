import { describe, expect, it, vi } from "vitest";
import { User } from "../../../src/domain/user.js";
import type { UserRepository } from "../../../src/repositories/user.repository.js";
import { UserService } from "../../../src/services/user.service.js";

function createRepository(): UserRepository {
  return {
    findAll: vi.fn(),
    findByEmail: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
}

describe("UserService", () => {
  it("creates and saves a user with a generated id", async () => {
    const repository = createRepository();
    vi.mocked(repository.findByEmail).mockResolvedValue(undefined);
    vi.mocked(repository.save).mockResolvedValue(undefined);
    const service = new UserService(repository);

    const user = await service.createUser({
      email: " USER@EXAMPLE.COM ",
      userName: " Ada Lovelace ",
    });

    expect(user).toEqual({
      id: expect.any(String),
      email: "user@example.com",
      userName: "Ada Lovelace",
    });
    expect(repository.findByEmail).toHaveBeenCalledWith("user@example.com");
    expect(repository.save).toHaveBeenCalledWith(user);
  });

  it("rejects a duplicated email without saving", async () => {
    const repository = createRepository();
    const existingUser = new User({
      id: "user-1",
      email: "user@example.com",
      userName: "Ada Lovelace",
    });
    vi.mocked(repository.findByEmail).mockResolvedValue(existingUser);
    const service = new UserService(repository);

    await expect(
      service.createUser({
        email: "USER@EXAMPLE.COM",
        userName: "Another User",
      }),
    ).rejects.toThrow("User email is already in use");

    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    { email: "invalid-email", userName: "Ada Lovelace" },
    { email: "ada@example.com", userName: "" },
  ])("rejects invalid user data: %s", async (input) => {
    const repository = createRepository();
    vi.mocked(repository.findByEmail).mockResolvedValue(undefined);
    const service = new UserService(repository);

    await expect(service.createUser(input)).rejects.toThrow();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("delegates user lookup to the repository", async () => {
    const repository = createRepository();
    const user = new User({
      id: "user-1",
      email: "user@example.com",
      userName: "Ada Lovelace",
    });
    vi.mocked(repository.findById).mockResolvedValue(user);
    const service = new UserService(repository);

    await expect(service.findUserById("user-1")).resolves.toBe(user);
    expect(repository.findById).toHaveBeenCalledWith("user-1");
  });

  it("delegates listing users to the repository", async () => {
    const repository = createRepository();
    const users = [
      new User({
        id: "user-1",
        email: "user@example.com",
        userName: "Ada Lovelace",
      }),
    ];
    vi.mocked(repository.findAll).mockResolvedValue(users);
    const service = new UserService(repository);

    await expect(service.listUsers()).resolves.toBe(users);
    expect(repository.findAll).toHaveBeenCalledOnce();
  });

  it("updates an existing user", async () => {
    const repository = createRepository();
    const existingUser = new User({
      id: "user-1",
      email: "user@example.com",
      userName: "Ada Lovelace",
    });
    vi.mocked(repository.findById).mockResolvedValue(existingUser);
    vi.mocked(repository.findByEmail).mockResolvedValue(undefined);
    vi.mocked(repository.update).mockResolvedValue(undefined);
    const service = new UserService(repository);

    await expect(
      service.updateUser("user-1", {
        email: "updated@example.com",
        userName: "Ada Byron Lovelace",
      }),
    ).resolves.toEqual({
      id: "user-1",
      email: "updated@example.com",
      userName: "Ada Byron Lovelace",
    });
    expect(repository.update).toHaveBeenCalledWith({
      id: "user-1",
      email: "updated@example.com",
      userName: "Ada Byron Lovelace",
    });
  });

  it("returns undefined when updating a missing user", async () => {
    const repository = createRepository();
    vi.mocked(repository.findById).mockResolvedValue(undefined);
    const service = new UserService(repository);

    await expect(
      service.updateUser("missing-user", {
        email: "user@example.com",
        userName: "Ada Lovelace",
      }),
    ).resolves.toBeUndefined();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("rejects an update with an email used by another user", async () => {
    const repository = createRepository();
    const existingUser = new User({
      id: "user-1",
      email: "user@example.com",
      userName: "Ada Lovelace",
    });
    const conflictingUser = new User({
      id: "user-2",
      email: "other@example.com",
      userName: "Grace Hopper",
    });
    vi.mocked(repository.findById).mockResolvedValue(existingUser);
    vi.mocked(repository.findByEmail).mockResolvedValue(conflictingUser);
    const service = new UserService(repository);

    await expect(
      service.updateUser("user-1", {
        email: "other@example.com",
        userName: "Ada Byron Lovelace",
      }),
    ).rejects.toThrow("User email is already in use");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("deletes a user through the repository", async () => {
    const repository = createRepository();
    vi.mocked(repository.remove).mockResolvedValue(true);
    const service = new UserService(repository);

    await expect(service.deleteUser("user-1")).resolves.toBe(true);
    expect(repository.remove).toHaveBeenCalledWith("user-1");
  });

  it("returns false when deleting a missing user", async () => {
    const repository = createRepository();
    vi.mocked(repository.remove).mockResolvedValue(false);
    const service = new UserService(repository);

    await expect(service.deleteUser("missing-user")).resolves.toBe(false);
  });
});
