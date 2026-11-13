import { Router } from 'express';
import crypto from 'node:crypto';
import { dbStore } from '../db/store.ts';
import { optionalAuth, requireAuth, requireRole } from '../middleware/authMiddleware.ts';
import type {
  CounterRecord,
  CounterStatus,
  FacilityRecord,
  OrganisationRecord,
  QueuePriority,
  ServiceQueueRecord,
} from '../models/types.ts';
import { broadcastFacilitySnapshot } from '../services/queueEngine.ts';

export const orgStructureRoutes = Router();

// List active organisations, facilities, and departments
orgStructureRoutes.get('/', (_req, res) => {
  const db = dbStore.getState();
  const organisations = db.organisations.map((org) => ({
    ...org,
    facilities: db.facilities.filter((f) => f.organisationId === org.id),
  }));
  res.json({
    organisations,
    facilities: db.facilities,
    departments: db.departments,
  });
});

// Get single facility with departments, queues & counters
orgStructureRoutes.get('/:facilityId', optionalAuth, (req, res) => {
  const { facilityId } = req.params;
  const db = dbStore.getState();
  const facility = db.facilities.find((f) => f.id === facilityId);

  if (!facility) {
    res.status(404).json({ error: `Facility '${facilityId}' not found.` });
    return;
  }

  const organisation = db.organisations.find((o) => o.id === facility.organisationId);
  const departments = db.departments.filter((d) => d.facilityId === facilityId);
  const queues = db.queues.filter((q) => q.facilityId === facilityId);
  const counters = db.counters.filter((c) => c.facilityId === facilityId);

  res.json({
    organisation,
    facility,
    departments,
    queues,
    counters,
  });
});

