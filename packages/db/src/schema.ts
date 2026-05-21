import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const baseColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

export const roleEnum = pgEnum('role', ['admin', 'dispatcher', 'technician', 'accounting']);
export const workOrderStatusEnum = pgEnum('work_order_status', [
  'draft',
  'scheduled',
  'en_route',
  'on_site',
  'paused',
  'completed',
  'invoiced',
  'cancelled',
]);
export const workOrderLineKindEnum = pgEnum('work_order_line_kind', ['labor', 'part', 'expense']);
export const workOrderEventKindEnum = pgEnum('work_order_event_kind', [
  'status_change',
  'photo',
  'signature',
  'note',
]);
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'partially_paid',
  'paid',
  'void',
]);
export const quoteStatusEnum = pgEnum('quote_status', [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
]);
export const stockLocationKindEnum = pgEnum('stock_location_kind', ['warehouse', 'truck']);
export const stockMovementReasonEnum = pgEnum('stock_movement_reason', [
  'receipt',
  'transfer',
  'consumption',
  'adjustment',
  'return',
]);
export const productKindEnum = pgEnum('product_kind', ['part', 'labor', 'service']);
export const poStatusEnum = pgEnum('po_status', [
  'draft',
  'sent',
  'partial_received',
  'received',
  'cancelled',
]);
export const qboSyncStatusEnum = pgEnum('qbo_sync_status', ['pending', 'synced', 'error']);
export const localeEnum = pgEnum('locale', ['fr', 'en']);

