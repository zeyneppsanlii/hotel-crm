# Hotel CRM & Infrastructure Monitoring

A multi-tenant SaaS platform for hotels to manage guest communication, service
requests, and IoT infrastructure from one place. Each hotel is an isolated
tenant; guests reach the hotel over WhatsApp, staff handle requests as tickets,
and the platform monitors on-site devices (cameras, sensors, card readers) in
real time.

> **Status: early scaffolding.** The backend is a NestJS application with Prisma
> wired up, the single-schema + RLS multi-tenant data model, and a tenant-context
> access layer. Most feature modules and the frontend are **designed but not yet
> built** — see the [Roadmap](#roadmap). Features below are marked accordingly.

## Features

| Feature | Status |
|---|---|
| Multi-tenancy (single schema + PostgreSQL Row-Level Security) | 🟡 Data model & access layer in place |
| Role-based access control (admin / manager / staff) | ⚪ Planned |
| WhatsApp guest messaging | ⚪ Planned |
| Service request ticketing (assign, prioritize, resolve) | ⚪ Planned |
| IoT device monitoring & alerts (heartbeat, severity) | ⚪ Planned |
| Real-time notifications (WebSocket) | ⚪ Planned |
| Reporting (tickets, devices, satisfaction) | ⚪ Planned |

🟢 done · 🟡 in progress · ⚪ planned

## Tech stack

**Backend (current)**
- [NestJS](https://nestjs.com/) — modular monolith, TypeScript
- [PostgreSQL](https://www.postgresql.org/) with **Row-Level Security** for tenant isolation
- [Prisma](https://www.prisma.io/) — ORM and migrations

**Backend (planned)**
- [Redis](https://redis.io/) — cache, rate limiting, pub/sub
- [Socket.io](https://socket.io/) — real-time events
- [Bull](https://docs.bullmq.io/) — background jobs (messaging, reports, health checks)
- [TimescaleDB](https://www.timescale.com/) — time-series storage for device telemetry

**Frontend (planned)**
- [Next.js 14](https://nextjs.org/) (App Router), TanStack Query, Zustand, React Hook Form, shadcn/ui, NextAuth

**Deployment (planned)**
- [Fly.io](https://fly.io/) (backend, frontend, Postgres), Upstash Redis, Tigris storage, Cloudflare, GitHub Actions CI/CD

## Architecture

- **Modular monolith**, written so bounded contexts can later be extracted into
  microservices. Modules talk only through service-layer APIs and event signals,
  never by reaching into each other's tables.
- **Layered per module:** Controller (HTTP/WebSocket + validation) → Service
  (business logic) → Prisma (data access).
- **Multi-tenancy — single schema + Row-Level Security (RLS).** All tenants share
  the `public` schema. `tenants` / `tenant_users` are shared; every tenant-scoped
  table carries a `tenant_id` column. Isolation is enforced **in the database** by
  RLS policies that read a per-request session variable (`app.current_tenant_id`),
  not by application-level `WHERE` clauses. A `TenantMiddleware` resolves the
  `x-tenant-id` header and a tenant-aware access layer runs each unit of work in a
  transaction that sets that variable (`SET LOCAL`), so feature modules just work
  with "the current tenant's data" and stay unaware of the mechanism.

  This replaced an earlier schema-per-tenant design; the trade-offs (Prisma
  compatibility, a single migration path, DB-enforced isolation, lower operational
  overhead) are documented in
  [`.docs/Backend_Architecture.md`](.docs/Backend_Architecture.md) §7.

## Getting started

Prerequisites: Node.js 20+, Docker, and npm.

```bash
# 1. Start local infrastructure (PostgreSQL :5432, Redis :6379) — from repo root
docker-compose up -d

# 2. Install backend dependencies
cd backend
npm install

# 3. Apply database migrations (creates tables + RLS policies)
npx prisma migrate dev

# 4. Run the development server (watch mode)
npm run start:dev
```

The API listens on `http://localhost:3000`. Tenant-scoped requests require an
`x-tenant-id` header; without it, tenant-scoped endpoints return a
`missing tenant context` error by design (RLS fails closed).

Other useful commands (run from `backend/`):

```bash
npm run build           # production build
npm run lint            # ESLint (auto-fix)
npm run test            # unit tests
npm run test:e2e        # end-to-end tests
npx prisma studio       # browse the database
```

## Project structure

```
hotel-crm/
├── backend/                     # NestJS API
│   ├── prisma/
│   │   ├── schema.prisma        # single-schema + RLS data model
│   │   └── migrations/          # SQL migrations (RLS policies in raw SQL)
│   └── src/
│       ├── common/tenant/       # tenant middleware + tenant-aware Prisma layer
│       ├── prisma/              # global PrismaService
│       └── users/               # example tenant-scoped module (smoke test)
├── .docs/                       # architecture design documents (see below)
└── docker-compose.yml           # local Postgres + Redis
```

> Note: `frontend/` is fully specified in the docs but not yet created.

## Documentation

Design documents live in [`.docs/`](.docs/) (written in Turkish). They describe
the **target** design — always verify against the code before assuming a feature
is implemented.

- [`Backend_Architecture.md`](.docs/Backend_Architecture.md) — modules, data model,
  multi-tenancy (single schema + RLS), API shape, JWT/RBAC, integrations.
- [`Frontend_Architecture.md`](.docs/Frontend_Architecture.md) — planned Next.js app.
- [`Deployment_Architecture.md`](.docs/Deployment_Architecture.md) — planned Fly.io deployment & CI/CD.

## Roadmap

Near-term, in order:

1. **Auth module** — JWT, guards, decorators; expand the `User` model
   (`password_hash`, `full_name`, `role`).
2. **Tenants module** — tenant CRUD and a `TenantGuard` that authorizes the
   current user against the requested tenant.
3. **Guests, conversations & WhatsApp** — messaging ingestion and real-time delivery.
4. **Tickets** — service-request lifecycle and assignment.
5. **Infrastructure** — device registration, heartbeats, and alerts.
