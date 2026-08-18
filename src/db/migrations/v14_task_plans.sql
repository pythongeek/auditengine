-- v14: AI-generated remediation plans on tasks
ALTER TABLE tasks ADD COLUMN plan_text TEXT;
ALTER TABLE tasks ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'none';
