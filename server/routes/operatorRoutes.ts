import { Router } from 'express';
import { dbStore } from '../db/store.ts';
import { requireAuth, requireRole } from '../middleware/authMiddleware.ts';
import type { CounterStatus } from '../models/types.ts';
import {
  broadcastFacilitySnapshot,
  callNextAtCounter,
  getFacilitySnapshot,
  recordAuditLog,
  transitionTokenAtCounter,
} from '../services/queueEngine.ts';
import { wsHub } from '../socket/wsHub.ts';

export const operatorRoutes = Router();

operatorRoutes.use(requireAuth, requireRole('operator', 'admin'));

function resolveOperatorScope(userId: string) {
  const db = dbStore.getState();
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;

  const assignedCounter =
    db.counters.find((c) => c.id === user.assignedCounterId) ||
    db.counters.find((c) => c.assignedOperatorId === user.id) ||
    db.counters.find((c) => c.facilityId === (user.assignedFacilityId || 'vja-hospital')) ||
    db.counters[0];

  const facilityId =
    user.assignedFacilityId || assignedCounter?.facilityId || db.facilities[0]?.id;
  const counterId = assignedCounter?.id;

  return { user, facilityId, counterId, assignedCounter };
}

function assertCounterAccess(
  userId: string,
  role: string,
  facilityId: string,
  counterId: string
): { ok: true } | { ok: false; error: string } {
  if (role === 'admin') return { ok: true };
  const db = dbStore.getState();
  const user = db.users.find((u) => u.id === userId);
  const counter = db.counters.find((c) => c.id === counterId && c.facilityId === facilityId);
  if (!counter) {
    return { ok: false, error: 'Counter not found in facility.' };
  }
  const hasExplicitAssignment = Boolean(user?.assignedCounterId);
  if (
    hasExplicitAssignment &&
    user?.assignedCounterId !== counter.id &&
    counter.assignedOperatorId !== user?.id
  ) {
    return {
      ok: false,
      error: 'Forbidden. You can only operate your assigned service counter.',
    };
  }
  if (user?.assignedFacilityId && user.assignedFacilityId !== facilityId) {
    return {
      ok: false,
      error: 'Forbidden. You do not have access to this service center.',
    };
  }
  return { ok: true };
}

