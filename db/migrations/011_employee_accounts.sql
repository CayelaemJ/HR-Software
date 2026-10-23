BEGIN;
CREATE TABLE employee_accounts(
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 employee_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id),
 linked_by uuid NOT NULL REFERENCES users(id),
 linked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,employee_id),
 UNIQUE(tenant_id,user_id),
 FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
);
ALTER TABLE employee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_accounts_scope ON employee_accounts USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
