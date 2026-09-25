import bcrypt from "bcrypt";

const BCRYPT_COST = 12;

/**
 * Password hashing and verification service.
 *
 * Uses bcrypt (cost factor 12) for both hashing and verification. bcrypt
 * performs a constant-time comparison internally, so no manual
 * `crypto.timingSafeEqual` is required.
 */
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
