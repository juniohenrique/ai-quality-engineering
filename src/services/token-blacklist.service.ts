import { clearInterval, setInterval } from "timers";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * In-memory token blacklist for revoked refresh tokens.
 *
 * Each entry maps a token id (`jti`) to the `Date` at which it expires.
 * A background timer removes expired entries every 5 minutes, keeping the
 * set bounded for long-running processes. No external store is required.
 */
export class TokenBlacklistService {
  private readonly blacklisted = new Map<string, Date>();

  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.removeExpired(),
      CLEANUP_INTERVAL_MS,
    ).unref();
  }

  /**
   * Revokes a token id by recording its expiry time.
   * Calling `add` with an already-known `jti` resets its expiry.
   */
  add(jti: string, expiresAt: Date): void {
    this.blacklisted.set(jti, expiresAt);
  }

  /** Returns `true` when the `jti` is currently revoked. */
  isBlacklisted(jti: string): boolean {
    const expiresAt = this.blacklisted.get(jti);

    if (expiresAt === undefined) {
      return false;
    }

    if (expiresAt.getTime() <= Date.now()) {
      this.blacklisted.delete(jti);
      return false;
    }

    return true;
  }

  /** Removes all entries whose expiry time has already passed. */
  private removeExpired(): void {
    const now = Date.now();

    for (const [jti, expiresAt] of this.blacklisted) {
      if (expiresAt.getTime() <= now) {
        this.blacklisted.delete(jti);
      }
    }
  }

  /**
   * Stops the background cleanup timer.
   * Should be called when the owning process is shutting down.
   */
  dispose(): void {
    clearInterval(this.cleanupTimer);
  }
}
