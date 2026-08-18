-- Migration v9: provider-specific OAuth tokens per tenant
ALTER TABLE tenants ADD COLUMN github_token TEXT DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN gitlab_token TEXT DEFAULT NULL;
ALTER TABLE tenants ADD COLUMN bitbucket_token TEXT DEFAULT NULL;
