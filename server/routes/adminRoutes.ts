import { Router } from 'express';
import crypto from 'node:crypto';
import { dbStore } from '../db/store.ts';
import {
  hashPassword,
  normalizeRole,
  requireAuth,
  requireRole,
  toPublicUser,
} from '../middleware/authMiddleware.ts';
import type {
  AccountStatus,
  CounterStatus,
  DepartmentRecord,
  FacilityRecord,
  QueuePriority,
  ServiceQueueRecord,
  UserRecord,
  UserRole,
} from '../models/types.ts';
import {
  broadcastFacilitySnapshot,
  getFacilitySnapshot,
  recordAuditLog,
} from '../services/queueEngine.ts';

export const adminRoutes = Router();

// Strictly protect ALL /api/admin/* endpoints for ADMIN role only
adminRoutes.use(requireAuth, requireRole('admin'));

function getActor(req: { authUser?: { sub: string; role: UserRole } }) {
  const db = dbStore.getState();
  const u = db.users.find((item) => item.id === req.authUser?.sub);
  return {
    id: req.authUser?.sub || 'admin',
    name: u?.name || 'System Admin',
    role: 'admin' as const,
  };
}

// 1. Admin Overview & Global KPIs
adminRoutes.get('/overview', (_req, res) => {
  const db = dbStore.getState();

  const totalCitizens = db.users.filter((u) => normalizeRole(u.role) === 'citizen').length;
  const totalOperators = db.users.filter((u) => normalizeRole(u.role) === 'operator').length;
  const totalFacilities = db.facilities.length;
  const totalDepartments = db.departments.length;
  const activeCounters = db.counters.filter(
    (c) => c.status === 'Serving' || c.status === 'Busy'
  ).length;

  const waitingTokens = db.tokens.filter((t) =>
    ['Waiting', 'Called', 'Serving', 'Grace'].includes(t.status)
  ).length;
  const completedTokens = db.tokens.filter((t) => t.status === 'Completed').length;
  const cancelledTokens = db.tokens.filter(
    (t) => t.status === 'Cancelled' || t.status === 'Skipped' || t.status === 'NoShow'
  ).length;

  const snapshots = db.facilities
    .map((f) => ({
      facility: f,
      snapshot: getFacilitySnapshot(f.id),
    }))
    .filter((item) => item.snapshot !== null);

  const avgWaitMins =
    snapshots.length > 0
      ? Math.round(
          snapshots.reduce((s, item) => s + (item.snapshot?.summary.avgWaitMins || 0), 0) /
            snapshots.length
        )
      : 0;

  const primaryTraffic = db.hourlyTraffic[db.facilities[0]?.id || 'vja-hospital'] || [];

  res.json({
    kpis: {
      totalCitizens,
      totalOperators,
      totalFacilities,
      totalDepartments,
      activeCounters,
      totalCounters: db.counters.length,
      totalTokensToday: db.tokens.length,
      waitingTokens,
      completedTokens,
      cancelledTokens,
      avgWaitMins,
    },
    centersSummary: snapshots.map((item) => ({
      facilityId: item.facility.id,
      name: item.facility.name,
      city: item.facility.city,
      isActive: item.facility.isActive,
      waiting: item.snapshot!.summary.totalWaiting,
      activeCounters: item.snapshot!.summary.activeCountersCount,
      totalCounters: item.snapshot!.summary.totalCountersCount,
      avgWaitMins: item.snapshot!.summary.avgWaitMins,
      hasSurge: Boolean(item.snapshot!.surgeAlert?.active),
    })),
    hourlyTraffic: primaryTraffic,
    recentAuditLogs: db.auditLogs.slice(0, 15),
  });
});

