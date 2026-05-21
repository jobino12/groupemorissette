# Groupe Morissette

Monorepo containing the public marketing site and the ERP being built for the
acquired field-service business.

## Structure

```
/                         marketing site (index.html, invest/) — served by GitHub Pages
apps/
  web/                    Next.js 15 ERP web app (target: app.groupemorissette.ca)
  mobile/                 Expo app for field technicians
packages/
  db/                     Drizzle ORM schema + Postgres client
  shared/                 GST/QST tax calculator, i18n catalogs, shared zod schemas
  qbo/                    QuickBooks Online sync client (Phase 2)
  ui/                     Shared UI primitives (shadcn)
```

The marketing site stays at the repo root so the existing GitHub Pages
deployment of `groupemorissette.ca` keeps working without any settings change.

## Quick start

```bash
# Install everything
pnpm install

# Run the web ERP
cp apps/web/.env.example apps/web/.env.local   # then fill DATABASE_URL + NEXTAUTH_SECRET
pnpm --filter @gm/db generate                  # generate Drizzle migrations
pnpm --filter @gm/db migrate                   # apply to your Postgres
pnpm web                                       # http://localhost:3000

# Run shared package tests (tax math, etc.)
pnpm --filter @gm/shared test
```

## Build phases

The implementation plan is at `/root/.claude/plans/i-m-going-to-buy-shimmering-wadler.md`.

- **Phase 0 (current).** Foundation: monorepo wiring, Next.js shell with auth + i18n,
  Drizzle schema, GST/QST calculator, CI.
- **Phase 1.** CRM + Work Orders + mobile MVP for technicians.
- **Phase 2.** Invoicing + QuickBooks Online sync.
- **Phase 3.** Inventory + truck stock.
- **Phase 4.** Purchasing + customer-facing quotes.
- **Phase 5.** Calendar dispatch, reports, offline-queue hardening, audit log.

## Conventions

- All money stored as `numeric(12,2)` strings in Postgres. Compute in integer cents
  via `@gm/shared/money`. Format at the edge with `formatCAD`.
- All tables carry a `company_id` column so future multi-tenancy is a query-helper
  swap, not a rewrite.
- Tax math lives in **one place only**: `packages/shared/src/tax.ts`.
- French is the default locale. English is opt-in. Bill 96 compliance for customer-
  facing PDFs.

## Hosting (target)

- Web: Vercel → `app.groupemorissette.ca`
- DB: Neon (Postgres) with preview branches for QBO sandbox testing
- Jobs: Inngest Cloud (QBO sync, thumbnail generation)
- Files: Cloudflare R2 (photos, signatures, PDFs)
- Mobile: Expo EAS (builds + OTA updates)
- Errors: Sentry (web + RN + workers)
- Marketing: GitHub Pages (unchanged)
