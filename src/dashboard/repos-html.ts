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
    main { max-width: 1000px; margin: 0 auto; padding: 2rem 1.5rem; }
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
      flex-wrap: wrap;
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
    .btn.secondary:hover { border-color: var(--accent); color: var(--accent); }
    .btn.danger { background: transparent; border: 1px solid var(--red); color: var(--red); }
    .btn.danger:hover { background: var(--red); color: #fff; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    #error { color: var(--red); margin-bottom: 1rem; }
    #addForm { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    #addForm input { flex: 1; min-width: 220px; padding: 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text); }
    .empty { color: var(--muted); }
    .inline {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .inline input {
      min-width: 120px;
      padding: 0.35rem 0.5rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text);
    }
    .inline label { font-size: 0.8rem; color: var(--muted); }
    .status {
      font-size: 0.7rem;
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      border: 1px solid var(--border);
    }
    .status.active { border-color: var(--green); color: var(--green); }
    .status.inactive { border-color: var(--muted); color: var(--muted); }
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
    <p class="subtitle">Bookmark repositories, set default branches, and start audits with one click.</p>

    <div class="card">
      <form id="addForm">
        <input id="newRepoUrl" type="text" placeholder="https://github.com/owner/repo" required />
        <input id="newRepoBranch" type="text" placeholder="main" value="main" />
        <button class="btn" type="submit">Add Repo</button>
      </form>
      <p class="hint">Bookmarks are tied to this tenant. The default branch is pre-filled on the audit start page.</p>
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
      localStorage.removeItem('auditengine_audit_run_id');
      location.href = '/login';
    });

    function decorateNavLinks() {
      const auditRunId = localStorage.getItem('auditengine_audit_run_id');
      if (!auditRunId) return;
      document.querySelectorAll('nav a').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href === '#' || href.startsWith('http')) return;
        const u = new URL(href, location.origin);
        u.searchParams.set('audit_run_id', auditRunId);
        a.href = u.pathname + u.search;
      });
    }
    decorateNavLinks();

    const reposContainer = document.getElementById('repos');
    const errorEl = document.getElementById('error');
    const basePath = '/api/v1/tenants/' + tenantId + '/repositories';

    function render(repos) {
      if (!repos || repos.length === 0) {
        reposContainer.innerHTML = '<p class="empty">No repositories bookmarked yet. Add one above.</p>';
        return;
      }
      reposContainer.innerHTML = repos.map(r => {
        const statusClass = r.is_active ? 'active' : 'inactive';
        const statusText = r.is_active ? 'active' : 'inactive';
        return \`
        <div class="repo-row" data-id="\${r.id}">
          <div>
            <div class="repo-url">\${escapeHtml(r.url)}</div>
            <div class="repo-meta">
              <span class="status \${statusClass}">\${statusText}</span> ·
              \${escapeHtml(r.provider || 'git')} ·
              \${escapeHtml(r.owner || '?')}/\${escapeHtml(r.repo || '?')} ·
              default: <input class="branch-input" data-id="\${r.id}" type="text" value="\${escapeHtml(r.default_branch || 'main')}" />
            </div>
          </div>
          <div class="actions">
            <a class="btn" href="/audit/new?repo=\${encodeURIComponent(r.url)}&branch=\${encodeURIComponent(r.default_branch || 'main')}">Audit all</a>
            <a class="btn secondary" href="/audit/new?repo=\${encodeURIComponent(r.url)}&branch=\${encodeURIComponent(r.default_branch || 'main')}&select=1">Audit files</a>
            <button class="btn secondary toggle-btn" data-id="\${r.id}">\${r.is_active ? 'Disable' : 'Enable'}</button>
            <button class="btn danger delete-btn" data-id="\${r.id}">Delete</button>
          </div>
        </div>
      \`;}).join('');

      reposContainer.querySelectorAll('.branch-input').forEach(input => {
        input.addEventListener('change', () => updateRepo(input.dataset.id, { default_branch: input.value.trim() || 'main' }));
      });
      reposContainer.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = repos.find(r => r.id === btn.dataset.id);
          if (row) updateRepo(btn.dataset.id, { is_active: !row.is_active });
        });
      });
      reposContainer.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteRepo(btn.dataset.id));
      });
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    async function load() {
      try {
        const res = await fetch(basePath, { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('Failed to load repositories');
        const data = await res.json();
        render(data.repositories || []);
      } catch (err) {
        errorEl.textContent = err.message;
      }
    }

    async function addRepo(url, defaultBranch) {
      try {
        const res = await fetch(basePath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ url, default_branch: defaultBranch })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add repository');
        document.getElementById('newRepoUrl').value = '';
        document.getElementById('newRepoBranch').value = 'main';
        load();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    }

    async function updateRepo(id, fields) {
      try {
        const res = await fetch(basePath + '/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify(fields)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
        load();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    }

    async function deleteRepo(id) {
      if (!confirm('Delete this bookmark?')) return;
      try {
        const res = await fetch(basePath + '/' + id, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token }
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Delete failed');
        }
        load();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    }

    document.getElementById('addForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = document.getElementById('newRepoUrl').value.trim();
      const branch = document.getElementById('newRepoBranch').value.trim() || 'main';
      if (!url) return;
      addRepo(url, branch);
    });

    load();
  </script>
</body>
</html>`