// 2. User Management
adminRoutes.get('/users', (req, res) => {
  const db = dbStore.getState();
  const roleFilter = (req.query.role as string) || 'all';
  const statusFilter = (req.query.status as string) || 'all';
  const search = ((req.query.search as string) || '').trim().toLowerCase();

  const list = db.users
    .filter((u) => {
      const normalized = normalizeRole(u.role);
      const matchesRole = roleFilter === 'all' || normalized === roleFilter.toLowerCase();
      const matchesStatus = statusFilter === 'all' || u.accountStatus === statusFilter;
      const matchesSearch =
        !search ||
        u.name.toLowerCase().includes(search) ||
        u.email.toLowerCase().includes(search) ||
        u.id.toLowerCase().includes(search);
      return matchesRole && matchesStatus && matchesSearch;
    })
    .map((u) => toPublicUser(u));

  res.json({ users: list });
});

adminRoutes.post('/users', (req, res) => {
  const {
    name,
    email,
    password,
    phone,
    role,
    assignedFacilityId,
    assignedDepartmentId,
    assignedCounterId,
    shift,
  } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
    role?: string;
    assignedFacilityId?: string;
    assignedDepartmentId?: string;
    assignedCounterId?: string;
    shift?: string;
  };

  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    res.status(400).json({
      error: 'Name, valid email, and password (min 6 characters) are required.',
    });
    return;
  }

  const db = dbStore.getState();
  const normalizedEmail = email.trim().toLowerCase();
  if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    res.status(409).json({ error: 'A user with this email already exists.' });
    return;
  }

  const assignedRole = normalizeRole(role || 'operator');
  const newUser: UserRecord = {
    id: `usr-${crypto.randomUUID().slice(0, 8)}`,
    name: name.trim(),
    email: normalizedEmail,
    phone: phone?.trim() || undefined,
    role: assignedRole,
    accountStatus: 'active',
    organisationId: assignedRole !== 'citizen' ? db.organisations[0]?.id : undefined,
    assignedFacilityId:
      assignedRole === 'operator' ? assignedFacilityId || db.facilities[0]?.id : undefined,
    assignedDepartmentId:
      assignedRole === 'operator' ? assignedDepartmentId : undefined,
    assignedCounterId:
      assignedRole === 'operator' ? assignedCounterId : undefined,
    shift: assignedRole === 'operator' ? shift?.trim() || 'Morning (08:00 – 14:00)' : undefined,
    permissions:
      assignedRole === 'admin'
        ? ['all']
        : assignedRole === 'operator'
          ? ['call_next', 'recall', 'serve', 'complete', 'skip', 'no_show', 'toggle_counter']
          : ['book_token'],
    trustScore: assignedRole === 'citizen' ? 95 : 100,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  // Link counter if assigned
  if (assignedCounterId && assignedRole === 'operator') {
    const cnt = db.counters.find((c) => c.id === assignedCounterId);
    if (cnt) {
      cnt.assignedOperatorId = newUser.id;
      cnt.staffName = newUser.name;
    }
  }

  db.users.push(newUser);
  recordAuditLog({
    actor: getActor(req),
    action: 'USER_CREATED',
    targetType: 'user',
    targetId: newUser.id,
    facilityId: newUser.assignedFacilityId,
    details: `Created ${newUser.role} account for ${newUser.name} (${newUser.email}).`,
  });
  dbStore.save();
  res.status(201).json({ user: toPublicUser(newUser) });
});

