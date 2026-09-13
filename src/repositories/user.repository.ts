import type { User } from "../domain/user.js";

export interface UserRepository {
  findAll(): Promise<User[]>;
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  save(user: User): Promise<void>;
  update(user: User): Promise<void>;
}
