import type { User } from "../domain/user.js";
import type { UserRepository } from "./user.repository.js";

export class InMemoryUserRepository implements UserRepository {
  private readonly users: User[] = [];

  async findAll(): Promise<User[]> {
    return [...this.users];
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email === email);
  }

  async findById(id: string): Promise<User | undefined> {
    return this.users.find((user) => user.id === id);
  }

  async save(user: User): Promise<void> {
    this.users.push(user);
  }
}
