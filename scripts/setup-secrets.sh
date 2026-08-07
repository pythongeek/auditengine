#!/bin/bash
echo "Setting AuditEngine secrets in Cloudflare..."
wrangler secret put KIMI_API_KEY
wrangler secret put MINIMAX_API_KEY
wrangler secret put GITHUB_TOKEN
wrangler secret put ADMIN_PASSWORD
echo "Done."
