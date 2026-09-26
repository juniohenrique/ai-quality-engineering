import { randomUUID } from "node:crypto";
import { User } from "../domain/user.js";
import type { UserRepository } from "../repositories/user.repository.js";

export interface CreateUserInput {
  email: string;
  userName: string;
}

export type UpdateUserInput = CreateUserInput;

export class UserService {
  constructor(private readonly repository: UserRepository) {}

  async createUser(input: CreateUserInput): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.repository.findByEmail(email);

    if (existingUser) {
      throw new Error("User email is already in use");
    }

    const user = new User({
      id: randomUUID(),
      email,
      userName: input.userName,
    });

    await this.repository.save(user);
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLowerCase();
    return this.repository.findByEmail(normalized);
  }

  async findUserById(id: string): Promise<User | undefined> {
    return this.repository.findById(id);
  }

  async listUsers(): Promise<User[]> {
    return this.repository.findAll();
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User | undefined> {
    const existingUser = await this.repository.findById(id);

    if (!existingUser) {
      return undefined;
    }

    const email = input.email.trim().toLowerCase();
    const userWithEmail = await this.repository.findByEmail(email);

    if (userWithEmail && userWithEmail.id !== id) {
      throw new Error("User email is already in use");
    }

    const updatedUser = new User({
      id,
      email,
      userName: input.userName,
      passwordHash: existingUser.passwordHash,
      role: existingUser.role,
    });

    await this.repository.update(updatedUser);
    return updatedUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.repository.remove(id);
  }
}
