import type { IncomingMessage } from "node:http";
import { RateLimiterMemory, type RateLimiterRes } from "rate-limiter-flexible";

const limiter = new RateLimiterMemory({
  points: 5,
  duration: 15 * 60,
});

/**
 * Checks if the request IP has exceeded the rate limit for login attempts.
 *
 * @param request - The incoming HTTP request
 * @returns Object indicating if request is allowed, and retryAfter seconds if not
 */
export async function checkRateLimit(
  request: IncomingMessage,
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  // Bypass check at request time (not module load) for testing
  if (process.env.RATE_LIMIT_DISABLED === "true") {
    return { ok: true };
  }

  // Atrás de proxy confiável (nginx/ALB), remoteAddress é o proxy.
  // X-Forwarded-For carrega o cliente real. Confiar apenas quando
  // houver proxy na frente (hardening de proxy allowlist: S07).
  const forwardedFor = request.headers["x-forwarded-for"];
  const firstForwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]?.split(",")[0]?.trim()
    : forwardedFor?.split(",")[0]?.trim();
  const ip = firstForwardedIp ?? request.socket.remoteAddress ?? "unknown";

  try {
    await limiter.consume(ip);
    return { ok: true };
  } catch (rateLimiterRes) {
    const res = rateLimiterRes as RateLimiterRes;
    const retryAfter = Math.ceil(res.msBeforeNext / 1000);
    return { ok: false, retryAfter };
  }
}
