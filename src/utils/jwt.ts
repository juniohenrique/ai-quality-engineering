import jwt from "jsonwebtoken";
import type { JwtPayload, Secret } from "jsonwebtoken";

export type { JwtPayload, Secret };
export type TokenExpiry = NonNullable<jwt.SignOptions["expiresIn"]>;

export interface AuthTokenPayload {
  sub: string;
  email: string;
}

export const JWT_SECRET: jwt.Secret = process.env.JWT_SECRET ?? "test-secret";

const TOKEN_EXPIRES_IN = "15m";

interface TokenBlacklist {
  invalid(token: string): void;
  isValid(token: string): boolean;
}

export class InMemoryTokenBlacklist implements TokenBlacklist {
  private readonly revoked = new Set<string>();

  invalid(token: string): void {
    this.revoked.add(token);
  }

  isValid(token: string): boolean {
    return !this.revoked.has(token);
  }
}

export const tokenBlacklist = new InMemoryTokenBlacklist();

export function issueToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

export function issueTokenWithExpiry(payload: AuthTokenPayload, expiresIn: TokenExpiry): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function parseToken(token: string): jwt.JwtPayload | string {
  return jwt.verify(token, JWT_SECRET);
}

export function isJwtExpired(payload: jwt.JwtPayload): boolean {
  if (!payload.exp) {
    return false;
  }

  return Math.floor(Date.now() / 1000) >= payload.exp;
}
