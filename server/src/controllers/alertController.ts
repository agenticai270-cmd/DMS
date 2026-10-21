import type { Request, Response } from 'express';
import { Notification } from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/apiResponse.js';
import { alertSchema } from '../validators/schemas.js';

/**
 * Returns the alert feed for the signed-in user: every active broadcast plus
 * the personal status notifications addressed to them.
 */
export const listAlerts = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const items = await Notification.find({
    active: true,
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
      { $or: [{ kind: 'BROADCAST' }, { userId: req.user!.id }] },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const userId = req.user!.id;
  const withRead = items.map((n) => ({
    ...n,
    read: (n.readBy ?? []).some((id) => String(id) === userId),
  }));

  return ok(res, {
    items: withRead,
    unreadCount: withRead.filter((n) => !n.read).length,
  });
});

/** Admin view: broadcasts only, including expired ones, so they can be managed. */
export const listBroadcasts = asyncHandler(async (_req: Request, res: Response) => {
  const items = await Notification.find({ kind: 'BROADCAST' })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return ok(res, { items });
});

export const createAlert = asyncHandler(async (req: Request, res: Response) => {
  const input = alertSchema.parse(req.body);
  const alert = await Notification.create({
    kind: 'BROADCAST',
    title: input.title,
    message: input.message,
    severity: input.severity,
    targetArea: input.targetArea || undefined,
    expiresAt: input.expiresAt,
    createdBy: req.user!.id,
  });
  return created(res, { alert: alert.toJSON() });
});

export const deleteAlert = asyncHandler(async (req: Request, res: Response) => {
  const alert = await Notification.findOneAndDelete({ _id: req.params.id, kind: 'BROADCAST' });
  if (!alert) throw ApiError.notFound('That alert does not exist.');
  return ok(res, { message: 'Alert removed.' });
});

export const markRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.updateOne(
    { _id: req.params.id },
    { $addToSet: { readBy: req.user!.id } },
  );
  return ok(res, { message: 'Marked as read.' });
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.updateMany(
    { active: true, $or: [{ kind: 'BROADCAST' }, { userId: req.user!.id }] },
    { $addToSet: { readBy: req.user!.id } },
  );
  return ok(res, { message: 'All alerts marked as read.' });
});
