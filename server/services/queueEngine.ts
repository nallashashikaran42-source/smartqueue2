import crypto from 'node:crypto';
import { dbStore } from '../db/store.ts';
import type {
  AuditLogRecord,
  CounterRecord,
  DepartmentRecord,
  EntryChannel,
  NotificationCategory,
  NotificationRecord,
  ServiceQueueRecord,
  SwapRequestRecord,
  TokenRecord,
  UserRole,
} from '../models/types.ts';
import { wsHub } from '../socket/wsHub.ts';

export interface ActorInfo {
  id: string;
  name: string;
  role: UserRole;
}

export function recordAuditLog(params: {
  actor: ActorInfo;
  action: string;
  targetType: AuditLogRecord['targetType'];
  targetId: string;
  facilityId?: string;
  details: string;
}): AuditLogRecord {
  const db = dbStore.getState();
  const entry: AuditLogRecord = {
    id: `audit-${crypto.randomUUID().slice(0, 8)}`,
    actorId: params.actor.id,
    actorName: params.actor.name,
    actorRole: params.actor.role,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    facilityId: params.facilityId,
    details: params.details,
    timestamp: new Date().toISOString(),
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 250) {
    db.auditLogs = db.auditLogs.slice(0, 250);
  }
  return entry;
}

export function pushNotification(params: {
  facilityId: string;
  userId?: string;
  tokenId?: string;
  title: string;
  message: string;
  category: NotificationCategory;
}): NotificationRecord {
  const db = dbStore.getState();
  const notif: NotificationRecord = {
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    facilityId: params.facilityId,
    userId: params.userId,
    tokenId: params.tokenId,
    title: params.title,
    message: params.message,
    category: params.category,
    channel: 'in-app',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  db.notifications.unshift(notif);
  if (db.notifications.length > 150) {
    db.notifications = db.notifications.slice(0, 150);
  }
  wsHub.broadcast(params.facilityId, 'notification:new', { notification: notif });
  wsHub.broadcast('all', 'notification:new', { notification: notif });
  return notif;
}

export interface HydratedQueue extends ServiceQueueRecord {
  departmentName: string;
  waitingCount: number;
  activeCounters: number;
  predictedWaitMins: number;
}

export interface HydratedCounter extends CounterRecord {
  queueName: string;
  departmentName: string;
}

export interface HydratedToken extends TokenRecord {
  departmentName: string;
  counterLabel?: string;
  aheadCount: number;
  etaMinutes: number;
}

export interface FacilitySnapshot {
  facilityId: string;
  departments: DepartmentRecord[];
  queues: HydratedQueue[];
  counters: HydratedCounter[];
  roster: HydratedToken[];
  openSwaps: SwapRequestRecord[];
  surgeAlert: {
    active: boolean;
    queueId: string;
    queueName: string;
    waitingCount: number;
    standbyCounterId: string;
    standbyStaffName: string;
  } | null;
  summary: {
    totalWaiting: number;
    activeCountersCount: number;
    totalCountersCount: number;
    avgWaitMins: number;
    onTimeReturnRate: number;
  };
}

export function computeQueueWaitMins(
  queue: ServiceQueueRecord,
  aheadOrWaiting: number,
  activeCounters: number
): number {
  if (aheadOrWaiting <= 0) return 0;
  const divisor = Math.max(1, activeCounters);
  return Math.max(2, Math.round((aheadOrWaiting * queue.avgServiceMinutes) / divisor));
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getFacilitySnapshot(facilityId: string): FacilitySnapshot | null {
  const db = dbStore.getState();
  const facility = db.facilities.find((f) => f.id === facilityId);
  if (!facility) return null;

  const facilityDepartments = db.departments.filter((d) => d.facilityId === facilityId);
  const facilityQueues = db.queues.filter((q) => q.facilityId === facilityId);
  const facilityCounters = db.counters.filter((c) => c.facilityId === facilityId);
  const facilityTokens = db.tokens.filter(
    (t) =>
      t.facilityId === facilityId &&
      ['Waiting', 'Called', 'Serving', 'Grace'].includes(t.status)
  );

  const hydratedQueues: HydratedQueue[] = facilityQueues.map((q) => {
    const dept = facilityDepartments.find((d) => d.id === q.departmentId);
    const activeCounters = facilityCounters.filter(
      (c) => c.queueId === q.id && (c.status === 'Serving' || c.status === 'Busy')
    ).length;
    const waitingTokens = facilityTokens.filter(
      (t) =>
        t.queueId === q.id &&
        (t.status === 'Waiting' || t.status === 'Called' || t.status === 'Grace')
    );
    const spreadCount = Math.max(0, q.nextIssueNumber - q.servingNumber - 1);
    const waitingCount = Math.max(waitingTokens.length, spreadCount);
    const predictedWaitMins = computeQueueWaitMins(q, waitingCount, activeCounters);

    return {
      ...q,
      departmentName: dept?.name || 'General Services',
      waitingCount,
      activeCounters,
      predictedWaitMins,
    };
  });

  const hydratedCounters: HydratedCounter[] = facilityCounters.map((c) => {
    const q = facilityQueues.find((fq) => fq.id === c.queueId);
    const dept = facilityDepartments.find((d) => d.id === (c.departmentId || q?.departmentId));
    return {
      ...c,
      queueName: q?.name || 'General Queue',
      departmentName: dept?.name || 'General Services',
    };
  });

  const hydratedRoster: HydratedToken[] = facilityTokens
    .slice()
    .sort((a, b) => a.numberValue - b.numberValue)
    .map((t) => {
      const q = hydratedQueues.find((hq) => hq.id === t.queueId);
      const dept = facilityDepartments.find((d) => d.id === (t.departmentId || q?.departmentId));
      const cnt = facilityCounters.find(
        (c) => c.id === t.counterId || (c.queueId === t.queueId && c.status !== 'Closed')
      );
      const aheadCount = q ? Math.max(0, t.numberValue - q.servingNumber) : 0;
      const etaMinutes =
        t.status === 'Serving' || t.status === 'Called' || !q
          ? 0
          : computeQueueWaitMins(q, aheadCount, q.activeCounters);
      return {
        ...t,
        departmentName: dept?.name || 'General Services',
        counterLabel: cnt?.label,
        aheadCount,
        etaMinutes,
      };
    });

  const openSwaps = db.swaps.filter(
    (s) => s.facilityId === facilityId && s.status === 'open'
  );

  const standbyCounter = facilityCounters.find((c) => c.status === 'Closed');
  const overloadedQueue = hydratedQueues.find((q) => q.waitingCount >= 6);
  const surgeAlert =
    standbyCounter && overloadedQueue
      ? {
          active: true,
          queueId: overloadedQueue.id,
          queueName: overloadedQueue.name,
          waitingCount: overloadedQueue.waitingCount,
          standbyCounterId: standbyCounter.id,
          standbyStaffName: standbyCounter.staffName,
        }
      : null;

  const totalWaiting = hydratedQueues.reduce((sum, q) => sum + q.waitingCount, 0);
  const activeCountersCount = facilityCounters.filter(
    (c) => c.status === 'Serving' || c.status === 'Busy'
  ).length;
  const avgWaitMins =
    hydratedQueues.length > 0
      ? Math.round(
          hydratedQueues.reduce((sum, q) => sum + q.predictedWaitMins, 0) /
            hydratedQueues.length
        )
      : 0;

  return {
    facilityId,
    departments: facilityDepartments,
    queues: hydratedQueues,
    counters: hydratedCounters,
    roster: hydratedRoster,
    openSwaps,
    surgeAlert,
    summary: {
      totalWaiting,
      activeCountersCount,
      totalCountersCount: facilityCounters.length,
      avgWaitMins,
      onTimeReturnRate: 94,
    },
  };
}

export function broadcastFacilitySnapshot(facilityId: string, event: string, extra?: Record<string, unknown>) {
  const snapshot = getFacilitySnapshot(facilityId);
  if (!snapshot) return;
  wsHub.broadcast(facilityId, event, { ...extra, snapshot });
  wsHub.broadcast('all', event, { facilityId, ...extra, snapshot });
}

export function issueToken(params: {
  facilityId: string;
  queueId: string;
  channel: EntryChannel;
  citizenName?: string;
  userId?: string;
}): { token: HydratedToken; snapshot: FacilitySnapshot } {
  const db = dbStore.getState();
  const facility = db.facilities.find((f) => f.id === params.facilityId);
  if (!facility || !facility.isActive) {
    throw new Error('Selected service center is currently unavailable.');
  }

  const queue = db.queues.find(
    (q) => q.id === params.queueId && q.facilityId === params.facilityId
  );
  if (!queue || !queue.isActive) {
    throw new Error(`Service queue '${params.queueId}' not found or inactive.`);
  }
  if (queue.isPaused) {
    throw new Error(`Service '${queue.name}' is temporarily paused by counter staff.`);
  }

  // Prevent duplicate active tokens beyond configured maximum
  if (params.userId) {
    const activeForUser = db.tokens.filter(
      (t) =>
        t.userId === params.userId &&
        ['Waiting', 'Called', 'Serving', 'Grace'].includes(t.status)
    );
    const maxAllowed = Math.max(1, db.settings.maxActiveTokensPerCitizen || 1);
    if (activeForUser.length >= maxAllowed) {
      throw new Error(
        `You already have an active token (${activeForUser[0].tokenId}). Cancel or complete it before booking another.`
      );
    }
  }

  const numberValue = queue.nextIssueNumber;
  queue.nextIssueNumber += 1;

  const assignedCounter =
    db.counters.find(
      (c) => c.facilityId === params.facilityId && c.queueId === queue.id && c.status !== 'Closed'
    ) || db.counters.find((c) => c.facilityId === params.facilityId && c.queueId === queue.id);

  const tokenId = `${queue.prefix}-${numberValue}`;
  const joinedAt = formatNowTime();

  const token: TokenRecord = {
    tokenId,
    facilityId: params.facilityId,
    departmentId: queue.departmentId,
    queueId: queue.id,
    queueName: queue.name,
    counterId: assignedCounter?.id,
    assignedOperatorId: assignedCounter?.assignedOperatorId,
    numberValue,
    citizenName: params.citizenName?.trim() || 'Citizen Guest',
    userId: params.userId,
    channel: params.channel,
    priority: queue.priority,
    status: 'Waiting',
    joinedAt,
    createdAtMs: Date.now(),
  };

  db.tokens.push(token);
  db.metrics.processedDelta += 1;
  pushNotification({
    facilityId: params.facilityId,
    userId: params.userId,
    tokenId: token.tokenId,
    title: `Token ${token.tokenId} Confirmed`,
    message: `Reserved in ${queue.name} (${queue.location}) at ${facility.name} via ${params.channel}.`,
    category: 'token',
  });
  dbStore.save();

  const snapshot = getFacilitySnapshot(params.facilityId)!;
  const hydrated = snapshot.roster.find((r) => r.tokenId === token.tokenId)!;
  return { token: hydrated, snapshot };
}

export function cancelToken(
  facilityId: string,
  tokenId: string,
  actor?: { id: string; role: UserRole; name: string }
): FacilitySnapshot {
  const db = dbStore.getState();
  const token = db.tokens.find(
    (t) => t.facilityId === facilityId && t.tokenId === tokenId
  );
  if (!token) {
    throw new Error(`Token '${tokenId}' not found.`);
  }
  if (actor && actor.role === 'citizen' && token.userId && token.userId !== actor.id) {
    throw new Error('You can only cancel your own queue token.');
  }
  if (!['Waiting', 'Called', 'Grace'].includes(token.status)) {
    throw new Error(`Cannot cancel token '${tokenId}' in status '${token.status}'.`);
  }

  token.status = 'Cancelled';
  token.cancelledAt = formatNowTime();

  pushNotification({
    facilityId,
    userId: token.userId,
    tokenId: token.tokenId,
    title: `Token ${token.tokenId} Cancelled`,
    message: `Your slot in ${token.queueName} was cancelled and queue capacity has been released.`,
    category: 'token',
  });

  if (actor && actor.role !== 'citizen') {
    recordAuditLog({
      actor,
      action: 'TOKEN_CANCELLED',
      targetType: 'token',
      targetId: tokenId,
      facilityId,
      details: `Cancelled token ${tokenId} in ${token.queueName}.`,
    });
  }

  dbStore.save();
  return getFacilitySnapshot(facilityId)!;
}

export function callNextAtCounter(
  facilityId: string,
  counterId: string,
  actor?: ActorInfo
): {
  calledTokenId: string;
  queueId: string;
  snapshot: FacilitySnapshot;
} {
  const db = dbStore.getState();
  const counter = db.counters.find(
    (c) => c.facilityId === facilityId && c.id === counterId
  );
  if (!counter) {
    throw new Error(`Counter '${counterId}' not found.`);
  }
  if (counter.status === 'Closed') {
    throw new Error(`Counter '${counter.label}' is closed.`);
  }
  if (counter.status === 'Paused') {
    throw new Error(`Counter '${counter.label}' is paused. Resume counter before calling next.`);
  }

  const queue = db.queues.find(
    (q) => q.facilityId === facilityId && q.id === counter.queueId
  );
  if (!queue) {
    throw new Error(`Assigned queue '${counter.queueId}' not found.`);
  }
  if (queue.isPaused) {
    throw new Error(`Queue '${queue.name}' is currently paused.`);
  }

  const nowTime = formatNowTime();

  // Complete any currently Serving/Called token assigned to this counter/queue so the counter stays clean
  for (const t of db.tokens) {
    if (
      t.facilityId === facilityId &&
      t.queueId === queue.id &&
      (t.status === 'Serving' || t.status === 'Called')
    ) {
      t.status = 'Completed';
      t.completedAt = nowTime;
    }
  }

  // Pick next waiting token in roster order if available, otherwise advance queue.servingNumber
  const waitingCandidates = db.tokens
    .filter(
      (t) =>
        t.facilityId === facilityId &&
        t.queueId === queue.id &&
        t.status === 'Waiting'
    )
    .sort((a, b) => a.numberValue - b.numberValue);

  let calledTokenId: string;
  let targetToken: TokenRecord | undefined;

  if (waitingCandidates.length > 0) {
    targetToken = waitingCandidates[0];
    queue.servingNumber = targetToken.numberValue;
    calledTokenId = targetToken.tokenId;
    targetToken.status = 'Called';
    targetToken.calledAt = nowTime;
    targetToken.counterId = counter.id;
    targetToken.assignedOperatorId = actor?.id || counter.assignedOperatorId;
  } else {
    queue.servingNumber += 1;
    calledTokenId = `${queue.prefix}-${queue.servingNumber}`;
  }

  counter.currentToken = calledTokenId;
  counter.status = 'Serving';
  db.metrics.processedDelta += 1;

  // Notify approaching tokens (1-2 positions ahead)
  const approaching = db.tokens.filter(
    (t) =>
      t.facilityId === facilityId &&
      t.queueId === queue.id &&
      t.status === 'Waiting' &&
      t.numberValue - queue.servingNumber > 0 &&
      t.numberValue - queue.servingNumber <= 2
  );
  for (const appTok of approaching) {
    const ahead = appTok.numberValue - queue.servingNumber;
    pushNotification({
      facilityId,
      userId: appTok.userId,
      tokenId: appTok.tokenId,
      title: `Turn Approaching · ${appTok.tokenId}`,
      message: `${ahead} ${ahead === 1 ? 'person' : 'people'} ahead of you at ${queue.location}. Please walk back toward ${counter.label}.`,
      category: 'turn',
    });
  }

  pushNotification({
    facilityId,
    userId: targetToken?.userId,
    tokenId: calledTokenId,
    title: `Token ${calledTokenId} Called`,
    message: `${counter.label} (${counter.staffName}) is calling token ${calledTokenId} at ${queue.location}.`,
    category: 'turn',
  });

  if (actor) {
    recordAuditLog({
      actor,
      action: 'TOKEN_CALLED',
      targetType: 'token',
      targetId: calledTokenId,
      facilityId,
      details: `Called ${calledTokenId} at ${counter.label} (${queue.name}).`,
    });
  }

  dbStore.save();

  return {
    calledTokenId,
    queueId: queue.id,
    snapshot: getFacilitySnapshot(facilityId)!,
  };
}

export function transitionTokenAtCounter(params: {
  facilityId: string;
  counterId: string;
  tokenId: string;
  action: 'recall' | 'serve' | 'complete' | 'skip' | 'no-show';
  actor: ActorInfo;
}): { token: TokenRecord; snapshot: FacilitySnapshot } {
  const db = dbStore.getState();
  const counter = db.counters.find(
    (c) => c.facilityId === params.facilityId && c.id === params.counterId
  );
  if (!counter) {
    throw new Error('Counter not found in this facility.');
  }

  const token = db.tokens.find(
    (t) => t.facilityId === params.facilityId && t.tokenId === params.tokenId
  );
  if (!token) {
    throw new Error(`Token '${params.tokenId}' not found.`);
  }

  const nowTime = formatNowTime();

  switch (params.action) {
    case 'recall': {
      if (!['Called', 'Grace', 'Serving'].includes(token.status)) {
        throw new Error(`Cannot recall token in status '${token.status}'.`);
      }
      token.recallCount = (token.recallCount || 0) + 1;
      token.calledAt = nowTime;
      pushNotification({
        facilityId: params.facilityId,
        userId: token.userId,
        tokenId: token.tokenId,
        title: `Recall Alert · ${token.tokenId}`,
        message: `Please proceed immediately to ${counter.label} (${token.queueName}).`,
        category: 'turn',
      });
      recordAuditLog({
        actor: params.actor,
        action: 'TOKEN_RECALLED',
        targetType: 'token',
        targetId: token.tokenId,
        facilityId: params.facilityId,
        details: `Recalled ${token.tokenId} at ${counter.label} (attempt #${token.recallCount}).`,
      });
      break;
    }

    case 'serve': {
      if (!['Waiting', 'Called', 'Grace'].includes(token.status)) {
        throw new Error(`Cannot start serving token in status '${token.status}'.`);
      }
      // Complete any other token currently Serving on this counter
      for (const other of db.tokens) {
        if (
          other.facilityId === params.facilityId &&
          other.counterId === counter.id &&
          other.tokenId !== token.tokenId &&
          other.status === 'Serving'
        ) {
          other.status = 'Completed';
          other.completedAt = nowTime;
        }
      }
      token.status = 'Serving';
      token.servingStartedAt = nowTime;
      token.counterId = counter.id;
      token.assignedOperatorId = params.actor.id;
      counter.currentToken = token.tokenId;
      counter.status = 'Serving';

      const q = db.queues.find((fq) => fq.id === token.queueId);
      if (q && token.numberValue > q.servingNumber) {
        q.servingNumber = token.numberValue;
      }

      pushNotification({
        facilityId: params.facilityId,
        userId: token.userId,
        tokenId: token.tokenId,
        title: `Service Started · ${token.tokenId}`,
        message: `Counter ${counter.label} is now serving your token ${token.tokenId}.`,
        category: 'turn',
      });
      recordAuditLog({
        actor: params.actor,
        action: 'TOKEN_SERVING_STARTED',
        targetType: 'token',
        targetId: token.tokenId,
        facilityId: params.facilityId,
        details: `Started serving ${token.tokenId} at ${counter.label}.`,
      });
      break;
    }

    case 'complete': {
      if (!['Called', 'Serving', 'Grace'].includes(token.status)) {
        throw new Error(`Cannot complete token in status '${token.status}'.`);
      }
      token.status = 'Completed';
      token.completedAt = nowTime;
      token.counterId = counter.id;
      token.assignedOperatorId = params.actor.id;
      if (counter.currentToken === token.tokenId) {
        counter.currentToken = '—';
      }
      db.metrics.processedDelta += 1;
      pushNotification({
        facilityId: params.facilityId,
        userId: token.userId,
        tokenId: token.tokenId,
        title: `Service Completed · ${token.tokenId}`,
        message: `Your visit for ${token.queueName} at ${counter.label} is complete.`,
        category: 'token',
      });
      recordAuditLog({
        actor: params.actor,
        action: 'TOKEN_COMPLETED',
        targetType: 'token',
        targetId: token.tokenId,
        facilityId: params.facilityId,
        details: `Completed service for ${token.tokenId} at ${counter.label}.`,
      });
      break;
    }

    case 'skip': {
      if (!['Waiting', 'Called', 'Grace'].includes(token.status)) {
        throw new Error(`Cannot skip token in status '${token.status}'.`);
      }
      token.status = 'Skipped';
      if (counter.currentToken === token.tokenId) {
        counter.currentToken = '—';
      }
      pushNotification({
        facilityId: params.facilityId,
        userId: token.userId,
        tokenId: token.tokenId,
        title: `Token ${token.tokenId} Skipped`,
        message: `Your token was skipped at ${counter.label}. Contact desk if you need assistance.`,
        category: 'grace',
      });
      recordAuditLog({
        actor: params.actor,
        action: 'TOKEN_SKIPPED',
        targetType: 'token',
        targetId: token.tokenId,
        facilityId: params.facilityId,
        details: `Skipped ${token.tokenId} at ${counter.label}.`,
      });
      break;
    }

    case 'no-show': {
      if (!['Waiting', 'Called', 'Grace'].includes(token.status)) {
        throw new Error(`Cannot mark no-show for token in status '${token.status}'.`);
      }
      token.status = 'NoShow';
      if (counter.currentToken === token.tokenId) {
        counter.currentToken = '—';
      }
      pushNotification({
        facilityId: params.facilityId,
        userId: token.userId,
        tokenId: token.tokenId,
        title: `Missed Turn · ${token.tokenId}`,
        message: `Token ${token.tokenId} was marked as No Show at ${counter.label}.`,
        category: 'grace',
      });
      recordAuditLog({
        actor: params.actor,
        action: 'TOKEN_NO_SHOW',
        targetType: 'token',
        targetId: token.tokenId,
        facilityId: params.facilityId,
        details: `Marked ${token.tokenId} as No Show at ${counter.label}.`,
      });
      break;
    }
  }

  dbStore.save();
  return {
    token,
    snapshot: getFacilitySnapshot(params.facilityId)!,
  };
}

export function createSwapRequest(params: {
  facilityId: string;
  tokenId: string;
  reason?: string;
}): { swap: SwapRequestRecord; snapshot: FacilitySnapshot } {
  const db = dbStore.getState();
  if (!db.settings.allowPeerSwaps) {
    throw new Error('Peer token swaps are currently disabled by system settings.');
  }
  const token = db.tokens.find(
    (t) => t.facilityId === params.facilityId && t.tokenId === params.tokenId
  );
  if (!token) {
    throw new Error(`Token '${params.tokenId}' not found.`);
  }

  const existingOpen = db.swaps.find(
    (s) =>
      s.facilityId === params.facilityId &&
      s.fromTokenId === token.tokenId &&
      s.status === 'open'
  );
  if (existingOpen) {
    return { swap: existingOpen, snapshot: getFacilitySnapshot(params.facilityId)! };
  }

  const swap: SwapRequestRecord = {
    id: `swap-${crypto.randomUUID().slice(0, 6)}`,
    facilityId: params.facilityId,
    queueId: token.queueId,
    fromTokenId: token.tokenId,
    fromCitizenName: token.citizenName,
    fromNumber: token.numberValue,
    reason: params.reason?.trim() || 'Willing to trade turns fairly',
    status: 'open',
    createdAt: new Date().toISOString(),
  };

  db.swaps.push(swap);
  dbStore.save();
  return { swap, snapshot: getFacilitySnapshot(params.facilityId)! };
}

export function acceptSwapRequest(params: {
  facilityId: string;
  swapId: string;
  targetTokenId: string;
  userId?: string;
}): {
  updatedTokenId: string;
  updatedNumber: number;
  trustScore: number;
  snapshot: FacilitySnapshot;
} {
  const db = dbStore.getState();
  const swap = db.swaps.find(
    (s) => s.facilityId === params.facilityId && s.id === params.swapId && s.status === 'open'
  );
  if (!swap) {
    throw new Error('Swap request is no longer available.');
  }

  const callerToken = db.tokens.find(
    (t) =>
      t.facilityId === params.facilityId &&
      t.tokenId === params.targetTokenId &&
      t.queueId === swap.queueId
  );
  if (!callerToken) {
    throw new Error('Your active token is not eligible for this queue swap.');
  }

  const peerToken = db.tokens.find(
    (t) => t.facilityId === params.facilityId && t.tokenId === swap.fromTokenId
  );

  const oldCallerNumber = callerToken.numberValue;
  const oldCallerId = callerToken.tokenId;
  const newCallerNumber = swap.fromNumber;
  const newCallerId = swap.fromTokenId;

  callerToken.numberValue = newCallerNumber;
  callerToken.tokenId = newCallerId;

  if (peerToken) {
    peerToken.numberValue = oldCallerNumber;
    peerToken.tokenId = oldCallerId;
  }

  swap.status = 'accepted';
  swap.acceptedByTokenId = oldCallerId;

  let trustScore = 118;
  if (params.userId) {
    const user = db.users.find((u) => u.id === params.userId);
    if (user) {
      user.trustScore += 20;
      trustScore = user.trustScore;
    }
  }

  pushNotification({
    facilityId: params.facilityId,
    userId: params.userId,
    tokenId: newCallerId,
    title: `Swap Confirmed · ${newCallerId}`,
    message: `Traded ${oldCallerId} for ${newCallerId}. +20 Civic Trust points credited.`,
    category: 'swap',
  });

  dbStore.save();
  return {
    updatedTokenId: newCallerId,
    updatedNumber: newCallerNumber,
    trustScore,
    snapshot: getFacilitySnapshot(params.facilityId)!,
  };
}

export function activateGraceSlot(
  facilityId: string,
  tokenId: string
): { graceExpiresAt: string; snapshot: FacilitySnapshot } {
  const db = dbStore.getState();
  const token = db.tokens.find(
    (t) => t.facilityId === facilityId && t.tokenId === tokenId
  );
  if (!token) {
    throw new Error(`Token '${tokenId}' not found.`);
  }
  const graceMinutes = Math.max(1, db.settings.gracePeriodMinutes || 5);
  const graceExpiresAt = new Date(Date.now() + graceMinutes * 60 * 1000).toISOString();
  token.status = 'Grace';
  token.graceExpiresAt = graceExpiresAt;
  pushNotification({
    facilityId,
    userId: token.userId,
    tokenId,
    title: `${graceMinutes}-Minute Grace Window Active`,
    message: `Token ${tokenId} was called. Check in within ${graceMinutes} minutes to keep your slot.`,
    category: 'grace',
  });
  dbStore.save();

  return {
    graceExpiresAt,
    snapshot: getFacilitySnapshot(facilityId)!,
  };
}

export function checkInGraceSlot(
  facilityId: string,
  tokenId: string,
  userId?: string
): { trustScore: number; snapshot: FacilitySnapshot } {
  const db = dbStore.getState();
  const token = db.tokens.find(
    (t) => t.facilityId === facilityId && t.tokenId === tokenId
  );
  if (!token) {
    throw new Error(`Token '${tokenId}' not found.`);
  }
  token.status = 'Serving';
  token.servingStartedAt = formatNowTime();
  token.graceExpiresAt = undefined;

  let trustScore = 103;
  if (userId) {
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      user.trustScore += 5;
      trustScore = user.trustScore;
    }
  }

  dbStore.save();
  return {
    trustScore,
    snapshot: getFacilitySnapshot(facilityId)!,
  };
}

export function getAnalyticsSummary(facilityId: string) {
  const db = dbStore.getState();
  const snapshot = getFacilitySnapshot(facilityId);
  if (!snapshot) return null;

  const hourlyTraffic = db.hourlyTraffic[facilityId] || [];
  const peakHours = hourlyTraffic.filter((h) => h.isPeak).map((h) => h.hour);
  const recommendedHours = hourlyTraffic
    .filter((h) => h.isRecommended)
    .map((h) => h.hour);

  const standbyOpened = snapshot.counters.some(
    (c) => c.id === 'c3' && c.status !== 'Closed' && c.status !== 'Paused'
  );

  return {
    facilityId,
    hourlyTraffic,
    peakHours,
    recommendedHours,
    recommendationText:
      recommendedHours.length > 0
        ? `Shift non-urgent follow-ups from ${peakHours.join('–') || 'peak hours'} to ${recommendedHours[0]}.`
        : 'Queue flow balanced across current hours.',
    queues: snapshot.queues,
    sdgImpact: {
      sdg9InfraCalls: db.metrics.baseInfraCalls + db.metrics.processedDelta,
      sdg11CorridorDensityReduction: standbyOpened ? '-46%' : '-41%',
      sdg12PaperSlipsSaved: db.metrics.basePaperSlipsSaved + db.metrics.processedDelta,
    },
  };
}
