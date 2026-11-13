import { Router } from 'express';
import crypto from 'node:crypto';
import { dbStore } from '../db/store.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';

export const notificationRoutes = Router();

notificationRoutes.use(requireAuth);

notificationRoutes.get('/', (req, res) => {
  const facilityId = (req.query.facilityId as string) || 'all';
  const db = dbStore.getState();
  const userId = req.authUser?.sub;
  const role = req.authUser?.role;

  const list = db.notifications
    .filter((n) => {
      const matchesFacility =
        facilityId === 'all' || !n.facilityId || n.facilityId === facilityId;
      // Citizens only see their own notifications or general non-user-specific facility announcements
      const matchesUser =
        role === 'admin'
          ? !n.userId || n.userId === userId
          : !n.userId || n.userId === userId;
      return matchesFacility && matchesUser;
    })
    .slice(0, 60);

  const unreadCount = list.filter((n) => !n.isRead).length;
  res.json({ notifications: list, unreadCount });
});

notificationRoutes.patch('/:id/read', (req, res) => {
  const { id } = req.params;
  const db = dbStore.getState();
  const item = db.notifications.find((n) => n.id === id);
  if (!item) {
    res.status(404).json({ error: 'Notification not found.' });
    return;
  }
  if (item.userId && item.userId !== req.authUser?.sub && req.authUser?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden.' });
    return;
  }
  item.isRead = true;
  dbStore.save();
  res.json({ notification: item });
});

notificationRoutes.post('/read-all', (req, res) => {
  const facilityId = (req.body?.facilityId as string) || (req.query.facilityId as string) || 'all';
  const db = dbStore.getState();
  const userId = req.authUser?.sub;

  for (const n of db.notifications) {
    const matchesFacility =
      facilityId === 'all' || !n.facilityId || n.facilityId === facilityId;
    const matchesUser = !n.userId || n.userId === userId;
    if (matchesFacility && matchesUser) {
      n.isRead = true;
    }
  }
  dbStore.save();
  res.json({ ok: true });
});

notificationRoutes.post('/test', (req, res) => {
  const { facilityId, title, message } = req.body as {
    facilityId?: string;
    title?: string;
    message?: string;
  };
  const db = dbStore.getState();
  const notif = {
    id: `notif-${crypto.randomUUID().slice(0, 8)}`,
    facilityId: facilityId || 'vja-hospital',
    userId: req.authUser?.sub,
    title: title || 'Queue Alert Reminder',
    message: message || 'Notifications are active for your SmartQueue session.',
    category: 'system' as const,
    channel: 'in-app' as const,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  db.notifications.unshift(notif);
  dbStore.save();
  res.status(201).json({ notification: notif });
});
