import type { ServerResponse, IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";
import { writeErrorResponse } from "../http/error-response.js";
import type { UserService } from "../services/user.service.js";
import type { PasswordService } from "../services/password.service.js";
import type { TokenService } from "../services/token.service.js";
import type { TokenBlacklistService } from "../services/token-blacklist.service.js";
import type { AuthContext } from "../middlewares/auth.middleware.js";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

/**
 * A real bcrypt hash of a throwaway string.  It is used only to keep the
 * password-verification timing constant when the user does not exist, defeating
 * user-enumeration via timing attacks.  The verification always returns `false`
 * because the supplied password will never match.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$NwDTPYMMmTl9bqs7CMTDoO3LJS7Si4No0KHduAgi1luCScKdsvoEq";

export interface AuthDependencies {
  userService: Pick<UserService, "findByEmail" | "findUserById">;
  passwordService: Pick<PasswordService, "verify">;
  tokenService: Pick<
    TokenService,
    "signAccess" | "signRefresh" | "verifyAccess" | "verifyRefresh"
  >;
  blacklist: Pick<TokenBlacklistService, "add" | "isBlacklisted">;
}

export class AuthController {
  private readonly userService: AuthDependencies["userService"];
  private readonly passwordService: AuthDependencies["passwordService"];
  private readonly tokenService: AuthDependencies["tokenService"];
  private readonly blacklist: AuthDependencies["blacklist"];

  constructor(dependencies: AuthDependencies) {
    this.userService = dependencies.userService;
    this.passwordService = dependencies.passwordService;
    this.tokenService = dependencies.tokenService;
    this.blacklist = dependencies.blacklist;
  }

  async handleLogin(input: unknown, response: ServerResponse): Promise<void> {
    if (!isLoginInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid request");
      return;
    }

    const user = await this.userService.findByEmail(input.email);

    // When the user does not exist (or has no password hash) we still run a
    // dummy bcrypt verification so the response time is indistinguishable from
    // a failed password check — preventing user-enumeration via timing.
    if (!user || user.passwordHash === null) {
      await this.passwordService.verify(input.password, DUMMY_PASSWORD_HASH);
      writeErrorResponse(
        response,
        401,
        "invalid_credentials",
        "Invalid credentials",
      );
      return;
    }

    const passwordValid = await this.passwordService.verify(
      input.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      writeErrorResponse(
        response,
        401,
        "invalid_credentials",
        "Invalid credentials",
      );
      return;
    }

    const accessToken = this.tokenService.signAccess({
      sub: user.id,
      role: user.role,
    });
    const refreshToken = this.tokenService.signRefresh({ sub: user.id });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accessToken, refreshToken }));
  }

  async handleRefresh(input: unknown, response: ServerResponse): Promise<void> {
    if (!isRefreshInput(input)) {
      writeErrorResponse(response, 400, "invalid_request", "Invalid request");
      return;
    }

    const payload = this.verifyRefreshPayload(input.refreshToken);

    if (payload === null) {
      writeErrorResponse(response, 401, "invalid_token", "Invalid token");
      return;
    }

    const jti = payload.jti;
    if (typeof jti !== "string") {
      writeErrorResponse(response, 401, "invalid_token", "Invalid token");
      return;
    }

    if (this.blacklist.isBlacklisted(jti)) {
      writeErrorResponse(response, 401, "invalid_token", "Invalid token");
      return;
    }

    const exp = payload.exp;
    if (typeof exp !== "number") {
      writeErrorResponse(response, 401, "invalid_token", "Invalid token");
      return;
    }

    const sub = payload.sub;
    if (typeof sub !== "string") {
      writeErrorResponse(response, 401, "invalid_token", "Invalid token");
      return;
    }

    // role comes from the database, not from the refresh token: a refresh
    // token only carries `sub`, so `payload.role` is always undefined here.
    const user = await this.userService.findUserById(sub);

    if (!user) {
      writeErrorResponse(response, 401, "invalid_token", "Invalid token");
      return;
    }

    // Token rotation: issue a new pair and revoke the old refresh token.
    const accessToken = this.tokenService.signAccess({ sub, role: user.role });
    const refreshToken = this.tokenService.signRefresh({ sub });

    this.blacklist.add(jti, new Date(exp * 1000));

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ accessToken, refreshToken }));
  }

  async handleLogout(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const context = this.authenticate(request);

    if (context === null) {
      writeErrorResponse(response, 401, "unauthorized", "Unauthorized");
      return;
    }

    const exp = this.decodeExpiry(request);

    if (exp !== undefined) {
      this.blacklist.add(context.jti, new Date(exp * 1000));
    }

    response.writeHead(204);
    response.end();
  }

  async handleMe(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const context = this.authenticate(request);

    if (context === null) {
      writeErrorResponse(response, 401, "unauthorized", "Unauthorized");
      return;
    }

    const user = await this.userService.findUserById(context.userId);

    if (!user) {
      writeErrorResponse(response, 401, "unauthorized", "Unauthorized");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: user.id,
        email: user.email,
        userName: user.userName,
        role: user.role,
      }),
    );
  }

  // ── private helpers ─────────────────────────────────────────────────

  private authenticate(request: IncomingMessage): AuthContext | null {
    const header = request.headers.authorization;

    if (header === undefined) {
      return null;
    }

    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || token === undefined || token.length === 0) {
      return null;
    }

    let payload: jwt.JwtPayload;
    try {
      const verified = this.tokenService.verifyAccess(token);
      const decoded = jwt.decode(token);

      if (decoded === null || typeof decoded !== "object") {
        return null;
      }

      payload = { ...verified, ...decoded };
    } catch {
      return null;
    }

    const jti = typeof payload.jti === "string" ? payload.jti : undefined;
    if (jti === undefined) {
      return null;
    }

    if (this.blacklist.isBlacklisted(jti)) {
      return null;
    }

    const sub = payload.sub;
    if (typeof sub !== "string") {
      return null;
    }

    return {
      userId: sub,
      role: (payload.role ?? "user") as "admin" | "user",
      jti,
    };
  }

  /**
   * Verifies the refresh token and returns the decoded JWT payload (including
   * `jti`, `exp`, `sub`, `role`), or `null` if the token is invalid.
   */
  private verifyRefreshPayload(token: string): jwt.JwtPayload | null {
    try {
      this.tokenService.verifyRefresh(token);
    } catch {
      return null;
    }

    const decoded = jwt.decode(token);
    if (decoded === null || typeof decoded !== "object") {
      return null;
    }

    return decoded;
  }

  private decodeExpiry(request: IncomingMessage): number | undefined {
    const header = request.headers.authorization;

    if (header === undefined) {
      return undefined;
    }

    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || token === undefined || token.length === 0) {
      return undefined;
    }

    const decoded = jwt.decode(token);

    if (decoded === null || typeof decoded !== "object") {
      return undefined;
    }

    return typeof decoded.exp === "number" ? decoded.exp : undefined;
  }
}

function isLoginInput(input: unknown): input is LoginInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.email === "string" &&
    typeof candidate.password === "string" &&
    candidate.email.trim().length > 0 &&
    candidate.password.trim().length > 0
  );
}

function isRefreshInput(input: unknown): input is RefreshInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.refreshToken === "string" &&
    candidate.refreshToken.trim().length > 0
  );
}
