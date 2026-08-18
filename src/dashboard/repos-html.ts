export const REPOS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Repositories — AuditEngine</title>
  <style>
    :root {
      --bg: #111;
      --text: #e5e5e5;
      --muted: #888;
      --card: #1a1a1a;
      --border: #333;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --green: #22c55e;
      --red: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    nav {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    nav .brand { font-weight: 700; font-size: 1.2rem; }
    nav a { color: var(--text); text-decoration: none; margin-left: 1rem; }
    nav a:hover { color: var(--accent); }
    main { max-width: 900px; margin: 0 auto; padding: 2rem 1.5rem; }
    h1 { margin: 0 0 1rem 0; font-size: 1.75rem; }
    .subtitle { color: var(--muted); margin-bottom: 1.5rem; }
    .hint { color: var(--muted); font-size: 0.85rem; margin-bottom: 1.5rem; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .repo-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--border);
    }
    .repo-row:last-child { border-bottom: none; }
    .repo-url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; word-break: break-all; }
    .repo-meta { color: var(--muted); font-size: 0.8rem; margin-top: 0.2rem; }
    .btn {
      padding: 0.5rem 1rem;
      background: var(--accent);
      color: #fff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn.secondary { background: transparent; border: 1px solid var(--border); color: var(--text); }
    #error { color: var(--red); margin-bottom: 1rem; }
    #addForm { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    #addForm input { flex: 1; min-width: 220px; padding: 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); }
    .empty { color: var(--muted); }
  </style>
</head>
<body>
  <nav>
    <div class="brand">AuditEngine</div>
    <div>
      <a href="/">Home</a>
      <a href="/repos">Repos</a>
      <a href="/audits">Audits</a>
      <a href="/audit/new">New Audit</a>
      <a href="/dashboard">Dashboard</a>
      <a href="/settings">Settings</a>
      <a href="#" id="logout">Logout</a>
    </div>
  </nav>

  <main>
    <h1>Repositories</h1>
    <p class="subtitle">Audited repositories. Click <strong>Audit</strong> to start a new run, or add a new repo URL below.</p>

    <div class="card">
      <form id="addForm">
        <input id="newRepoUrl" type="text" placeholder="https://github.com/owner/repo" required />
        <button class="btn" type="submit">Add Repo</button>
      </form>
      <p class="hint">Adding a repo only bookmarks it here. You still choose the branch on the audit start page.</p>
    </div>

    <div id="error"></div>
    <div id="repos" class="card"></div>
  </main>

  <script>
    const token = localStorage.getItem('auditengine_token');
    const tenantId = localStorage.getItem('auditengine_tenant');
    if (!token || !tenantId) location.href = '/login';

    document.getElementById('logout').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('auditengine_token');
      localStorage.removeItem('auditengine_tenant');
      location.href = '/login';
    });

    const reposContainer = document.getElementById('repos');
    const errorEl = document.getElementById('error');

    function render(repos) {
      if (!repos || repos.length === 0) {
        reposContainer.innerHTML = '<p class="empty">No repositories yet. Add one above or start an audit from /audit/new.</p>';
        return;
      }
      reposContainer.innerHTML = repos.map((r, i) => \`
        <div class="repo-row">
          <div>
            <div class="repo-url">\${r.url}</div>
            <div class="repo-meta">Last audit: \${r.lastAuditId || '—'} · \${r.auditCount} run\${r.auditCount === 1 ? '' : 's'}</div>
          </div>
          <a class="btn" href="/audit/new?repo=\${encodeURIComponent(r.url)}">Audit</a>
        </div>
      \`).join('');
    }

    async function load() {
      try {
        const res = await fetch('/api/v1/tenants/' + tenantId + '/audits', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('Failed to load audits');
        const data = await res.json();
        const audits = data.audits || [];
        const map = new Map();
        for (const a of audits) {
          if (!a.repo_url) continue;
          const existing = map.get(a.repo_url);
          if (!existing || a.created_at > existing.created_at) {
            map.set(a.repo_url, { ...a, count: (existing?.count || 0) + 1 });
          } else {
            existing.count++;
          }
        }
        const repos = Array.from(map.entries()).map(([url, a]) => ({
          url,
          lastAuditId: a.id,
          auditCount: a.count,
          created_at: a.created_at,
        })).sort((a, b) => b.created_at - a.created_at);
        render(repos);
      } catch (err) {
        errorEl.textContent = err.message;
      }
    }

    document.getElementById('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = document.getElementById('newRepoUrl').value.trim();
      if (!url) return;
      location.href = '/audit/new?repo=' + encodeURIComponent(url);
    });

    load();
  </script>
</body>
</html>
`