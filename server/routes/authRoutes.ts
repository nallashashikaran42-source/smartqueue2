import { Router } from 'express';
import crypto from 'node:crypto';
import { dbStore } from '../db/store.ts';
import {
  hashPassword,
  normalizeRole,
  optionalAuth,
  requireAuth,
  signAuthToken,
  signRefreshToken,
  toPublicUser,
  verifyPassword,
  verifyRefreshToken,
} from '../middleware/authMiddleware.ts';
import type { UserRecord } from '../models/types.ts';

export const authRoutes = Router();

function issueSessionTokens(user: UserRecord): { token: string; refreshToken: string } {
  const db = dbStore.getState();
  const token = signAuthToken(user);
  const jti = `rt-${crypto.randomUUID()}`;
  const { refreshToken, expiresAt } = signRefreshToken(user.id, jti);
  db.refreshSessions.push({
    tokenId: jti,
    userId: user.id,
    expiresAt,
    revoked: false,
    createdAt: new Date().toISOString(),
  });
  if (db.refreshSessions.length > 200) {
    db.refreshSessions = db.refreshSessions.slice(-200);
  }
  dbStore.save();
  return { token, refreshToken };
}

authRoutes.post('/register', (req, res) => {
  const { name, email, password, phone, role } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
    role?: string;
  };

  if (role && normalizeRole(role) !== 'citizen') {
    res.status(403).json({
      error: 'Self-registration is restricted to Citizen accounts. Operator and Admin accounts must be provisioned by an Administrator.',
    });
    return;
  }

  if (!name || !name.trim() || !email || !email.trim() || !password || password.length < 6) {
    res.status(400).json({
      error: 'Name, valid email, and password (min 6 characters) are required.',
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = dbStore.getState();

  const existing = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const newUser: UserRecord = {
    id: `usr-${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    email: normalizedEmail,
    phone: phone?.trim() || undefined,
    role: 'citizen',
    accountStatus: 'active',
    trustScore: 95,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  const { token, refreshToken } = issueSessionTokens(newUser);

  res.status(201).json({
    token,
    refreshToken,
    user: toPublicUser(newUser),
  });
});

authRoutes.post('/login', (req, res) => {
  const { email, identifier, password, expectedRole } = req.body as {
    email?: string;
    identifier?: string;
    password?: string;
    expectedRole?: string;
  };

  const loginInput = (identifier || email || '').trim().toLowerCase();
  if (!loginInput || !password) {
    res.status(400).json({ error: 'Email or assigned ID and password are required.' });
    return;
  }

  const db = dbStore.getState();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === loginInput || u.id.toLowerCase() === loginInput
  );

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid credentials. Please verify your email and password.' });
    return;
  }

  if (user.accountStatus === 'inactive') {
    res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });
    return;
  }

  const actualRole = normalizeRole(user.role);
  if (expectedRole) {
    const requestedRole = normalizeRole(expectedRole);
    if (requestedRole !== actualRole) {
      const roleLabels = {
        citizen: 'Citizen / Patient',
        operator: 'Token Operator',
        admin: 'Administrator',
      } as const;
      res.status(403).json({
        error: `This account is registered under the ${roleLabels[actualRole]} role. Please sign in through the ${roleLabels[actualRole]} tab.`,
        suggestedRole: actualRole,
      });
      return;
    }
  }

  const { token, refreshToken } = issueSessionTokens(user);
  res.json({
    token,
    refreshToken,
    user: toPublicUser(user),
  });
});

authRoutes.post('/forgot-password', (req, res) => {
  const { email, role } = req.body as { email?: string; role?: string };
  if (!email || !email.trim()) {
    res.status(400).json({ error: 'Please enter your registered email address.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const db = dbStore.getState();
  const matched = db.users.find(
    (u) => u.email.toLowerCase() === normalizedEmail && u.accountStatus !== 'inactive'
  );

  if (matched) {
    db.auditLogs.unshift({
      id: `log-${crypto.randomUUID().slice(0, 8)}`,
      actorId: matched.id,
      actorName: matched.name,
      actorRole: normalizeRole(matched.role),
      action: 'PASSWORD_RESET_REQUESTED',
      targetType: 'user',
      targetId: matched.id,
      facilityId: matched.assignedFacilityId,
      details: `Password assistance requested via ${role || 'login'} portal for ${matched.email}.`,
      timestamp: new Date().toISOString(),
    });
    dbStore.save();
  }

  const requestedRole = role ? normalizeRole(role) : 'citizen';
  const message =
    requestedRole === 'citizen'
      ? 'If a Citizen account matches this email, recovery instructions have been logged for your account.'
      : 'For security, Token Operator and Administrator password resets must be verified by an authorized System Administrator.';

  res.json({ ok: true, message });
});

authRoutes.post('/refresh', (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken is required.' });
    return;
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
    return;
  }

  const db = dbStore.getState();
  const session = db.refreshSessions.find((s) => s.tokenId === payload.jti);
  if (!session || session.revoked || session.userId !== payload.sub) {
    res.status(401).json({ error: 'Refresh session has been revoked.' });
    return;
  }

  const user = db.users.find((u) => u.id === payload.sub);
  if (!user || user.accountStatus === 'inactive') {
    res.status(403).json({ error: 'User account is inactive or missing.' });
    return;
  }

  session.revoked = true;
  const rotated = issueSessionTokens(user);
  res.json({
    token: rotated.token,
    refreshToken: rotated.refreshToken,
    user: toPublicUser(user),
  });
});

authRoutes.get('/me', requireAuth, (req, res) => {
  const db = dbStore.getState();
  const user = db.users.find((u) => u.id === req.authUser?.sub);
  if (!user || user.accountStatus === 'inactive') {
    res.status(404).json({ error: 'Authenticated user record not found or inactive.' });
    return;
  }
  res.json({ user: toPublicUser(user) });
});

authRoutes.patch('/profile', requireAuth, (req, res) => {
  const body = req.body as {
    name?: string;
    phone?: string;
    profilePhoto?: string;
    role?: string;
    accountStatus?: string;
  };

  if (body.role !== undefined || body.accountStatus !== undefined) {
    res.status(403).json({
      error: 'Users cannot modify their own role or account status.',
    });
    return;
  }

  if (!body.name || !body.name.trim()) {
    res.status(400).json({ error: 'Name cannot be empty.' });
    return;
  }

  const db = dbStore.getState();
  const user = db.users.find((u) => u.id === req.authUser?.sub);
  if (!user) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  user.name = body.name.trim();
  user.phone = body.phone?.trim() || undefined;
  if (typeof body.profilePhoto === 'string') {
    user.profilePhoto = body.profilePhoto.trim() || undefined;
  }

  db.notifications.unshift({
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    facilityId: user.assignedFacilityId || 'vja-hospital',
    userId: user.id,
    title: 'Profile Updated',
    message: `Your SmartQueue profile details were saved for ${user.name}.`,
    category: 'account',
    channel: 'in-app',
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  dbStore.save();
  res.json({ user: toPublicUser(user) });
});

authRoutes.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({
      error: 'Current password and a new password (min 6 characters) are required.',
    });
    return;
  }

  const db = dbStore.getState();
  const user = db.users.find((u) => u.id === req.authUser?.sub);
  if (!user) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  if (!verifyPassword(currentPassword, user.passwordHash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  user.passwordHash = hashPassword(newPassword);

  db.notifications.unshift({
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    facilityId: user.assignedFacilityId || 'vja-hospital',
    userId: user.id,
    title: 'Password Changed',
    message: 'Your SmartQueue account password was updated successfully.',
    category: 'account',
    channel: 'in-app',
    isRead: false,
    createdAt: new Date().toISOString(),
  });

  dbStore.save();
  res.json({ ok: true, message: 'Password updated successfully.' });
});

authRoutes.post('/logout', optionalAuth, (req, res) => {
  const { refreshToken } = (req.body || {}) as { refreshToken?: string };
  const db = dbStore.getState();
  let changed = false;

  if (refreshToken) {
    const payload = verifyRefreshToken(refreshToken);
    if (payload) {
      const session = db.refreshSessions.find((s) => s.tokenId === payload.jti);
      if (session) {
        session.revoked = true;
        changed = true;
      }
    }
  }
  if (req.authUser) {
    for (const s of db.refreshSessions) {
      if (s.userId === req.authUser.sub && !s.revoked) {
        s.revoked = true;
        changed = true;
      }
    }
  }
  if (changed) dbStore.save();
  res.json({ ok: true });
});
