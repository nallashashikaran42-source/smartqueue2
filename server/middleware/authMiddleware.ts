import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ENV } from '../config/env.ts';
import type { LegacyOrInputRole, PublicUser, UserRecord, UserRole } from '../models/types.ts';

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  orgId?: string;
  type: 'access';
  exp: number;
}

export interface RefreshTokenPayload {
  jti: string;
  sub: string;
  type: 'refresh';
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthTokenPayload;
    }
  }
}

type UserActiveChecker = (userId: string) => { active: boolean; role?: UserRole; orgId?: string };
let activeUserChecker: UserActiveChecker | null = null;

export function registerUserActiveChecker(fn: UserActiveChecker): void {
  activeUserChecker = fn;
}

export function normalizeRole(role?: LegacyOrInputRole | string | null): UserRole {
  const raw = (role || '').toString().trim().toLowerCase();
  if (raw === 'admin') return 'admin';
  if (raw === 'operator' || raw === 'staff') return 'operator';
  return 'citizen';
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padLength = (4 - (input.length % 4)) % 4;
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  return Buffer.from(normalized, 'base64').toString('utf8');
}

export function signAuthToken(user: Pick<UserRecord, 'id' | 'role' | 'organisationId'>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: AuthTokenPayload = {
    sub: user.id,
    role: normalizeRole(user.role),
    orgId: user.organisationId,
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + ENV.ACCESS_TOKEN_TTL_SECONDS,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', ENV.AUTH_SECRET).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${sig}`;
}

export function signRefreshToken(userId: string, tokenId: string): {
  refreshToken: string;
  expiresAt: number;
} {
  const expiresAt = Math.floor(Date.now() / 1000) + ENV.REFRESH_TOKEN_TTL_SECONDS;
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: RefreshTokenPayload = {
    jti: tokenId,
    sub: userId,
    type: 'refresh',
    exp: expiresAt,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', ENV.REFRESH_SECRET).update(`${header}.${body}`).digest()
  );
  return { refreshToken: `${header}.${body}.${sig}`, expiresAt };
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', ENV.AUTH_SECRET).update(`${header}.${body}`).digest()
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    payload.role = normalizeRole(payload.role);
    return payload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', ENV.REFRESH_SECRET).update(`${header}.${body}`).digest()
    );
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(base64UrlDecode(body)) as RefreshTokenPayload;
    if (
      payload.type !== 'refresh' ||
      !payload.sub ||
      !payload.jti ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function toPublicUser(user: UserRecord): PublicUser {
  const { passwordHash: _ignored, ...rest } = user;
  return {
    ...rest,
    role: normalizeRole(rest.role),
    accountStatus: rest.accountStatus || 'active',
  };
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token) {
    const payload = verifyAuthToken(token);
    if (payload) {
      if (activeUserChecker) {
        const status = activeUserChecker(payload.sub);
        if (status.active) {
          req.authUser = {
            ...payload,
            role: status.role ?? payload.role,
            orgId: status.orgId ?? payload.orgId,
          };
        }
      } else {
        req.authUser = payload;
      }
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return;
  }
  if (activeUserChecker) {
    const status = activeUserChecker(payload.sub);
    if (!status.active) {
      res.status(403).json({ error: 'Account is inactive or no longer exists.' });
      return;
    }
    payload.role = status.role ?? payload.role;
    payload.orgId = status.orgId ?? payload.orgId;
  }
  req.authUser = payload;
  next();
}

export function requireRole(...roles: LegacyOrInputRole[]) {
  const allowed = roles.map((r) => normalizeRole(r));
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const currentRole = normalizeRole(req.authUser.role);
    if (!allowed.includes(currentRole)) {
      res.status(403).json({
        error: `Forbidden. Requires role: ${allowed.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}