// Get operator-scoped workspace (assigned center, dept, counter, live queue, history, daily metrics)
operatorRoutes.get('/workspace', (req, res) => {
  const scope = resolveOperatorScope(req.authUser!.sub);
  if (!scope || !scope.facilityId) {
    res.status(404).json({ error: 'Operator workspace assignment not found.' });
    return;
  }

  const db = dbStore.getState();
  const facility = db.facilities.find((f) => f.id === scope.facilityId);
  const snapshot = getFacilitySnapshot(scope.facilityId);
  if (!facility || !snapshot) {
    res.status(404).json({ error: 'Assigned service center not found.' });
    return;
  }

  const assignedCounter =
    snapshot.counters.find((c) => c.id === scope.counterId) || snapshot.counters[0] || null;
  const assignedQueue = assignedCounter
    ? snapshot.queues.find((q) => q.id === assignedCounter.queueId) || null
    : null;
  const assignedDepartment =
    snapshot.departments.find(
      (d) =>
        d.id === (scope.user.assignedDepartmentId || assignedCounter?.departmentId || assignedQueue?.departmentId)
    ) || snapshot.departments[0] || null;

  // Privacy-safe minimal patient view for operator's assigned queue
  const queueTokens = snapshot.roster
    .filter((t) => !assignedQueue || t.queueId === assignedQueue.id)
    .map((t) => ({
      tokenId: t.tokenId,
      citizenLabel: t.citizenName, // Display name only, no email/phone PII
      queueId: t.queueId,
      queueName: t.queueName,
      channel: t.channel,
      priority: t.priority,
      status: t.status,
      joinedAt: t.joinedAt,
      calledAt: t.calledAt,
      servingStartedAt: t.servingStartedAt,
      etaMinutes: t.etaMinutes,
      waitMinsSoFar: Math.max(0, Math.round((Date.now() - t.createdAtMs) / 60000)),
      recallCount: t.recallCount || 0,
      createdAtMs: t.createdAtMs,
    }));

  const allFacilityTokens = db.tokens.filter(
    (t) =>
      t.facilityId === scope.facilityId &&
      (!assignedQueue || t.queueId === assignedQueue.id)
  );

  const history = allFacilityTokens
    .filter((t) => ['Completed', 'Skipped', 'NoShow', 'Cancelled'].includes(t.status))
    .slice()
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .slice(0, 50)
    .map((t) => ({
      tokenId: t.tokenId,
      citizenLabel: t.citizenName,
      queueName: t.queueName,
      channel: t.channel,
      status: t.status,
      joinedAt: t.joinedAt,
      calledAt: t.calledAt,
      completedAt: t.completedAt,
      waitMins: Math.max(1, Math.round((Date.now() - t.createdAtMs) / 60000)),
    }));

  const waitingTokensCount = queueTokens.filter((t) =>
    ['Waiting', 'Called', 'Grace'].includes(t.status)
  ).length;
  const completedCount = allFacilityTokens.filter((t) => t.status === 'Completed').length;
  const skippedCount = allFacilityTokens.filter(
    (t) => t.status === 'Skipped' || t.status === 'NoShow'
  ).length;

  res.json({
    operator: {
      id: scope.user.id,
      name: scope.user.name,
      shift: scope.user.shift || 'Day Shift',
      todayDate: new Date().toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    },
    facility,
    department: assignedDepartment,
    counter: assignedCounter,
    queue: assignedQueue,
    liveQueue: queueTokens,
    history,
    metrics: {
      totalTokensToday: allFacilityTokens.length,
      waitingTokens: waitingTokensCount,
      completedTokens: completedCount,
      skippedTokens: skippedCount,
      avgWaitMins: assignedQueue?.predictedWaitMins ?? snapshot.summary.avgWaitMins,
    },
  });
});

// Call next waiting token at assigned counter
operatorRoutes.post('/counters/:counterId/call-next', (req, res) => {
  const { counterId } = req.params;
  const db = dbStore.getState();
  const counter = db.counters.find((c) => c.id === counterId);
  if (!counter) {
    res.status(404).json({ error: 'Counter not found.' });
    return;
  }

  const access = assertCounterAccess(
    req.authUser!.sub,
    req.authUser!.role,
    counter.facilityId,
    counterId
  );
  if (!access.ok) {
    res.status(403).json({ error: access.error });
    return;
  }

  const actorUser = db.users.find((u) => u.id === req.authUser!.sub);
  try {
    const result = callNextAtCounter(counter.facilityId, counterId, {
      id: req.authUser!.sub,
      name: actorUser?.name || 'Operator',
      role: req.authUser!.role,
    });
    broadcastFacilitySnapshot(counter.facilityId, 'token:called', {
      calledTokenId: result.calledTokenId,
      queueId: result.queueId,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Unable to call next token.',
    });
  }
});

