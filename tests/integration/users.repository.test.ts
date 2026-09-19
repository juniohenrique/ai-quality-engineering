import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closeDatabase, resetDatabase, testDatabase } from "../setup/db.js";
import { User } from "../../src/domain/user.js";
import {
  EmailAlreadyExistsError,
  PostgresUserRepository,
} from "../../src/repositories/postgres-user.repository.js";

const runDatabaseIntegration = process.env.RUN_DB_INTEGRATION === "true";
const describeDatabase = runDatabaseIntegration ? describe : describe.skip;
let repository: PostgresUserRepository;

describeDatabase("PostgresUserRepository integration", () => {
  beforeAll(async () => {
    repository = new PostgresUserRepository(testDatabase);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it("persists a user across repository instances", async () => {
    const user = new User({
      id: randomUUID(),
      email: `integration-${randomUUID()}@example.com`,
      name: "Ada Lovelace",
    });

    await repository.save(user);
    const restartedRepository = new PostgresUserRepository(testDatabase);

    await expect(restartedRepository.findById(user.id)).resolves.toEqual(user);
    await expect(restartedRepository.remove(user.id)).resolves.toBe(true);
  });

  it("maps the unique email constraint", async () => {
    const email = `duplicate-${randomUUID()}@example.com`;
    const firstUser = new User({ id: randomUUID(), email, name: "Ada" });
    const secondUser = new User({ id: randomUUID(), email, name: "Grace" });

    await repository.save(firstUser);
    await expect(repository.save(secondUser)).rejects.toBeInstanceOf(EmailAlreadyExistsError);
    await repository.remove(firstUser.id);
  });
});
