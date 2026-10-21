import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { env, SERVER_ROOT } from './env.js';
import { logger } from '../utils/logger.js';

let memoryServer: { stop: () => Promise<unknown> } | null = null;

/**
 * Connects to MongoDB. If the configured URI is unreachable we fall back to a
 * bundled mongod writing to server/.local-db, so the platform is fully demoable
 * on a machine with no MongoDB installed. The fallback never runs in production.
 */
export async function connectDatabase(uri = env.MONGODB_URI): Promise<{ uri: string; ephemeral: boolean }> {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    logger.info(`MongoDB connected → ${redact(uri)}`);
    return { uri, ephemeral: false };
  } catch (err) {
    if (env.isProd) throw err;
    logger.warn(`MongoDB unreachable at ${redact(uri)} (${(err as Error).message})`);
    logger.warn('Starting a bundled local MongoDB instead.');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    // Give the fallback a real dbPath so seeded demo data survives a restart.
    const dbPath = path.join(SERVER_ROOT, '.local-db');
    fs.mkdirSync(dbPath, { recursive: true });
    const mem = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: 'wiredTiger' },
    });
    memoryServer = mem;
    const memUri = mem.getUri('resq');
    await mongoose.connect(memUri);
    logger.info(`Local MongoDB ready (data stored in ${dbPath}).`);
    return { uri: memUri, ephemeral: true };
  }
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

export const isEphemeral = () => memoryServer !== null;

const redact = (uri: string) => uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
