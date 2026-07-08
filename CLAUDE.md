# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Hotel CRM / infrastructure-monitoring SaaS, in early scaffolding. Only `backend/` exists: an unmodified NestJS starter plus a Prisma module wired into `AppModule`. No feature modules (`auth`, `tenants`, `users`, `guests`, `conversations`, `tickets`, `infrastructure`, `reports`, `notifications`) are implemented yet, and there is no `frontend/` directory despite it being fully specified in the docs.

Treat `.docs/*.md` as the **target design, not a description of existing code** — always verify against `backend/src` before assuming something is implemented. The docs are written in Turkish; write code and this file in English.

- `.docs/Backend_Architecture.md` — NestJS modular monolith, schema-per-tenant multi-tenancy, Prisma/PostgreSQL, Redis, Socket.io, Bull queues, planned modules, REST API shape, JWT/RBAC design, WhatsApp + IoT device integrations.
- `.docs/Frontend_Architecture.md` — planned Next.js 14 App Router app, multi-tenant routing (`/[tenantId]/...`), TanStack Query + Zustand + React Hook Form, shadcn/ui, Socket.io client, NextAuth.
- `.docs/Deployment_Architecture.md` — Fly.io (backend + frontend + Postgres), Upstash Redis, Tigris storage, Cloudflare, GitHub Actions CI/CD.

**Current focus (next up):** (1) a `/users` GET endpoint to verify the Prisma wiring, (2) the `auth` module (JWT, guards, decorators), (3) the `tenants` module (tenant-context middleware, schema switching).

## Conventions & architecture decisions

- **Modular monolith, written for a future microservices split.** Keep each module a self-contained bounded context: modules communicate only through service-layer APIs — never by reaching into another module's internals or tables — and prefer event-driven signals for cross-module side effects. This keeps later extraction into services cheap.
- **Layered per module:** Controller (HTTP/WebSocket + validation) → Service (business logic, transactions) → Prisma (data access). Never put database queries in controllers, and keep business logic out of controllers.
- **Module shape** (per `Backend_Architecture.md` §6.1): `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` (`create-*.dto.ts`, `update-*.dto.ts`), `entities/`. Scaffold with `nest g` to keep this consistent.
- **Dependency injection** everywhere (`@Injectable`, constructor injection) for testability and loose coupling.
- **RBAC** using the role tiers defined in `Backend_Architecture.md` (admin / manager / staff — the doc is authoritative). Guard mutations by role.
- **Multi-tenancy (designed, not yet built):** schema-per-tenant. A shared `public` schema holds `tenants` / `tenant_users`; each tenant gets its own Postgres schema with a full copy of the tenant-scoped tables. Requests carry an `x-tenant-id` header; a `TenantMiddleware` / `TenantGuard` resolves and authorizes tenant context per request.

## Current code (grounded — verify here, not against the docs)

- **`PrismaModule` is `@Global()`** (`backend/src/prisma/prisma.module.ts`) and exports `PrismaService`, which extends `PrismaClient` and connects/disconnects on module init/destroy. Any module can inject `PrismaService` without importing `PrismaModule` directly.
- **`backend/prisma/schema.prisma` has only a placeholder `User` model** — it does not yet reflect the multi-tenant schema described in the docs (`tenants`, `tenant_users`, per-tenant `users`/`guests`/`conversations`/`messages`/`tickets`/`devices`/`device_alerts`).
- **`backend/.env`** holds `DATABASE_URL`, pointing at the `docker-compose.yml` Postgres instance (user/db `hotelcrm` / `hotel_crm_dev`). Prisma does not auto-load `.env` here per the comment at the top of that file — read it before changing env handling.
- **Linting:** ESLint flat config (`eslint.config.mjs`) uses `typescript-eslint` recommendedTypeChecked + prettier-recommended. Relaxed rules: `no-explicit-any` off; `no-floating-promises` / `no-unsafe-argument` are warnings, not errors.
- **Formatting:** Prettier — `singleQuote: true`, `trailingComma: all`.

## Commands

All commands run from `backend/` unless noted.

```bash
# install deps
npm install

# local infra (Postgres on :5432, Redis on :6379) — from repo root
docker-compose up -d

# dev server (watch mode)
npm run start:dev

# build / prod
npm run build
npm run start:prod

# lint (auto-fixes)
npm run lint

# format
npm run format

# tests
npm run test              # unit tests (*.spec.ts, colocated in src/)
npm run test:watch
npm run test:cov
npm run test:e2e          # e2e tests in test/, config test/jest-e2e.json
npm run test:debug

# run a single test file (unit)
npx jest path/to/file.spec.ts
# run a single test file (e2e)
npx jest --config ./test/jest-e2e.json path/to/file.e2e-spec.ts

# Prisma
npx prisma migrate dev --name <migration_name>
npx prisma generate
npx prisma studio
```
