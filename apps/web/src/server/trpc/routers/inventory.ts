import { and, eq, isNull } from 'drizzle-orm';
import { products } from '@gm/db';
import { protectedProcedure, router } from '../init';

// Phase 3 placeholder. Will expose products, stock levels per location,
// stock movements, and a part-consumption mutation called from the mobile app.
export const inventoryRouter = router({
  products: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(products)
      .where(and(eq(products.companyId, ctx.companyId), isNull(products.deletedAt)))
      .limit(500);
  }),
});
