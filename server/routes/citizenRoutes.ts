import { Router } from 'express';
import { dbStore } from '../db/store.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { getFacilitySnapshot } from '../services/queueEngine.ts';

export const citizenRoutes = Router();

// Protected citizen overview across active service centers
citizenRoutes.get('/overview', requireAuth, (req, res) => {
  const db = dbStore.getState();
  const activeFacilities = db.facilities.filter((f) => f.isActive);
  const activeDepartments = db.departments.filter((d) => d.isActive);

  const facilitySnapshots = activeFacilities.map((f) => {
    const snap = getFacilitySnapshot(f.id);
    return {
      facility: f,
      departments: activeDepartments.filter((d) => d.facilityId === f.id),
      queues: snap?.queues.filter((q) => q.isActive) || [],
      counters: snap?.counters.filter((c) => c.status !== 'Closed') || [],
    };
  });

  const activeToken =
    db.tokens.find(
      (t) =>
        t.userId === req.authUser?.sub &&
        ['Waiting', 'Called', 'Serving', 'Grace'].includes(t.status)
    ) || null;

  let activeTokenHydrated = null;
  if (activeToken) {
    const snap = getFacilitySnapshot(activeToken.facilityId);
    activeTokenHydrated =
      snap?.roster.find((r) => r.tokenId === activeToken.tokenId) || activeToken;
  }

  res.json({
    centers: facilitySnapshots,
    activeToken: activeTokenHydrated,
  });
});

// Citizen's own token history (Completed, Cancelled, Skipped, NoShow + active)
citizenRoutes.get('/history', requireAuth, (req, res) => {
  const db = dbStore.getState();
  const userId = req.authUser?.sub;
  const user = db.users.find((u) => u.id === userId);

  const items = db.tokens
    .filter((t) => {
      if (t.userId === userId) return true;
      // Match seeded demo citizen tokens by exact name for seamless demo history
      if (user && !t.userId && t.citizenName.toLowerCase() === user.name.toLowerCase()) {
        return true;
      }
      return false;
    })
    .slice()
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
    .map((t) => {
      const fac = db.facilities.find((f) => f.id === t.facilityId);
      const dept = db.departments.find((d) => d.id === t.departmentId);
      const cnt = db.counters.find((c) => c.id === t.counterId);
      return {
        tokenId: t.tokenId,
        facilityId: t.facilityId,
        facilityName: fac?.name || t.facilityId,
        facilityCity: fac?.city || '',
        departmentId: t.departmentId,
        departmentName: dept?.name || 'General Services',
        queueId: t.queueId,
        queueName: t.queueName,
        counterLabel: cnt?.label || 'Desk Assigned',
        channel: t.channel,
        priority: t.priority,
        status: t.status,
        joinedAt: t.joinedAt,
        calledAt: t.calledAt,
        completedAt: t.completedAt,
        cancelledAt: t.cancelledAt,
        createdAtMs: t.createdAtMs,
      };
    });

  res.json({ history: items });
});