adminRoutes.patch('/users/:userId', (req, res) => {
  const { userId } = req.params;
  const {
    role,
    accountStatus,
    assignedFacilityId,
    assignedDepartmentId,
    assignedCounterId,
    shift,
    permissions,
  } = req.body as {
    role?: string;
    accountStatus?: AccountStatus;
    assignedFacilityId?: string;
    assignedDepartmentId?: string;
    assignedCounterId?: string;
    shift?: string;
    permissions?: string[];
  };

  const db = dbStore.getState();
  const user = db.users.find((u) => u.id === userId);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (user.id === req.authUser?.sub && accountStatus === 'inactive') {
    res.status(400).json({ error: 'Administrators cannot deactivate their own active session.' });
    return;
  }
  if (user.id === req.authUser?.sub && role && normalizeRole(role) !== 'admin') {
    res.status(400).json({ error: 'Administrators cannot demote their own role.' });
    return;
  }

  if (role) user.role = normalizeRole(role);
  if (accountStatus && ['active', 'inactive'].includes(accountStatus)) {
    user.accountStatus = accountStatus;
    if (accountStatus === 'inactive') {
      for (const s of db.refreshSessions) {
        if (s.userId === user.id) s.revoked = true;
      }
    }
  }
  if (assignedFacilityId !== undefined) user.assignedFacilityId = assignedFacilityId || undefined;
  if (assignedDepartmentId !== undefined)
    user.assignedDepartmentId = assignedDepartmentId || undefined;
  if (assignedCounterId !== undefined) {
    user.assignedCounterId = assignedCounterId || undefined;
    if (assignedCounterId) {
      const cnt = db.counters.find((c) => c.id === assignedCounterId);
      if (cnt) {
        cnt.assignedOperatorId = user.id;
        cnt.staffName = user.name;
      }
    }
  }
  if (shift !== undefined) user.shift = shift || undefined;
  if (Array.isArray(permissions)) user.permissions = permissions;

  recordAuditLog({
    actor: getActor(req),
    action: 'USER_UPDATED',
    targetType: 'user',
    targetId: user.id,
    facilityId: user.assignedFacilityId,
    details: `Updated ${user.name} (role: ${user.role}, status: ${user.accountStatus}).`,
  });
  dbStore.save();
  res.json({ user: toPublicUser(user) });
});

// 3. Service Center (Facility) Management
adminRoutes.get('/facilities', (_req, res) => {
  const db = dbStore.getState();
  const list = db.facilities.map((f) => {
    const snap = getFacilitySnapshot(f.id);
    return {
      ...f,
      departmentsCount: db.departments.filter((d) => d.facilityId === f.id).length,
      queuesCount: db.queues.filter((q) => q.facilityId === f.id).length,
      countersCount: db.counters.filter((c) => c.facilityId === f.id).length,
      waitingCount: snap?.summary.totalWaiting || 0,
      avgWaitMins: snap?.summary.avgWaitMins || 0,
    };
  });
  res.json({ facilities: list });
});

