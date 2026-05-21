import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { workOrders, workOrderStatusEnum } from '@gm/db';
import { protectedProcedure, requireRole, router } from '../init';

const statusValues = workOrderStatusEnum.enumValues;

export const workOrdersRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(statusValues).optional(),
          assignedTechnicianId: z.string().uuid().optional(),
          from: z.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const where = [eq(workOrders.companyId, ctx.companyId), isNull(workOrders.deletedAt)];
      if (input?.status) where.push(eq(workOrders.status, input.status));
      if (input?.assignedTechnicianId)
        where.push(eq(workOrders.assignedTechnicianId, input.assignedTechnicianId));
      if (input?.from) where.push(gte(workOrders.scheduledStart, input.from));
      return ctx.db
        .select()
        .from(workOrders)
        .where(and(...where))
        .orderBy(desc(workOrders.scheduledStart))
        .limit(200);
    }),

  myToday: protectedProcedure.query(async ({ ctx }) => {
    const technicianUserId = (ctx.session?.user as { id?: string })?.id;
    if (!technicianUserId) return [];
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return ctx.db
      .select()
      .from(workOrders)
      .where(
        and(
          eq(workOrders.companyId, ctx.companyId),
          gte(workOrders.scheduledStart, startOfDay),
          // NOTE: technician join not yet implemented — wire via technicians.userId
          eq(workOrders.assignedTechnicianId, technicianUserId),
        ),
      )
      .orderBy(workOrders.scheduledStart);
  }),

  create: requireRole('admin', 'dispatcher')
    .input(
      z.object({
        number: z.string().min(1).max(30),
        customerId: z.string().uuid(),
        siteId: z.string().uuid().optional(),
        description: z.string().optional(),
        scheduledStart: z.date().optional(),
        scheduledEnd: z.date().optional(),
        assignedTechnicianId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(workOrders)
        .values({ ...input, companyId: ctx.companyId, status: 'scheduled' })
        .returning();
      return row;
    }),
});
