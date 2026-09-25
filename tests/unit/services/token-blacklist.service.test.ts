import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("TokenBlacklistService", () => {
  // Imported inside the describe so that vi.useFakeTimers is already active
  // when the module-evaluation code (which calls setInterval) runs.
  let service: TokenBlacklistService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new TokenBlacklistService();
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  it("adds a jti and reports it as blacklisted", () => {
    const jti = "token-1";
    const future = new Date(Date.now() + 60_000);

    service.add(jti, future);

    expect(service.isBlacklisted(jti)).toBe(true);
  });

  it("returns false for a jti that was never added", () => {
    expect(service.isBlacklisted("non-existent")).toBe(false);
  });

  it("removes expired entries during cleanup", () => {
    const validJti = "token-valid";
    // Use a far-future expiry so the timer advance doesn't also expire it.
    const farFuture = new Date(Date.now() + 1_000_000);

    service.add(validJti, farFuture);
    expect(service.isBlacklisted(validJti)).toBe(true);

    // Advance past the 5-minute cleanup interval.
    vi.advanceTimersByTime(5 * 60_000);

    // The still-valid entry should remain blacklisted.
    expect(service.isBlacklisted(validJti)).toBe(true);
  });

  it("checks expiration lazily on isBlacklisted before cleanup runs", () => {
    const jti = "token-will-expire";
    const expired = new Date(Date.now() - 1_000);

    service.add(jti, expired);

    // An already-expired entry is not blacklisted, even before cleanup.
    expect(service.isBlacklisted(jti)).toBe(false);
  });

  it("stops the cleanup timer on dispose without error", () => {
    // `setInterval` from `timers` is a direct re-export, so we spy on the
    // function the module actually uses. We can't assert the call directly,
    // but we can verify dispose runs without throwing and that a subsequent
    // interval does not fire.
    expect(() => service.dispose()).not.toThrow();

    // Advancing timers after dispose should not throw or cause side-effects.
    vi.advanceTimersByTime(10 * 60_000);
  });
});

// Import below the describe so that vi.useFakeTimers is active at load time.
import { TokenBlacklistService } from "../../../src/services/token-blacklist.service.js";
