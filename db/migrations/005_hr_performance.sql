BEGIN;
-- CABO Human Capital | human-supervised employment records
CREATE TABLE IF NOT EXISTS employees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 employee_code text NOT NULL CHECK(length(employee_code) BETWEEN 2 AND 50),
 full_name text NOT NULL CHECK(length(full_name) BETWEEN 2 AND 160),
 work_email text NOT NULL CHECK(length(work_email) BETWEEN 6 AND 254),
 department text NOT NULL DEFAULT '',
 job_title text NOT NULL DEFAULT '',
 employment_status text NOT NULL DEFAULT 'active' CHECK(employment_status IN ('active','on_leave','exited')),
 start_date date NOT NULL,
 exit_date date,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,employee_code),
 UNIQUE(tenant_id,work_email),
 CONSTRAINT employees_exit_date_check CHECK(exit_date IS NULL OR exit_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_id_unique ON employees(tenant_id,id);
CREATE INDEX IF NOT EXISTS employees_tenant_status_idx ON employees(tenant_id,employment_status,created_at DESC);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 employee_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 4 AND 200),
 category text NOT NULL CHECK(category IN ('documents','it','orientation','training','other')),
 due_date date,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','waived')),
 completion_note text,
 completed_by uuid REFERENCES users(id),
 completed_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT onboarding_employee_tenant_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS onboarding_tenant_employee_idx ON onboarding_tasks(tenant_id,employee_id,status);

CREATE TABLE IF NOT EXISTS leave_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 employee_id uuid NOT NULL,
 leave_type text NOT NULL CHECK(leave_type IN ('annual','sick','family_responsibility','study','unpaid','other')),
 start_date date NOT NULL,
 end_date date NOT NULL,
 employee_note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 decision_reason text,
 decided_by uuid REFERENCES users(id),
 decided_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT leave_date_check CHECK(end_date >= start_date),
 CONSTRAINT leave_employee_tenant_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS leave_tenant_status_idx ON leave_requests(tenant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS performance_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 employee_id uuid NOT NULL,
 period_label text NOT NULL CHECK(length(period_label) BETWEEN 3 AND 80),
 summary text NOT NULL CHECK(length(summary) BETWEEN 20 AND 6000),
 achievements text NOT NULL DEFAULT '',
 development_areas text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','finalized')),
 employee_acknowledged_at timestamptz,
 finalized_at timestamptz,
 reviewer_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT performance_employee_tenant_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS performance_tenant_employee_idx ON performance_reviews(tenant_id,employee_id,created_at DESC);

CREATE TABLE IF NOT EXISTS development_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 employee_id uuid NOT NULL,
 review_id uuid,
 goal text NOT NULL CHECK(length(goal) BETWEEN 12 AND 1200),
 actions text NOT NULL CHECK(length(actions) BETWEEN 12 AND 4000),
 success_measure text NOT NULL CHECK(length(success_measure) BETWEEN 8 AND 1500),
 target_date date,
 progress_note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in_progress','completed','paused')),
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT development_employee_tenant_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS performance_reviews_tenant_id_unique ON performance_reviews(tenant_id,id);
ALTER TABLE development_plans ADD CONSTRAINT development_review_tenant_fk FOREIGN KEY(tenant_id,review_id) REFERENCES performance_reviews(tenant_id,id);
CREATE INDEX IF NOT EXISTS development_tenant_employee_idx ON development_plans(tenant_id,employee_id,status);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_tenant ON employees USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY onboarding_tenant ON onboarding_tasks USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY leave_tenant ON leave_requests USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY performance_tenant ON performance_reviews USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
ALTER TABLE development_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE development_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY development_tenant ON development_plans USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
COMMIT;