// ---------------------------------------------------------------------------
// Tenancy + identity
// ---------------------------------------------------------------------------

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  defaultLocale: localeEnum('default_locale').notNull().default('fr'),
  // QBO credentials are encrypted at the application layer before storage.
  qboCredentials: jsonb('qbo_credentials'),
  qboRealmId: varchar('qbo_realm_id', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const users = pgTable(
  'users',
  {
    ...baseColumns,
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 200 }),
    passwordHash: text('password_hash'),
    preferredLocale: localeEnum('preferred_locale').notNull().default('fr'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_company_email_idx').on(t.companyId, t.email)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    companyId: uuid('company_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export const customers = pgTable(
  'customers',
  {
    ...baseColumns,
    name: varchar('name', { length: 200 }).notNull(),
    qboId: varchar('qbo_id', { length: 50 }),
    billingAddress: jsonb('billing_address'),
    defaultTaxCodeId: uuid('default_tax_code_id'),
    languagePreference: localeEnum('language_preference').notNull().default('fr'),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    notes: text('notes'),
  },
  (t) => [
    index('customers_company_name_idx').on(t.companyId, t.name),
    uniqueIndex('customers_qbo_idx').on(t.companyId, t.qboId),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    ...baseColumns,
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    title: varchar('title', { length: 100 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (t) => [index('contacts_customer_idx').on(t.customerId)],
);

export const sites = pgTable(
  'sites',
  {
    ...baseColumns,
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }),
    address: jsonb('address').notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    accessNotes: text('access_notes'),
  },
  (t) => [index('sites_customer_idx').on(t.customerId)],
);

// ---------------------------------------------------------------------------
// Field service
// ---------------------------------------------------------------------------

export const technicians = pgTable(
  'technicians',
  {
    ...baseColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skills: text('skills').array().notNull().default(sql`'{}'::text[]`),
    truckStockLocationId: uuid('truck_stock_location_id'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('technicians_user_idx').on(t.userId)],
);

export const workOrders = pgTable(
  'work_orders',
  {
    ...baseColumns,
    number: varchar('number', { length: 30 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    siteId: uuid('site_id').references(() => sites.id),
    status: workOrderStatusEnum('status').notNull().default('draft'),
    priority: integer('priority').notNull().default(0),
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
    assignedTechnicianId: uuid('assigned_technician_id').references(() => technicians.id),
    description: text('description'),
    internalNotes: text('internal_notes'),
  },
  (t) => [
    uniqueIndex('work_orders_company_number_idx').on(t.companyId, t.number),
    index('work_orders_status_scheduled_idx').on(t.companyId, t.status, t.scheduledStart),
    index('work_orders_tech_scheduled_idx').on(t.assignedTechnicianId, t.scheduledStart),
  ],
);

export const workOrderLines = pgTable(
  'work_order_lines',
  {
    ...baseColumns,
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    kind: workOrderLineKindEnum('kind').notNull(),
    productId: uuid('product_id').references(() => products.id),
    description: text('description'),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('work_order_lines_wo_idx').on(t.workOrderId)],
);

// Append-only event log for work orders (status, photo, signature, notes).
export const workOrderEvents = pgTable(
  'work_order_events',
  {
    ...baseColumns,
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    kind: workOrderEventKindEnum('kind').notNull(),
    actorId: uuid('actor_id').references(() => users.id),
    payload: jsonb('payload').notNull(),
    r2Key: text('r2_key'),
  },
  (t) => [index('work_order_events_wo_idx').on(t.workOrderId, t.createdAt)],
);

export const timeEntries = pgTable(
  'time_entries',
  {
    ...baseColumns,
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    technicianId: uuid('technician_id')
      .notNull()
      .references(() => technicians.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    billable: boolean('billable').notNull().default(true),
    notes: text('notes'),
  },
  (t) => [index('time_entries_wo_idx').on(t.workOrderId)],
);

// ---------------------------------------------------------------------------
// Sales: quotes, invoices, payments
// ---------------------------------------------------------------------------

export const quotes = pgTable(
  'quotes',
  {
    ...baseColumns,
    number: varchar('number', { length: 30 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    siteId: uuid('site_id').references(() => sites.id),
    status: quoteStatusEnum('status').notNull().default('draft'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
    gst: numeric('gst', { precision: 12, scale: 2 }).notNull().default('0'),
    qst: numeric('qst', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
    customerAcceptToken: text('customer_accept_token'),
  },
  (t) => [uniqueIndex('quotes_company_number_idx').on(t.companyId, t.number)],
);

export const quoteLines = pgTable('quote_lines', {
  ...baseColumns,
  quoteId: uuid('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),
  description: text('description'),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const invoices = pgTable(
  'invoices',
  {
    ...baseColumns,
    number: varchar('number', { length: 30 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    workOrderId: uuid('work_order_id').references(() => workOrders.id),
    quoteId: uuid('quote_id').references(() => quotes.id),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
    gst: numeric('gst', { precision: 12, scale: 2 }).notNull().default('0'),
    qst: numeric('qst', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),
    amountPaid: numeric('amount_paid', { precision: 12, scale: 2 }).notNull().default('0'),
    qboId: varchar('qbo_id', { length: 50 }),
  },
  (t) => [
    uniqueIndex('invoices_company_number_idx').on(t.companyId, t.number),
    index('invoices_status_issued_idx').on(t.companyId, t.status, t.issuedAt),
  ],
);

export const invoiceLines = pgTable('invoice_lines', {
  ...baseColumns,
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),
  description: text('description'),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const payments = pgTable(
  'payments',
  {
    ...baseColumns,
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
    method: varchar('method', { length: 50 }),
    reference: varchar('reference', { length: 100 }),
    qboId: varchar('qbo_id', { length: 50 }),
  },
  (t) => [index('payments_invoice_idx').on(t.invoiceId)],
);

// ---------------------------------------------------------------------------
// Catalog + inventory
// ---------------------------------------------------------------------------

export const products = pgTable(
  'products',
  {
    ...baseColumns,
    sku: varchar('sku', { length: 60 }).notNull(),
    nameFr: varchar('name_fr', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }),
    kind: productKindEnum('kind').notNull(),
    defaultPrice: numeric('default_price', { precision: 12, scale: 2 }).notNull().default('0'),
    defaultTaxCodeId: uuid('default_tax_code_id'),
    qboItemId: varchar('qbo_item_id', { length: 50 }),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('products_company_sku_idx').on(t.companyId, t.sku)],
);

export const stockLocations = pgTable('stock_locations', {
  ...baseColumns,
  name: varchar('name', { length: 100 }).notNull(),
  kind: stockLocationKindEnum('kind').notNull(),
  technicianId: uuid('technician_id').references(() => technicians.id),
});

export const stockLevels = pgTable(
  'stock_levels',
  {
    ...baseColumns,
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id),
    quantityOnHand: numeric('quantity_on_hand', { precision: 12, scale: 3 })
      .notNull()
      .default('0'),
    reorderPoint: numeric('reorder_point', { precision: 12, scale: 3 }),
  },
  (t) => [uniqueIndex('stock_levels_product_location_idx').on(t.productId, t.locationId)],
);

// Append-only stock ledger. Sum by location = current quantity_on_hand.
export const stockMovements = pgTable(
  'stock_movements',
  {
    ...baseColumns,
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    fromLocationId: uuid('from_location_id').references(() => stockLocations.id),
    toLocationId: uuid('to_location_id').references(() => stockLocations.id),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    reason: stockMovementReasonEnum('reason').notNull(),
    workOrderId: uuid('work_order_id').references(() => workOrders.id),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id),
    actorId: uuid('actor_id').references(() => users.id),
  },
  (t) => [index('stock_movements_product_idx').on(t.productId, t.createdAt)],
);

export const suppliers = pgTable(
  'suppliers',
  {
    ...baseColumns,
    name: varchar('name', { length: 200 }).notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    address: jsonb('address'),
    notes: text('notes'),
  },
  (t) => [index('suppliers_company_name_idx').on(t.companyId, t.name)],
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    ...baseColumns,
    number: varchar('number', { length: 30 }).notNull(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    status: poStatusEnum('status').notNull().default('draft'),
    expectedDate: timestamp('expected_date', { withTimezone: true }),
    notes: text('notes'),
  },
  (t) => [uniqueIndex('po_company_number_idx').on(t.companyId, t.number)],
);

export const poLines = pgTable('po_lines', {
  ...baseColumns,
  purchaseOrderId: uuid('purchase_order_id')
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
  quantityReceived: numeric('quantity_received', { precision: 12, scale: 3 })
    .notNull()
    .default('0'),
});

export const poReceipts = pgTable(
  'po_receipts',
  {
    ...baseColumns,
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    receivedBy: uuid('received_by').references(() => users.id),
    notes: text('notes'),
  },
  (t) => [index('po_receipts_po_idx').on(t.purchaseOrderId)],
);

// ---------------------------------------------------------------------------
// Tax (GST/QST)
// ---------------------------------------------------------------------------

export const taxCodes = pgTable(
  'tax_codes',
  {
    ...baseColumns,
    code: varchar('code', { length: 30 }).notNull(),
    nameFr: varchar('name_fr', { length: 100 }).notNull(),
    nameEn: varchar('name_en', { length: 100 }),
    gstRate: numeric('gst_rate', { precision: 6, scale: 5 }).notNull().default('0'),
    qstRate: numeric('qst_rate', { precision: 6, scale: 5 }).notNull().default('0'),
    qboTaxCodeId: varchar('qbo_tax_code_id', { length: 50 }),
  },
  (t) => [uniqueIndex('tax_codes_company_code_idx').on(t.companyId, t.code)],
);

// ---------------------------------------------------------------------------
// QBO sync state
// ---------------------------------------------------------------------------

export const qboSyncState = pgTable(
  'qbo_sync_state',
  {
    ...baseColumns,
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    localId: uuid('local_id').notNull(),
    qboId: varchar('qbo_id', { length: 50 }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncToken: varchar('last_sync_token', { length: 50 }),
    status: qboSyncStatusEnum('status').notNull().default('pending'),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('qbo_sync_entity_local_idx').on(t.companyId, t.entityType, t.localId),
    uniqueIndex('qbo_sync_entity_qbo_idx').on(t.companyId, t.entityType, t.qboId),
  ],
);

export const qboWebhookEvents = pgTable(
  'qbo_webhook_events',
  {
    ...baseColumns,
    payload: jsonb('payload').notNull(),
    signature: text('signature'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [index('qbo_webhook_processed_idx').on(t.companyId, t.processedAt)],
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    ...baseColumns,
    actorId: uuid('actor_id').references(() => users.id),
    entity: varchar('entity', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar('action', { length: 30 }).notNull(),
    diff: jsonb('diff'),
  },
  (t) => [index('audit_log_entity_idx').on(t.companyId, t.entity, t.entityId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const customersRelations = relations(customers, ({ many }) => ({
  contacts: many(contacts),
  sites: many(sites),
  workOrders: many(workOrders),
  invoices: many(invoices),
  quotes: many(quotes),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  customer: one(customers, { fields: [workOrders.customerId], references: [customers.id] }),
  site: one(sites, { fields: [workOrders.siteId], references: [sites.id] }),
  assignedTechnician: one(technicians, {
    fields: [workOrders.assignedTechnicianId],
    references: [technicians.id],
  }),
  lines: many(workOrderLines),
  events: many(workOrderEvents),
  timeEntries: many(timeEntries),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  workOrder: one(workOrders, { fields: [invoices.workOrderId], references: [workOrders.id] }),
  lines: many(invoiceLines),
  payments: many(payments),
}));
