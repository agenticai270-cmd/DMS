import type { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/apiResponse.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/schemas.js';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: env.isProd ? 'strict' : 'lax',
  secure: env.isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});

const publicUser = (u: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  phone?: string;
  createdAt?: Date;
}) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  phone: u.phone ?? '',
  createdAt: u.createdAt,
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);

  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) throw ApiError.conflict('An account with that email already exists.');

  // Role is never taken from the request body — self-registration is always a user.
  const user = await User.create({
    name: input.name,
    email: input.email,
    password: input.password,
    phone: input.phone || undefined,
    role: 'user',
  });

  const token = signToken(String(user._id), user.role);
  res.cookie('resq_token', token, cookieOptions());
  return created(res, { token, user: publicUser(user) });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);

  const user = await User.findOne({ email: input.email }).select('+password');
  // Same message for both branches so the endpoint can't enumerate accounts.
  if (!user || !(await user.comparePassword(input.password))) {
    throw ApiError.unauthorized('Incorrect email or password.');
  }
  if (!user.active) throw ApiError.forbidden('This account has been deactivated.');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = signToken(String(user._id), user.role);
  res.cookie('resq_token', token, cookieOptions());
  return ok(res, { token, user: publicUser(user) });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).lean();
  if (!user) throw ApiError.notFound('Account not found.');
  return ok(res, { user: publicUser(user) });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie('resq_token', { ...cookieOptions(), maxAge: undefined });
  return ok(res, { message: 'Signed out.' });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const input = updateProfileSchema.parse(req.body);
  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { ...(input.name ? { name: input.name } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}) },
    { new: true, runValidators: true },
  ).lean();
  if (!user) throw ApiError.notFound('Account not found.');
  return ok(res, { user: publicUser(user) });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const input = changePasswordSchema.parse(req.body);
  const user = await User.findById(req.user!.id).select('+password');
  if (!user) throw ApiError.notFound('Account not found.');
  if (!(await user.comparePassword(input.currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect.');
  }
  user.password = input.newPassword;
  await user.save();
  return ok(res, { message: 'Password updated.' });
});