// Create a new organisation (Admin only)
orgStructureRoutes.post(
  '/',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    const { name, sector } = req.body as {
      name?: string;
      sector?: OrganisationRecord['sector'];
    };

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Organisation name is required.' });
      return;
    }

    const db = dbStore.getState();
    const org: OrganisationRecord = {
      id: `org-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      sector: sector || 'civic',
      createdAt: new Date().toISOString(),
    };

    db.organisations.push(org);
    dbStore.save();
    res.status(201).json({ organisation: org });
  }
);

// Create a new facility/branch under an organisation (Admin only)
orgStructureRoutes.post(
  '/facilities',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    const { organisationId, name, city, address } = req.body as {
      organisationId?: string;
      name?: string;
      city?: string;
      address?: string;
    };

    if (!name || !name.trim() || !city || !city.trim()) {
      res.status(400).json({ error: 'Facility name and city are required.' });
      return;
    }

    const db = dbStore.getState();
    const targetOrgId = organisationId || req.authUser?.orgId || db.organisations[0]?.id;
    const org = db.organisations.find((o) => o.id === targetOrgId);
    if (!org) {
      res.status(404).json({ error: 'Target organisation not found.' });
      return;
    }

    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 24);
    const id = `${slug}-${crypto.randomUUID().slice(0, 4)}`;
    const code = `SQ-${city.trim().slice(0, 3).toUpperCase()}-${Math.floor(
      10 + Math.random() * 89
    )}`;

    const facility: FacilityRecord = {
      id,
      organisationId: org.id,
      name: name.trim(),
      city: city.trim(),
      code,
      address: address?.trim() || `${city.trim()} Main Campus`,
      workingHours: '08:00 – 18:00',
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
    dbStore.save();

    res.status(201).json({ facility });
  }
);

// Create a dedicated priority/service queue inside a facility (Admin only)
orgStructureRoutes.post(
  '/:facilityId/queues',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    const { facilityId } = req.params;
    const { name, prefix, location, priority, fee, avgServiceMinutes, departmentId } = req.body as {
      name?: string;
      prefix?: string;
      location?: string;
      priority?: QueuePriority;
      fee?: string;
      avgServiceMinutes?: number;
      departmentId?: string;
    };

    if (!name || !name.trim() || !prefix || !prefix.trim() || !location || !location.trim()) {
      res.status(400).json({
        error: 'Queue name, token prefix, and room/location are required.',
      });
      return;
    }

    const db = dbStore.getState();
    const facility = db.facilities.find((f) => f.id === facilityId);
    if (!facility) {
      res.status(404).json({ error: `Facility '${facilityId}' not found.` });
      return;
    }

    const normalizedPrefix = prefix.trim().toUpperCase().slice(0, 2);
    const id = `${name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 24)}-${crypto.randomUUID().slice(0, 4)}`;

    const targetDeptId =
      departmentId ||
      db.departments.find((d) => d.facilityId === facilityId)?.id ||
      'dept-opd';

    const queue: ServiceQueueRecord = {
      id,
      facilityId,
      departmentId: targetDeptId,
      prefix: normalizedPrefix,
      name: name.trim(),
      location: location.trim(),
      priority: priority || 'standard',
      fee: fee?.trim() || (priority === 'emergency' ? 'Immediate Slot' : 'Standard'),
      avgServiceMinutes: Math.max(1, Number(avgServiceMinutes) || 4),
      servingNumber: 1,
      nextIssueNumber: 1,
      predictionConfidence: 94,
      isActive: true,
      isPaused: false,
    };

    db.queues.push(queue);
    dbStore.save();

    broadcastFacilitySnapshot(facilityId, 'org:queue-created', { queue });
    res.status(201).json({ queue });
  }
);

// Update a queue configuration (Admin only)
orgStructureRoutes.patch(
  '/:facilityId/queues/:queueId',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    const { facilityId, queueId } = req.params;
    const { name, location, priority, avgServiceMinutes } = req.body as Partial<ServiceQueueRecord>;

    const db = dbStore.getState();
    const queue = db.queues.find((q) => q.id === queueId && q.facilityId === facilityId);
    if (!queue) {
      res.status(404).json({ error: 'Queue not found in this facility.' });
      return;
    }

    if (name?.trim()) queue.name = name.trim();
    if (location?.trim()) queue.location = location.trim();
    if (priority) queue.priority = priority;
    if (typeof avgServiceMinutes === 'number' && avgServiceMinutes >= 1) {
      queue.avgServiceMinutes = avgServiceMinutes;
    }

    dbStore.save();
    broadcastFacilitySnapshot(facilityId, 'org:queue-updated', { queue });
    res.json({ queue });
  }
);

// Add a service counter to a facility (Admin only)
orgStructureRoutes.post(
  '/:facilityId/counters',
  requireAuth,
  requireRole('admin'),
  (req, res) => {
    const { facilityId } = req.params;
    const { label, staffName, queueId, status, avgCycleMins } = req.body as {
      label?: string;
      staffName?: string;
      queueId?: string;
      status?: CounterStatus;
      avgCycleMins?: number;
    };

    if (!label || !label.trim() || !staffName || !staffName.trim() || !queueId) {
      res.status(400).json({ error: 'Counter label, staffName, and queueId are required.' });
      return;
    }

    const db = dbStore.getState();
    const facility = db.facilities.find((f) => f.id === facilityId);
    if (!facility) {
      res.status(404).json({ error: `Facility '${facilityId}' not found.` });
      return;
    }

    const queue = db.queues.find((q) => q.id === queueId && q.facilityId === facilityId);
    if (!queue) {
      res.status(404).json({ error: `Queue '${queueId}' not found in facility.` });
      return;
    }

    const counter: CounterRecord = {
      id: `cnt-${crypto.randomUUID().slice(0, 6)}`,
      facilityId,
      departmentId: queue.departmentId,
      label: label.trim(),
      staffName: staffName.trim(),
      queueId,
      status: status || 'Serving',
      currentToken: `${queue.prefix}-${queue.servingNumber}`,
      avgCycleMins: Math.max(1, Number(avgCycleMins) || queue.avgServiceMinutes),
    };

    db.counters.push(counter);
    dbStore.save();

    broadcastFacilitySnapshot(facilityId, 'counter:updated', { counter });
    res.status(201).json({ counter });
  }
);

// Update a counter (Admin or Operator for status only)
orgStructureRoutes.patch(
  '/:facilityId/counters/:counterId',
  requireAuth,
  requireRole('admin', 'operator'),
  (req, res) => {
    const { facilityId, counterId } = req.params;
    const { status, queueId, staffName, currentToken } = req.body as Partial<CounterRecord>;

    const db = dbStore.getState();
    const counter = db.counters.find(
      (c) => c.id === counterId && c.facilityId === facilityId
    );
    if (!counter) {
      res.status(404).json({ error: 'Counter not found in this facility.' });
      return;
    }

    if (req.authUser!.role === 'operator' && (queueId || staffName)) {
      res.status(403).json({
        error: 'Operators cannot reassign counter queues or staff; contact an Administrator.',
      });
      return;
    }

    if (queueId) {
      const targetQueue = db.queues.find(
        (q) => q.id === queueId && q.facilityId === facilityId
      );
      if (!targetQueue) {
        res.status(404).json({ error: 'Target queue not found in facility.' });
        return;
      }
      counter.queueId = targetQueue.id;
      counter.departmentId = targetQueue.departmentId;
    }

    if (status && ['Serving', 'Busy', 'Paused', 'Closed'].includes(status)) {
      counter.status = status;
    }
    if (staffName?.trim()) {
      counter.staffName = staffName.trim();
    }
    if (currentToken?.trim()) {
      counter.currentToken = currentToken.trim();
    }

    dbStore.save();
    broadcastFacilitySnapshot(facilityId, 'counter:updated', { counter });
    res.json({ counter });
  }
);
