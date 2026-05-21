import { and, desc, eq, ilike, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { customers } from '@gm/db';
import { protectedProcedure, requireRole, router } from '../init';

export const customersRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = [eq(customers.companyId, ctx.companyId), isNull(customers.deletedAt)];
      if (input?.search) where.push(ilike(customers.name, `%${input.search}%`));
      return ctx.db
        .select()
        .from(customers)
        .where(and(...where))
        .orderBy(desc(customers.updatedAt))
        .limit(100);
    }),

  byId: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.companyId, ctx.companyId)))
      .limit(1);
    return row ?? null;
  }),

  create: requireRole('admin', 'dispatcher')
    .input(
      z.object({
        name: z.string().min(1).max(200),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        languagePreference: z.enum(['fr', 'en']).default('fr'),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(customers)
        .values({ ...input, companyId: ctx.companyId })
        .returning();
      return row;
    }),
});
