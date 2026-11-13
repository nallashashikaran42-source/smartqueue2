import { Router } from 'express';
import { getAnalyticsSummary } from '../services/queueEngine.ts';

export const analyticsRoutes = Router();

analyticsRoutes.get('/:facilityId/summary', (req, res) => {
  const { facilityId } = req.params;
  const summary = getAnalyticsSummary(facilityId);
  if (!summary) {
    res.status(404).json({ error: `Facility '${facilityId}' not found.` });
    return;
  }
  res.json(summary);
});