// Transition token status: recall, serve, complete, skip, no-show
operatorRoutes.post('/counters/:counterId/tokens/:tokenId/:action', (req, res) => {
  const { counterId, tokenId, action } = req.params;
  if (!['recall', 'serve', 'complete', 'skip', 'no-show'].includes(action)) {
    res.status(400).json({ error: `Unsupported token action '${action}'.` });
    return;
  }

  const db = dbStore.getState();
  const counter = db.counters.find((c) => c.id === counterId);
  if (!counter) {
    res.status(404).json({ error: 'Counter not found.' });
    return;
  }

  const access = assertCounterAccess(
    req.authUser!.sub,
    req.authUser!.role,
    counter.facilityId,
    counterId
  );
  if (!access.ok) {
    res.status(403).json({ error: access.error });
    return;
  }

  const actorUser = db.users.find((u) => u.id === req.authUser!.sub);
  try {
    const result = transitionTokenAtCounter({
      facilityId: counter.facilityId,
      counterId,
      tokenId,
      action: action as 'recall' | 'serve' | 'complete' | 'skip' | 'no-show',
      actor: {
        id: req.authUser!.sub,
        name: actorUser?.name || 'Operator',
        role: req.authUser!.role,
      },
    });
    broadcastFacilitySnapshot(counter.facilityId, `token:${action}`, {
      tokenId,
      token: result.token,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Invalid token state transition.',
    });
  }
});

// Open / Close / Pause / Resume assigned counter
operatorRoutes.patch('/counters/:counterId/status', (req, res) => {
  const { counterId } = req.params;
  const { status } = req.body as { status?: CounterStatus };
  if (!status || !['Serving', 'Busy', 'Paused', 'Closed'].includes(status)) {
    res.status(400).json({ error: 'Valid status (Serving, Busy, Paused, Closed) is required.' });
    return;
  }

  const db = dbStore.getState();
  const counter = db.counters.find((c) => c.id === counterId);
  if (!counter) {
    res.status(404).json({ error: 'Counter not found.' });
    return;
  }

  const access = assertCounterAccess(
    req.authUser!.sub,
    req.authUser!.role,
    counter.facilityId,
    counterId
  );
  if (!access.ok) {
    res.status(403).json({ error: access.error });
    return;
  }

  const prev = counter.status;
  counter.status = status;
  const actorUser = db.users.find((u) => u.id === req.authUser!.sub);
  recordAuditLog({
    actor: {
      id: req.authUser!.sub,
      name: actorUser?.name || 'Operator',
      role: req.authUser!.role,
    },
    action: 'COUNTER_STATUS_CHANGED',
    targetType: 'counter',
    targetId: counter.id,
    facilityId: counter.facilityId,
    details: `${counter.label} changed status from ${prev} to ${status}.`,
  });

  dbStore.save();
  broadcastFacilitySnapshot(counter.facilityId, 'counter:updated', { counter });
  res.json({ counter });
});

// Pause or resume queue processing for assigned service
operatorRoutes.patch('/queues/:queueId/pause', (req, res) => {
  const { queueId } = req.params;
  const { isPaused } = req.body as { isPaused?: boolean };
  const db = dbStore.getState();
  const queue = db.queues.find((q) => q.id === queueId);
  if (!queue) {
    res.status(404).json({ error: 'Queue not found.' });
    return;
  }

  if (req.authUser!.role === 'operator') {
    const user = db.users.find((u) => u.id === req.authUser!.sub);
    const assignedCounter = db.counters.find((c) => c.id === user?.assignedCounterId);
    if (assignedCounter && assignedCounter.queueId !== queue.id) {
      res.status(403).json({ error: 'Forbidden. You can only pause your assigned service queue.' });
      return;
    }
  }

  queue.isPaused = Boolean(isPaused);
  const actorUser = db.users.find((u) => u.id === req.authUser!.sub);
  recordAuditLog({
    actor: {
      id: req.authUser!.sub,
      name: actorUser?.name || 'Operator',
      role: req.authUser!.role,
    },
    action: queue.isPaused ? 'QUEUE_PAUSED' : 'QUEUE_RESUMED',
    targetType: 'queue',
    targetId: queue.id,
    facilityId: queue.facilityId,
    details: `${queue.name} was ${queue.isPaused ? 'paused' : 'resumed'} by operator.`,
  });

  dbStore.save();
  wsHub.broadcast(queue.facilityId, 'org:queue-updated', { queue });
  broadcastFacilitySnapshot(queue.facilityId, 'org:queue-updated', { queue });
  res.json({ queue });
});
