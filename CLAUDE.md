# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Hotel CRM / infrastructure-monitoring SaaS, in early scaffolding. Only `backend/` exists: an unmodified NestJS starter plus a Prisma module wired into `AppModule`. No feature modules (`auth`, `tenants`, `users`, `guests`, `conversations`, `tickets`, `infrastructure`, `reports`, `notifications`) are implemented yet, and there is no `frontend/` directory despite it being fully specified in the docs.

Treat `.docs/*.md` as the **target design, not a description of existing code** — always verify against `backend/src` before assuming something is implemented. The docs are written in Turkish; write code and this file in English.

- `.docs/Backend_Architecture.md` — NestJS modular monolith, single-schema + Row-Level Security (RLS) multi-tenancy, Prisma/PostgreSQL, Redis, Socket.io, Bull queues, planned modules, REST API shape, JWT/RBAC design, WhatsApp + IoT device integrations.
- `.docs/Frontend_Architecture.md` — planned Next.js 14 App Router app, multi-tenant routing (`/[tenantId]/...`), TanStack Query + Zustand + React Hook Form, shadcn/ui, Socket.io client, NextAuth.
- `.docs/Deployment_Architecture.md` — Fly.io (backend + frontend + Postgres), Upstash Redis, Tigris storage, Cloudflare, GitHub Actions CI/CD.
- `.docs/RLS_Policies.md` — **implemented** RLS runbook (not target design): the two-role model, policy shape, gotchas, and the checklist for adding a new tenant-scoped table without drift.

**Work is tracked in Jira (HCRM board, active sprint "SCRUM Sprint 0"); current focus follows sprint order.**

**Next up:** close the E3 auth gaps (HCRM-26/27/28) — refresh token, bcrypt cost 12, role DB constraint, automated auth tests.

_Done / in progress:_ HCRM-20 (config + env validation via `ConfigModule`/zod) ✅, HCRM-21 (standard response envelope + `AllExceptionsFilter` + Prisma error mapping + `x-request-id`, e2e-tested) ✅, HCRM-22 (`/health` + structured pino logging with `requestId` and PII redaction, e2e-tested) ✅, and HCRM-23 (e2e test infra: a separate `hotel_crm_test` DB auto-provisioned in `test/setup/global-setup.ts` — create + migrate + RLS + app-role grants — plus tenant fixtures and a GitHub Actions CI workflow) ✅, and HCRM-24 (automated RLS isolation tests — `test/rls-isolation.e2e-spec.ts` proves read/write/update isolation across all 7 tenant tables, no-context→0 rows, FORCE-RLS flags, pool-context safety) ✅, and HCRM-25 (global `TenantGuard` — `src/auth/guards/tenant.guard.ts`, registered as an `APP_GUARD` between `JwtAuthGuard` and `PermissionsGuard`; rejects a valid token paired with another tenant's `x-tenant-id` header — 403 on mismatch, 400 when the header is missing — a defence-in-depth layer above RLS against cross-tenant token reuse; skips `@Public()` routes; unit-tested + e2e-tested in `test/tenant-guard.e2e-spec.ts`) ✅. Writing those tests caught a real gap: after a `SET LOCAL`, an unset context reverts to `''`, and `''::uuid` errored instead of returning 0 rows — hardened via `NULLIF(current_setting(...), '')::uuid` (migration `20260812150000_rls_nullif_empty_context`; see `.docs/RLS_Policies.md`). Auth module built (login, guards, per-user RBAC) — maps to HCRM-26/27/28, all _in progress_, not done: no refresh token, JWT payload uses the Model A single-tenant shape (not the docs' `tenants[]`), bcrypt cost 10 vs the required 12, no automated tests. See the Jira comments on those issues for the full gap list.

**Identity model (decided):** one user belongs to exactly one tenant — a person working at two hotels has two separate accounts (separate emails/passwords). Login therefore requires `x-tenant-id`. This is _not_ the multi-tenant-membership model the docs' JWT sketch implied; `tenant_users` was dropped as redundant. If a single-login-across-hotels feature is ever needed it's an additive layer (a membership table + a cross-tenant reporting path), not a rewrite.

## Conventions & architecture decisions

