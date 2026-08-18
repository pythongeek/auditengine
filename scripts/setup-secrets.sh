#!/bin/bash
echo "Setting AuditEngine secrets in Cloudflare..."
wrangler secret put KIMI_API_KEY
wrangler secret put MINIMAX_API_KEY
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put GITLAB_TOKEN
wrangler secret put GITLAB_CLIENT_SECRET
wrangler secret put BITBUCKET_TOKEN
wrangler secret put BITBUCKET_CLIENT_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put SEARCH_API_KEY
wrangler secret put ADMIN_PASSWORD
echo "Done."
