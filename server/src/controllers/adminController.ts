import type { Request, Response } from 'express';
import { DisasterReport } from '../models/DisasterReport.js';
import { User } from '../models/User.js';
import { getAdminStats, getAnalytics } from '../services/statsService.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/apiResponse.js';
import { updateUserSchema, userQuerySchema } from '../validators/schemas.js';

export const stats = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await getAdminStats());
});

export const analytics = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  return ok(res, await getAnalytics(days));
});

export const recentIncidents = asyncHandler(async (_req: Request, res: Response) => {
  const items = await DisasterReport.find({})
    .sort({ createdAt: -1 })
    .limit(8)
    .populate('userId', 'name email')
    .lean();
  return ok(res, { items });
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const q = userQuerySchema.parse(req.query);
  const filters: Record<string, unknown> = {};
  if (q.role) filters.role = q.role;
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filters.$or = [{ name: rx }, { email: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filters).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    User.countDocuments(filters),
  ]);

  // Attach each user's report count in one grouped query.
  const counts = await DisasterReport.aggregate<{ _id: unknown; count: number }>([
    { $match: { userId: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  const items = users.map((u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone ?? '',
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    reportCount: countMap.get(String(u._id)) ?? 0,
  }));

  return paginated(res, items, q.page, q.limit, total);
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const input = updateUserSchema.parse(req.body);
  if (req.params.id === req.user!.id) {
    throw ApiError.badRequest('You cannot change your own role or status.');
  }

  // Never let the last administrator be demoted or deactivated.
  if (input.role === 'user' || input.active === false) {
    const target = await User.findById(req.params.id).lean();
    if (target?.role === 'admin') {
      const admins = await User.countDocuments({ role: 'admin', active: true });
      if (admins <= 1) throw ApiError.badRequest('At least one active administrator must remain.');
    }
  }

  const user = await User.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true }).lean();
  if (!user) throw ApiError.notFound('That user does not exist.');

  return ok(res, {
    user: { id: String(user._id), name: user.name, email: user.email, role: user.role, active: user.active },
  });
});
