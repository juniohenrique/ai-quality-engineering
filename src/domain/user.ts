export type UserRole = "admin" | "user";

export interface UserProperties {
  id: string;
  email: string;
  userName: string;
  passwordHash?: string | null;
  role?: UserRole;
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly userName: string;
  readonly passwordHash: string | null;
  readonly role: UserRole;

  constructor(properties: UserProperties) {
    const id = properties.id.trim();
    const email = properties.email.trim().toLowerCase();
    const userName = properties.userName.trim();
    const role = normalizeRole(properties.role);

    if (!id) {
      throw new Error("User id is required");
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error("User email is invalid");
    }

    if (!userName) {
      throw new Error("User name is required");
    }

    this.id = id;
    this.email = email;
    this.userName = userName;
    this.passwordHash = properties.passwordHash ?? null;
    this.role = role;
  }
}

function normalizeRole(role: UserRole | undefined): UserRole {
  if (role === undefined) {
    return "user";
  }

  if (!isUserRole(role)) {
    throw new Error(`Invalid user role: ${role}`);
  }

  return role;
}

function isUserRole(value: string): value is UserRole {
  return value === "admin" || value === "user";
}
