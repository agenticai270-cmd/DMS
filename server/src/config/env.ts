import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src/config -> server/
export const SERVER_ROOT = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProd = NODE_ENV === 'production';

const jwtSecret = process.env.JWT_SECRET ?? '';
if (isProd && jwtSecret.length < 16) {
  throw new Error('JWT_SECRET must be set to at least 16 characters in production.');
}

export const env = {
  NODE_ENV,
  isProd,
  isTest: NODE_ENV === 'test',
  PORT: int(process.env.PORT, 5000),
  MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/resq',
  JWT_SECRET: jwtSecret || 'resq-insecure-development-secret-do-not-ship',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
  FRONTEND_URL: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  AI_PROVIDER: (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase(),
  AI_API_KEY: process.env.AI_API_KEY ?? '',
  AI_MODEL: process.env.AI_MODEL ?? 'claude-opus-5',
  UPLOAD_DIR: path.isAbsolute(process.env.UPLOAD_DIR ?? '')
    ? (process.env.UPLOAD_DIR as string)
    : path.join(SERVER_ROOT, process.env.UPLOAD_DIR ?? 'uploads'),
  MAX_UPLOAD_MB: int(process.env.MAX_UPLOAD_MB, 5),
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? 'admin@resq.io',
  SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
  SEED_USER_EMAIL: process.env.SEED_USER_EMAIL ?? 'demo@resq.io',
  SEED_USER_PASSWORD: process.env.SEED_USER_PASSWORD ?? 'Demo@12345',
};

export const aiEnabled = () => Boolean(env.AI_API_KEY);
