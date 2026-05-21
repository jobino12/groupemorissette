import { createDb } from '@gm/db';
import { env } from '../env';

declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof createDb> | undefined;
}

export const db = global.__db ?? createDb(env.DATABASE_URL);

if (env.NODE_ENV !== 'production') global.__db = db;
