import { router } from './init';
import { customersRouter } from './routers/customers';
import { workOrdersRouter } from './routers/work-orders';
import { invoicesRouter } from './routers/invoices';
import { inventoryRouter } from './routers/inventory';

export const appRouter = router({
  customers: customersRouter,
  workOrders: workOrdersRouter,
  invoices: invoicesRouter,
  inventory: inventoryRouter,
});

export type AppRouter = typeof appRouter;
