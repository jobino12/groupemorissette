import { and, desc, eq, isNull } from 'drizzle-orm';
import { invoices } from '@gm/db';
import { protectedProcedure, router } from '../init';

// Phase 2 placeholder. Real implementation will:
//   1. Build invoice from a completed work order (lines from time + parts).
//   2. Compute tax via @gm/shared/tax.
//   3. Persist locally, then enqueue an Inngest event to push to QBO.
export const invoicesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, ctx.companyId), isNull(invoices.deletedAt)))
      .orderBy(desc(invoices.issuedAt))
      .limit(100);
  }),
});