- **Modular monolith, written for a future microservices split.** Keep each module a self-contained bounded context: modules communicate only through service-layer APIs — never by reaching into another module's internals or tables — and prefer event-driven signals for cross-module side effects. This keeps later extraction into services cheap.
- **Layered per module:** Controller (HTTP/WebSocket + validation) → Service (business logic, transactions) → Prisma (data access). Never put database queries in controllers, and keep business logic out of controllers.
- **Module shape** (per `Backend_Architecture.md` §6.1): `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` (`create-*.dto.ts`, `update-*.dto.ts`), `entities/`. Scaffold with `nest g` to keep this consistent.
- **Dependency injection** everywhere (`@Injectable`, constructor injection) for testability and loose coupling.
- **RBAC — two levels** (`src/auth/permissions.ts`): a coarse `role` (admin / manager / staff) and a fine-grained per-user `permissions` string list (`resource:action`, e.g. `guests:view`, `network:edit`). The role seeds a default permission set at user creation; the `permissions` column is the source of truth, so two same-role users can differ. Guard routes with `@RequirePermissions(...)` (enforced by the global `PermissionsGuard`); `admin` bypasses all checks.
- **Multi-tenancy (designed, being built):** single schema + PostgreSQL Row-Level Security (RLS) — **not** schema-per-tenant / `search_path`. All tenants share the `public` schema; `tenants` / `tenant_users` are shared (no RLS), and every tenant-scoped table carries a `tenant_id uuid` column. Isolation is enforced in the database by RLS policies reading `current_setting('app.current_tenant_id')`, not by application-level `WHERE` clauses. Requests carry an `x-tenant-id` header; a `TenantMiddleware` resolves it, and a tenant-aware access layer runs each unit of work inside a transaction that first sets `app.current_tenant_id` (via `SET LOCAL` / `set_config(..., true)`). Feature modules stay ignorant of the mechanism — they only work with "the current tenant's data". (`tenants` is the only shared, non-RLS table; the once-planned `tenant_users` was dropped — see the identity-model note above.) **RLS is only enforced for a role that is NOT superuser and NOT `BYPASSRLS` — `FORCE ROW LEVEL SECURITY` does not override that.** So the app runtime connects as a dedicated non-superuser role `hotelcrm_app` (`DATABASE_URL`); migrations/DDL run as the superuser `hotelcrm` via Prisma `directUrl` (`DIRECT_DATABASE_URL`). The role is provisioned by `docker/postgres/init/01-app-role.sql` (auto-runs on a fresh volume; apply by hand on an existing one — it is idempotent). Tenant tables also use `FORCE ROW LEVEL SECURITY` so even the table owner is subject to policies. Connecting the runtime as a superuser/owner makes isolation silently fail (every tenant sees every row) — this applies in every environment, not just locally. This replaced an earlier schema-per-tenant design (see `Backend_Architecture.md` §7.4) — moved for Prisma compatibility, a single migration path, DB-enforced isolation, and lower operational overhead.

## Strict Architecture & Coding Standards

### 1. Repository Pattern (No Direct ORM Calls in Services)

- Services (`*.service.ts`) MUST NOT directly call Prisma or define Prisma select objects (e.g. `PUBLIC_USER_SELECT`, `tx.user.findMany`).
- All database queries and Prisma operations must be encapsulated inside a dedicated Repository layer (e.g., `users.repository.ts`).
- Services must inject Repositories (`UsersRepository`) via constructor injection, keeping business logic clean and isolated from persistence details.

### 2. Avoid Primitive Obsession & Inline Types

- Avoid raw primitives (`id: string`, `email: string`) in domain/service method signatures when domain-specific types, DTOs, or Branded Types can be used (e.g., `UserId`, `UserEmail`, or proper DTO classes).
- DO NOT use inline object types or inline intersection types (e.g., `Request & { tenantId?: string }` or `{ id: string }`) inside service constructor parameters or method signatures.
- Always extract types and interfaces into dedicated `*.types.ts`, `*.interface.ts`, or DTO files inside the corresponding module.

## Current code (grounded — verify here, not against the docs)

