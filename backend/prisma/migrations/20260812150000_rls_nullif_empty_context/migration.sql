-- Harden the tenant-isolation policies for the "no tenant context" case.
--
-- `current_setting('app.current_tenant_id', true)` returns NULL when the GUC was
-- never set — but after a `SET LOCAL` in the same pooled session it reverts to the
-- empty string '' (not NULL). Casting ''::uuid raises
--   "invalid input syntax for type uuid".
-- `NULLIF(..., '')` normalises both the unset and the reverted-empty cases to NULL,
-- so a query with no tenant context safely matches ZERO rows instead of erroring.
--
-- Behaviour for a normal (set) context is unchanged.

ALTER POLICY tenant_isolation ON "users"
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON "guests"
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON "conversations"
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON "messages"
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON "tickets"
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON "devices"
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER POLICY tenant_isolation ON "device_alerts"
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
