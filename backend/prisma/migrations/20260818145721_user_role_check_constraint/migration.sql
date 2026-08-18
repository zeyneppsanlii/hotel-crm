-- HCRM-26: constrain the coarse RBAC tier at the database level.
--
-- `users.role` is a plain TEXT column (Prisma does not model it as an enum here,
-- because the fine-grained `permissions[]` is the source of truth and role only
-- seeds a default set). Without a constraint the DB would accept any string, so
-- a typo or a bad insert could persist an unknown role. This guarantees the
-- column only ever holds one of the three known tiers — regardless of which code
-- path writes it. Prisma does not manage CHECK constraints, so (like the RLS
-- policies) this lives in raw SQL and is kept in sync by hand.
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('admin', 'manager', 'staff'));
