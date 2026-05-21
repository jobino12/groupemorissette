import { initTRPC, TRPCError } from '@trpc/server';
import type { Session } from 'next-auth';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { auth } from '../auth';
import { db } from '../db';

export interface Context {
  db: typeof db;
  session: Session | null;
}

export async function createContext(): Promise<Context> {
  const session = (await auth()) as Session | null;
  return { db, session };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const companyId = (ctx.session.user as { companyId?: string }).companyId;
  if (!companyId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No company scope' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
      companyId,
      roles: (ctx.session.user as { roles?: string[] }).roles ?? [],
    },
  });
});

export function requireRole(...allowed: string[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.roles.some((r) => allowed.includes(r))) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next();
  });
}