adminRoutes.post('/facilities', (req, res) => {
  const { name, city, address, phone, workingHours, organisationId } = req.body as {
    name?: string;
    city?: string;
    address?: string;
    phone?: string;
    workingHours?: string;
    organisationId?: string;
  };
  if (!name?.trim() || !city?.trim()) {
    res.status(400).json({ error: 'Service center name and city are required.' });
    return;
  }

  const db = dbStore.getState();
  const targetOrgId = organisationId || db.organisations[0]?.id || 'org-ap-health';
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
  const id = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
  const code = `SQ-${city.trim().slice(0, 3).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`;

  const facility: FacilityRecord = {
    id,
    organisationId: targetOrgId,
    name: name.trim(),
    city: city.trim(),
    code,
    address: address?.trim() || `${city.trim()} Main Civic Campus`,
    phone: phone?.trim() || undefined,
    workingHours: workingHours?.trim() || '08:00 – 18:00',
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  db.facilities.push(facility);
  db.hourlyTraffic[facility.id] = [
    { hour: '8 AM', footfall: 20, avgWaitMins: 6 },
    { hour: '9 AM', footfall: 42, avgWaitMins: 11 },
    { hour: '10 AM', footfall: 74, avgWaitMins: 19, isPeak: true },
    { hour: '11 AM', footfall: 86, avgWaitMins: 24, isPeak: true },
    { hour: '12 PM', footfall: 58, avgWaitMins: 15 },
    { hour: '1 PM', footfall: 36, avgWaitMins: 10 },
    { hour: '2 PM', footfall: 22, avgWaitMins: 5, isRecommended: true },
    { hour: '3 PM', footfall: 30, avgWaitMins: 8, isRecommended: true },
    { hour: '4 PM', footfall: 40, avgWaitMins: 11 },
  ];

  recordAuditLog({
    actor: getActor(req),
    action: 'FACILITY_CREATED',
    targetType: 'facility',
    targetId: facility.id,
    facilityId: facility.id,
    details: `Created service center ${facility.name} (${facility.city}).`,
  });
  dbStore.save();
  res.status(201).json({ facility });
});

adminRoutes.patch('/facilities/:facilityId', (req, res) => {
  const { facilityId } = req.params;
  const { name, city, address, phone, workingHours, isActive } = req.body as Partial<FacilityRecord>;
  const db = dbStore.getState();
  const facility = db.facilities.find((f) => f.id === facilityId);
  if (!facility) {
    res.status(404).json({ error: 'Service center not found.' });
    return;
  }

  if (name?.trim()) facility.name = name.trim();
  if (city?.trim()) facility.city = city.trim();
  if (address?.trim()) facility.address = address.trim();
  if (phone !== undefined) facility.phone = phone?.trim() || undefined;
  if (workingHours?.trim()) facility.workingHours = workingHours.trim();
  if (typeof isActive === 'boolean') facility.isActive = isActive;

  recordAuditLog({
    actor: getActor(req),
    action: 'FACILITY_UPDATED',
    targetType: 'facility',
    targetId: facility.id,
    facilityId: facility.id,
    details: `Updated ${facility.name} (active: ${facility.isActive}).`,
  });
  dbStore.save();
  res.json({ facility });
});

// 4. Department & Service Management
adminRoutes.get('/departments', (req, res) => {
  const db = dbStore.getState();
  const facilityId = req.query.facilityId as string | undefined;
  const departments = db.departments
    .filter((d) => !facilityId || d.facilityId === facilityId)
    .map((d) => {
      const fac = db.facilities.find((f) => f.id === d.facilityId);
      const services = db.queues.filter((q) => q.departmentId === d.id);
      return {
        ...d,
        facilityName: fac?.name || d.facilityId,
        services,
      };
    });
  res.json({ departments });
});

adminRoutes.post('/departments', (req, res) => {
  const { facilityId, name, code, floorOrWing, description } = req.body as {
    facilityId?: string;
    name?: string;
    code?: string;
    floorOrWing?: string;
    description?: string;
  };
  if (!facilityId || !name?.trim()) {
    res.status(400).json({ error: 'facilityId and department name are required.' });
    return;
  }
  const db = dbStore.getState();
  if (!db.facilities.some((f) => f.id === facilityId)) {
    res.status(404).json({ error: 'Service center not found.' });
    return;
  }

  const department: DepartmentRecord = {
    id: `dept-${crypto.randomUUID().slice(0, 6)}`,
    facilityId,
    name: name.trim(),
    code: (code?.trim() || name.trim().slice(0, 3)).toUpperCase(),
    floorOrWing: floorOrWing?.trim() || 'Ground Floor',
    description: description?.trim() || 'Service department',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  db.departments.push(department);
  recordAuditLog({
    actor: getActor(req),
    action: 'DEPARTMENT_CREATED',
    targetType: 'department',
    targetId: department.id,
    facilityId,
    details: `Created department ${department.name} (${department.code}).`,
  });
  dbStore.save();
  broadcastFacilitySnapshot(facilityId, 'org:queue-updated');
  res.status(201).json({ department });
});

adminRoutes.patch('/departments/:departmentId', (req, res) => {
  const { departmentId } = req.params;
  const { name, code, floorOrWing, description, isActive } = req.body as Partial<DepartmentRecord>;
  const db = dbStore.getState();
  const dept = db.departments.find((d) => d.id === departmentId);
  if (!dept) {
    res.status(404).json({ error: 'Department not found.' });
    return;
  }

  if (name?.trim()) dept.name = name.trim();
  if (code?.trim()) dept.code = code.trim().toUpperCase();
  if (floorOrWing?.trim()) dept.floorOrWing = floorOrWing.trim();
  if (description !== undefined) dept.description = description.trim();
  if (typeof isActive === 'boolean') dept.isActive = isActive;

  recordAuditLog({
    actor: getActor(req),
    action: 'DEPARTMENT_UPDATED',
    targetType: 'department',
    targetId: dept.id,
    facilityId: dept.facilityId,
    details: `Updated department ${dept.name} (active: ${dept.isActive}).`,
  });
  dbStore.save();
  broadcastFacilitySnapshot(dept.facilityId, 'org:queue-updated');
  res.json({ department: dept });
});

// Create service/queue under department
adminRoutes.post('/queues', (req, res) => {
  const { facilityId, departmentId, name, prefix, location, priority, fee, avgServiceMinutes } =
    req.body as {
      facilityId?: string;
      departmentId?: string;
      name?: string;
      prefix?: string;
      location?: string;
      priority?: QueuePriority;
      fee?: string;
      avgServiceMinutes?: number;
    };

  if (!facilityId || !name?.trim() || !prefix?.trim() || !location?.trim()) {
    res.status(400).json({ error: 'facilityId, name, prefix, and location are required.' });
    return;
  }
  const db = dbStore.getState();
  const targetDeptId =
    departmentId ||
    db.departments.find((d) => d.facilityId === facilityId)?.id ||
    'dept-opd';

  const queue: ServiceQueueRecord = {
    id: `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 22)}-${crypto.randomUUID().slice(0, 4)}`,
    facilityId,
    departmentId: targetDeptId,
    prefix: prefix.trim().toUpperCase().slice(0, 2),
    name: name.trim(),
    location: location.trim(),
    priority: priority || 'standard',
    fee: fee?.trim() || 'Standard',
    avgServiceMinutes: Math.max(1, Number(avgServiceMinutes) || 4),
    servingNumber: 1,
    nextIssueNumber: 1,
    predictionConfidence: 94,
    isActive: true,
    isPaused: false,
  };

  db.queues.push(queue);
  recordAuditLog({
    actor: getActor(req),
    action: 'QUEUE_CREATED',
    targetType: 'queue',
    targetId: queue.id,
    facilityId,
    details: `Created service queue ${queue.name} (${queue.prefix}-series).`,
  });
  dbStore.save();
  broadcastFacilitySnapshot(facilityId, 'org:queue-created', { queue });
  res.status(201).json({ queue });
});

adminRoutes.patch('/queues/:queueId', (req, res) => {
  const { queueId } = req.params;
  const { name, location, priority, avgServiceMinutes, isActive, isPaused, departmentId } =
    req.body as Partial<ServiceQueueRecord>;
  const db = dbStore.getState();
  const queue = db.queues.find((q) => q.id === queueId);
  if (!queue) {
    res.status(404).json({ error: 'Queue not found.' });
    return;
  }

  if (name?.trim()) queue.name = name.trim();
  if (location?.trim()) queue.location = location.trim();
  if (priority) queue.priority = priority;
  if (departmentId) queue.departmentId = departmentId;
  if (typeof avgServiceMinutes === 'number' && avgServiceMinutes >= 1) {
    queue.avgServiceMinutes = avgServiceMinutes;
  }
  if (typeof isActive === 'boolean') queue.isActive = isActive;
  if (typeof isPaused === 'boolean') queue.isPaused = isPaused;

  recordAuditLog({
    actor: getActor(req),
    action: 'QUEUE_UPDATED',
    targetType: 'queue',
    targetId: queue.id,
    facilityId: queue.facilityId,
    details: `Updated queue ${queue.name} (active: ${queue.isActive}, paused: ${queue.isPaused}).`,
  });
  dbStore.save();
  broadcastFacilitySnapshot(queue.facilityId, 'org:queue-updated', { queue });
  res.json({ queue });
});

// 5. Counter Management
adminRoutes.get('/counters', (req, res) => {
  const db = dbStore.getState();
  const facilityId = req.query.facilityId as string | undefined;
  const counters = db.counters
    .filter((c) => !facilityId || c.facilityId === facilityId)
    .map((c) => {
      const fac = db.facilities.find((f) => f.id === c.facilityId);
      const dept = db.departments.find((d) => d.id === c.departmentId);
      const q = db.queues.find((fq) => fq.id === c.queueId);
      return {
        ...c,
        facilityName: fac?.name || c.facilityId,
        departmentName: dept?.name || 'General',
        queueName: q?.name || 'General Queue',
      };
    });
  res.json({ counters });
});

adminRoutes.post('/counters', (req, res) => {
  const { facilityId, departmentId, queueId, label, assignedOperatorId, staffName, status } =
    req.body as {
      facilityId?: string;
      departmentId?: string;
      queueId?: string;
      label?: string;
      assignedOperatorId?: string;
      staffName?: string;
      status?: CounterStatus;
    };

  if (!facilityId || !queueId || !label?.trim()) {
    res.status(400).json({ error: 'facilityId, queueId, and counter label are required.' });
    return;
  }

  const db = dbStore.getState();
  const queue = db.queues.find((q) => q.id === queueId && q.facilityId === facilityId);
  if (!queue) {
    res.status(404).json({ error: 'Target queue not found in service center.' });
    return;
  }

  const op = assignedOperatorId
    ? db.users.find((u) => u.id === assignedOperatorId)
    : undefined;

  const counter = {
    id: `cnt-${crypto.randomUUID().slice(0, 6)}`,
    facilityId,
    departmentId: departmentId || queue.departmentId,
    label: label.trim(),
    staffName: op?.name || staffName?.trim() || 'Unassigned',
    assignedOperatorId: op?.id,
    queueId: queue.id,
    status: status || ('Serving' as CounterStatus),
    currentToken: `${queue.prefix}-${queue.servingNumber}`,
    avgCycleMins: queue.avgServiceMinutes,
  };

  if (op) {
    op.assignedFacilityId = facilityId;
    op.assignedDepartmentId = counter.departmentId;
    op.assignedCounterId = counter.id;
  }

  db.counters.push(counter);
  recordAuditLog({
    actor: getActor(req),
    action: 'COUNTER_CREATED',
    targetType: 'counter',
    targetId: counter.id,
    facilityId,
    details: `Created ${counter.label} assigned to ${counter.staffName} (${queue.name}).`,
  });
  dbStore.save();
  broadcastFacilitySnapshot(facilityId, 'counter:updated', { counter });
  res.status(201).json({ counter });
});

adminRoutes.patch('/counters/:counterId', (req, res) => {
  const { counterId } = req.params;
  const { status, queueId, departmentId, assignedOperatorId, staffName } = req.body as {
    status?: CounterStatus;
    queueId?: string;
    departmentId?: string;
    assignedOperatorId?: string;
    staffName?: string;
  };

  const db = dbStore.getState();
  const counter = db.counters.find((c) => c.id === counterId);
  if (!counter) {
    res.status(404).json({ error: 'Counter not found.' });
    return;
  }

  if (queueId) {
    const q = db.queues.find((fq) => fq.id === queueId && fq.facilityId === counter.facilityId);
    if (!q) {
      res.status(404).json({ error: 'Target queue not found in service center.' });
      return;
    }
    counter.queueId = q.id;
    counter.departmentId = q.departmentId;
  }
  if (departmentId) counter.departmentId = departmentId;
  if (status && ['Serving', 'Busy', 'Paused', 'Closed'].includes(status)) {
    counter.status = status;
  }
  if (assignedOperatorId !== undefined) {
    const op = assignedOperatorId
      ? db.users.find((u) => u.id === assignedOperatorId)
      : undefined;
    counter.assignedOperatorId = op?.id;
    counter.staffName = op?.name || staffName?.trim() || 'Unassigned';
    if (op) {
      op.assignedFacilityId = counter.facilityId;
      op.assignedDepartmentId = counter.departmentId;
      op.assignedCounterId = counter.id;
    }
  } else if (staffName?.trim()) {
    counter.staffName = staffName.trim();
  }

  recordAuditLog({
    actor: getActor(req),
    action: 'COUNTER_UPDATED',
    targetType: 'counter',
    targetId: counter.id,
    facilityId: counter.facilityId,
    details: `Updated ${counter.label} (status: ${counter.status}, staff: ${counter.staffName}).`,
  });
  dbStore.save();
  broadcastFacilitySnapshot(counter.facilityId, 'counter:updated', { counter });
  res.json({ counter });
});

// 6. Cross-Facility Queue Monitoring
adminRoutes.get('/queues/monitor', (req, res) => {
  const db = dbStore.getState();
  const facilityId = (req.query.facilityId as string) || 'all';

  const targetFacilities =
    facilityId === 'all'
      ? db.facilities
      : db.facilities.filter((f) => f.id === facilityId);

  const queues = targetFacilities.flatMap((f) => {
    const snap = getFacilitySnapshot(f.id);
    if (!snap) return [];
    return snap.queues.map((q) => ({
      ...q,
      facilityName: f.name,
      overloaded: q.waitingCount >= 6,
    }));
  });

  const activeTokens = targetFacilities.flatMap((f) => {
    const snap = getFacilitySnapshot(f.id);
    if (!snap) return [];
    return snap.roster.map((t) => ({
      ...t,
      facilityName: f.name,
    }));
  });

  const surgeAlerts = targetFacilities
    .map((f) => {
      const snap = getFacilitySnapshot(f.id);
      return snap?.surgeAlert ? { facilityName: f.name, facilityId: f.id, ...snap.surgeAlert } : null;
    })
    .filter(Boolean);

  res.json({ queues, activeTokens, surgeAlerts });
});

// 7. Reports & Analytics
adminRoutes.get('/reports', (req, res) => {
  const db = dbStore.getState();
  const period = ((req.query.period as string) || 'daily').toLowerCase();
  const facilityId = (req.query.facilityId as string) || 'all';
  const multiplier = period === 'monthly' ? 26 : period === 'weekly' ? 7 : 1;

  const scopedTokens = db.tokens.filter(
    (t) => facilityId === 'all' || t.facilityId === facilityId
  );
  const completedCount = scopedTokens.filter((t) => t.status === 'Completed').length * multiplier;
  const cancelledCount =
    scopedTokens.filter((t) =>
      ['Cancelled', 'Skipped', 'NoShow'].includes(t.status)
    ).length * multiplier;
  const activeCount = scopedTokens.filter((t) =>
    ['Waiting', 'Called', 'Serving', 'Grace'].includes(t.status)
  ).length;

  const departmentPerformance = db.departments
    .filter((d) => facilityId === 'all' || d.facilityId === facilityId)
    .map((d) => {
      const deptTokens = scopedTokens.filter((t) => t.departmentId === d.id);
      const deptQueues = db.queues.filter((q) => q.departmentId === d.id);
      const avgWait =
        deptQueues.length > 0
          ? Math.round(
              deptQueues.reduce((s, q) => s + q.avgServiceMinutes * 2.4, 0) / deptQueues.length
            )
          : 8;
      return {
        departmentId: d.id,
        departmentName: d.name,
        facilityName: db.facilities.find((f) => f.id === d.facilityId)?.name || d.facilityId,
        totalTokens: deptTokens.length * multiplier,
        completed: deptTokens.filter((t) => t.status === 'Completed').length * multiplier,
        cancelled:
          deptTokens.filter((t) => ['Cancelled', 'Skipped', 'NoShow'].includes(t.status)).length *
          multiplier,
        avgWaitMins: avgWait,
      };
    });

  const counterPerformance = db.counters
    .filter((c) => facilityId === 'all' || c.facilityId === facilityId)
    .map((c) => {
      const handled = scopedTokens.filter((t) => t.counterId === c.id);
      return {
        counterId: c.id,
        label: c.label,
        staffName: c.staffName,
        facilityName: db.facilities.find((f) => f.id === c.facilityId)?.name || c.facilityId,
        status: c.status,
        tokensHandled: handled.length * multiplier,
        completed: handled.filter((t) => t.status === 'Completed').length * multiplier,
        avgCycleMins: c.avgCycleMins,
      };
    });

  const centerComparison = db.facilities.map((f) => {
    const snap = getFacilitySnapshot(f.id);
    const facTokens = db.tokens.filter((t) => t.facilityId === f.id);
    return {
      facilityId: f.id,
      name: f.name,
      city: f.city,
      totalTokens: facTokens.length * multiplier,
      waiting: snap?.summary.totalWaiting || 0,
      avgWaitMins: snap?.summary.avgWaitMins || 0,
      activeCounters: snap?.summary.activeCountersCount || 0,
    };
  });

  const trafficSource =
    facilityId !== 'all' && db.hourlyTraffic[facilityId]
      ? db.hourlyTraffic[facilityId]
      : db.hourlyTraffic[db.facilities[0]?.id || 'vja-hospital'] || [];

  res.json({
    period,
    facilityId,
    summary: {
      totalGenerated: scopedTokens.length * multiplier,
      completed: completedCount,
      cancelled: cancelledCount,
      active: activeCount,
      completionRate:
        completedCount + cancelledCount > 0
          ? Math.round((completedCount / (completedCount + cancelledCount)) * 100)
          : 100,
    },
    departmentPerformance,
    counterPerformance,
    centerComparison,
    hourlyTraffic: trafficSource.map((p) => ({
      ...p,
      footfall: p.footfall * multiplier,
    })),
    sdgImpact: {
      sdg9InfraCalls: (db.metrics.baseInfraCalls + db.metrics.processedDelta) * multiplier,
      sdg11CorridorDensityReduction: '-43%',
      sdg12PaperSlipsSaved:
        (db.metrics.basePaperSlipsSaved + db.metrics.processedDelta) * multiplier,
    },
  });
});

// 8. System Settings & Audit Logs
adminRoutes.get('/settings', (_req, res) => {
  const db = dbStore.getState();
  res.json({ settings: db.settings });
});

adminRoutes.patch('/settings', (req, res) => {
  const body = req.body as Partial<typeof dbStore extends { getState: () => infer S } ? S extends { settings: infer T } ? T : never : never>;
  const db = dbStore.getState();

  if (typeof body.organisationName === 'string' && body.organisationName.trim()) {
    db.settings.organisationName = body.organisationName.trim();
  }
  if (typeof body.maxActiveTokensPerCitizen === 'number' && body.maxActiveTokensPerCitizen >= 1) {
    db.settings.maxActiveTokensPerCitizen = Math.min(5, body.maxActiveTokensPerCitizen);
  }
  if (typeof body.gracePeriodMinutes === 'number' && body.gracePeriodMinutes >= 1) {
    db.settings.gracePeriodMinutes = Math.min(30, body.gracePeriodMinutes);
  }
  if (typeof body.allowPeerSwaps === 'boolean') db.settings.allowPeerSwaps = body.allowPeerSwaps;
  if (typeof body.enableInAppNotifications === 'boolean')
    db.settings.enableInAppNotifications = body.enableInAppNotifications;
  if (typeof body.enableSmsNotifications === 'boolean')
    db.settings.enableSmsNotifications = body.enableSmsNotifications;
  if (typeof body.enableEmailNotifications === 'boolean')
    db.settings.enableEmailNotifications = body.enableEmailNotifications;
  if (typeof body.workingHoursStart === 'string' && body.workingHoursStart.trim()) {
    db.settings.workingHoursStart = body.workingHoursStart.trim();
  }
  if (typeof body.workingHoursEnd === 'string' && body.workingHoursEnd.trim()) {
    db.settings.workingHoursEnd = body.workingHoursEnd.trim();
  }
  db.settings.updatedAt = new Date().toISOString();

  recordAuditLog({
    actor: getActor(req),
    action: 'SETTINGS_UPDATED',
    targetType: 'settings',
    targetId: 'global',
    details: `Updated platform configuration (maxActiveTokens=${db.settings.maxActiveTokensPerCitizen}, grace=${db.settings.gracePeriodMinutes}m).`,
  });
  dbStore.save();
  res.json({ settings: db.settings });
});

adminRoutes.get('/audit-logs', (req, res) => {
  const db = dbStore.getState();
  const limit = Math.min(100, Number(req.query.limit) || 50);
  res.json({ logs: db.auditLogs.slice(0, limit) });
});
