import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { checkRateLimit } from "../../../src/middlewares/rate-limit.middleware.js";

// RFC 5737 test IPs (TEST-NET-1, TEST-NET-2, TEST-NET-3)
// Use unique IPs per test to avoid cross-test contamination
// since the limiter is a module-level singleton.
const TEST_IPS = {
  allow: "192.0.2.10",
  block: "192.0.2.20",
  isolateA: "192.0.2.30",
  isolateB: "192.0.2.40",
  bypass: "192.0.2.50",
  reset: "198.51.100.10",
  unknown: "203.0.113.10",
} as const;

// Helper local: cria mock de IncomingMessage usando x-forwarded-for
function createMockRequest(ip: string): IncomingMessage {
  return {
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: "127.0.0.1" }, // ignored when x-forwarded-for present
  } as unknown as IncomingMessage;
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("allows 5 requests from the same IP within the window", async () => {
    const request = createMockRequest(TEST_IPS.allow);

    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(request);
      expect(result).toEqual({ ok: true });
    }
  });

  it("blocks the 6th request from the same IP with retryAfter > 0", async () => {
    const request = createMockRequest(TEST_IPS.block);

    // Make 5 allowed requests
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(request);
      expect(result).toEqual({ ok: true });
    }

    // 6th request should be blocked
    const result = await checkRateLimit(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfter).toBeGreaterThan(0);
    }
  });

  it("allows different IPs to have isolated buckets", async () => {
    const requestA = createMockRequest(TEST_IPS.isolateA);
    const requestB = createMockRequest(TEST_IPS.isolateB);

    // Exhaust IP A's limit
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(requestA);
      expect(result).toEqual({ ok: true });
    }
    const blockedA = await checkRateLimit(requestA);
    expect(blockedA.ok).toBe(false);

    // IP B should still have full quota
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(requestB);
      expect(result).toEqual({ ok: true });
    }
  });

  it("bypasses rate limiting when RATE_LIMIT_DISABLED=true", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "true");

    const request = createMockRequest(TEST_IPS.bypass);

    // Should allow unlimited requests when disabled
    for (let i = 0; i < 10; i++) {
      const result = await checkRateLimit(request);
      expect(result).toEqual({ ok: true });
    }

    vi.unstubAllEnvs();
  });

  it("allows requests again after the time window resets", async () => {
    const request = createMockRequest(TEST_IPS.reset);

    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(request);
      expect(result).toEqual({ ok: true });
    }
    const blocked = await checkRateLimit(request);
    expect(blocked.ok).toBe(false);

    // Advance time by 15 minutes + 1 second (window duration + buffer)
    vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

    // Should be allowed again after window reset
    const result = await checkRateLimit(request);
    expect(result).toEqual({ ok: true });
  });

  it("uses 'unknown' as key when x-forwarded-for and remoteAddress are undefined", async () => {
    const request = {
      headers: {},
      socket: { remoteAddress: undefined },
    } as unknown as IncomingMessage;

    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(request);
      expect(result).toEqual({ ok: true });
    }

    const blocked = await checkRateLimit(request);
    expect(blocked.ok).toBe(false);
  });
});
