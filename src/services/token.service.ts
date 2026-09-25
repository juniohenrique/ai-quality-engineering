import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  sub: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
}

export interface VerifiedAccessPayload extends AccessTokenPayload {
  iat?: number;
  exp?: number;
}

export interface VerifiedRefreshPayload extends RefreshTokenPayload {
  iat?: number;
  exp?: number;
}

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

/**
 * Token service for issuing and verifying JWT access and refresh tokens.
 *
 * The JWT secret is read from the `JWT_SECRET` environment variable and must
 * be present at module load (boot) time — otherwise the process will fail
 * immediately rather than starting in an insecure state.
 */
const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }

  return secret;
})();

export class TokenService {
  signAccess(payload: AccessTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: ACCESS_TTL,
    });
  }

  signRefresh(payload: RefreshTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: REFRESH_TTL,
    });
  }

  verifyAccess(token: string): VerifiedAccessPayload {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;

    if (typeof decoded.sub !== "string" || typeof decoded.role !== "string") {
      throw new jwt.JsonWebTokenError(
        "Token payload is missing required claims",
      );
    }

    return { sub: decoded.sub, role: decoded.role };
  }

  verifyRefresh(token: string): VerifiedRefreshPayload {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;

    if (typeof decoded.sub !== "string") {
      throw new jwt.JsonWebTokenError(
        "Token payload is missing required claims",
      );
    }

    return { sub: decoded.sub };
  }
}
