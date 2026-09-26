import { describe, expect, it } from "vitest";
import { PasswordService } from "../../../src/services/password.service.js";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("produces a hash that differs from the plain password", async () => {
    const plain = "super-secret-123";
    const hash = await service.hash(plain);

    expect(hash).not.toBe(plain);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("verifies a correct password against its hash", async () => {
    const plain = "correct-password";
    const hash = await service.hash(plain);

    await expect(service.verify(plain, hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await service.hash("right-password");

    await expect(service.verify("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a different hash on each call due to a unique salt", async () => {
    const plain = "same-password";
    const [hash1, hash2] = await Promise.all([
      service.hash(plain),
      service.hash(plain),
    ]);

    expect(hash1).not.toBe(hash2);
    // Both hashes should still verify against the same plain password.
    await expect(service.verify(plain, hash1)).resolves.toBe(true);
    await expect(service.verify(plain, hash2)).resolves.toBe(true);
  });
});