- **`PrismaModule` is `@Global()`** (`backend/src/prisma/prisma.module.ts`) and exports `PrismaService`, which extends `PrismaClient` and connects/disconnects on module init/destroy. Any module can inject `PrismaService` without importing `PrismaModule` directly.
- **`backend/prisma/schema.prisma` models the single-schema + RLS design:** shared `Tenant` (no RLS) plus tenant-scoped `User`/`Guest`/`Conversation`/`Message`/`Ticket`/`Device`/`DeviceAlert`, each with a `tenant_id` column and `@@index([tenantId])`. `User` now carries `password_hash`, `full_name`, `role`, and a `permissions String[]` (per `Backend_Architecture.md` §8.2 + the RBAC note above); `Guest`…`DeviceAlert` are still schema-only, no feature modules yet. Prisma does **not** manage the RLS policies; they live in the migration's raw-SQL step and must be kept in sync by hand (see `.docs/RLS_Policies.md`).
- **Response contract** (`backend/src/common/http`, per HCRM-21): global `ResponseEnvelopeInterceptor` wraps every success as `{ success, data, meta: { timestamp, requestId } }`; global `AllExceptionsFilter` (`@Catch()`) maps every error to `{ success, error: { code, message, details }, meta }` (Prisma P2002→409 `DUPLICATE_RESOURCE`, P2025→404 `NOT_FOUND`; unknown→500 with the stack logged, never sent). `RequestIdMiddleware` assigns/echoes `x-request-id` (response header + envelope meta + logs). Return a `PaginatedResult` to populate `page/limit/total/hasMore` in `meta`. e2e: `test/response-contract.e2e-spec.ts`. **Consequence: every endpoint's payload is under `data` — clients read `res.body.data`, not the bare value.**
- **Health & logging** (per HCRM-22): `GET /health` (`backend/src/health`, `@Public`, **not** enveloped — raw body + status code) checks Postgres (`SELECT 1`) and Redis (`backend/src/redis` `RedisService.ping`), returning `{ status, uptime, version, checks: { postgres, redis } }` → 200 all up, 503 if any down. Logging is `nestjs-pino` (`config/logger.config.ts`, wired in `main.ts` via `useLogger`): JSON in prod, pretty in dev, every line carries `requestId`, and secrets/PII are redacted (authorization/cookie headers, password, token, email, phone). `ioredis` client lives in `RedisModule` (`@Global`).
- **Auth module** (`backend/src/auth`): `POST /auth/login` (needs `x-tenant-id`; resolves the user under RLS, verifies bcrypt hash, returns a JWT with `{sub,email,tenantId,role,permissions}`), `GET /auth/me`. Global `JwtAuthGuard` (all routes require a token unless `@Public()`) + `PermissionsGuard`, both registered as `APP_GUARD` in `app.module.ts`. `main.ts` loads `.env` via `dotenv/config` and installs a global `ValidationPipe` (whitelist + transform). First users are created by `prisma/seed.ts` (`npx prisma db seed`) as the superuser, since the create endpoint itself needs an authenticated admin.
- **`backend/.env`** holds two connection strings to the `docker-compose.yml` Postgres (`hotel_crm_dev`): `DATABASE_URL` as the non-superuser `hotelcrm_app` (runtime, RLS-enforced) and `DIRECT_DATABASE_URL` as the superuser `hotelcrm` (migrations, via `directUrl` in `schema.prisma`), plus `JWT_SECRET`/`JWT_EXPIRES_IN`/`REDIS_URL`/`PORT`/`NODE_ENV`. All are **validated at boot** by `ConfigModule` (`src/config/env.validation.ts`, zod) — a missing/malformed var aborts startup naming the offender. App code reads config via `ConfigService`, never `process.env` (e.g. `PrismaService` gets `DATABASE_URL` from it); the standalone `prisma/seed.ts` script is the one exception. `.env.example` documents every var. The Prisma **CLI** still loads `.env` on its own.
- **e2e test infra** (per HCRM-23): `npm run test:e2e` runs against a **separate** `hotel_crm_test` database (never dev data). `test/setup/global-setup.ts` provisions it once (create DB → `prisma migrate deploy` incl. RLS → `hotelcrm_app` role + grants via `docker/postgres/init/01-app-role.sql`); `test/setup/load-test-env.ts` loads `backend/.env.test` into each worker. Tests reset state with `resetDatabase()` (truncate) and seed via `test/helpers/fixtures.ts` (`seedTenant`/`seedUser`/`seedTwoTenants`, using a superuser `pg` pool that bypasses RLS). Runs serially (`maxWorkers: 1`) with `--forceExit`. Same setup runs in CI (`.github/workflows/ci.yml`, Postgres + Redis service containers). `test/tenancy.e2e-spec.ts` is a fixtures+RLS smoke test; the exhaustive isolation matrix is HCRM-24.
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
npx prisma db seed          # seed dev users (prisma/seed.ts); password: admin1234
```
