export const AUDIT_LIST_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Audits — AuditEngine</title>
  <style>
    :root {
      --bg: #111;
      --text: #e5e5e5;
      --muted: #888;
      --card: #1a1a1a;
      --border: #333;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --red: #ef4444;
      --green: #22c55e;
      --yellow: #eab308;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      background: var(--bg);
      color: var(--text);
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
    main { padding: 1.5rem; }
    h1 { margin: 0 0 1rem 0; font-size: 1.25rem; }
    #error { color: var(--red); margin-bottom: 1rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    th, td { text-align: left; padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .score { font-weight: 600; }
    .score.high { color: var(--green); }
    .score.medium { color: var(--yellow); }
    .score.low { color: var(--red); }
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
    <h1>Audits <span id="tenant" class="muted"></span></h1>
    <div id="error"></div>
    <table>
      <thead>
        <tr><th>ID</th><th>Repo URL</th><th>Status</th><th>Score</th><th>Files</th><th>Findings</th><th>Actions</th></tr>
      </thead>
      <tbody id="audits"></tbody>
    </table>
    <style>
      .status.failed { color: var(--red); font-weight: 600; }
      .failure-reason { color: var(--muted); font-size: 0.75rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    </style>
    <p id="empty" class="empty" style="display:none">No audits found.</p>
  </main>
  <script>
    const token = localStorage.getItem('auditengine_token');
    const tenantId = localStorage.getItem('auditengine_tenant');
    if (!token || !tenantId) location.href = '/login';

    document.getElementById('tenant').textContent = '— ' + tenantId;
    document.getElementById('logout').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('auditengine_token');
      localStorage.removeItem('auditengine_tenant');
      location.href = '/login';
    });

    async function load() {
      try {
        const res = await fetch('/api/v1/tenants/' + tenantId + '/audits', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('Failed to load audits');
        const data = await res.json();
        const tbody = document.getElementById('audits');
        const empty = document.getElementById('empty');
        if (!data.audits || data.audits.length === 0) {
          tbody.innerHTML = '';
          empty.style.display = 'block';
          return;
        }
        empty.style.display = 'none';
        tbody.innerHTML = data.audits.map(a => {
          const scoreClass = a.readiness_score >= 80 ? 'high' : a.readiness_score >= 50 ? 'medium' : 'low';
          const failureReason = a.status === 'failed' && data.failures && data.failures[a.id]
            ? \`<div class="failure-reason" title="\${data.failures[a.id]}">\${data.failures[a.id]}</div>\`
            : '';
          return \`
            <tr>
              <td>\${a.id}</td>
              <td>\${a.repo_url || '—'}</td>
              <td><span class="status \${a.status}">\${a.status}</span>\${failureReason}</td>
              <td class="score \${scoreClass}">\${a.readiness_score ?? 0}</td>
              <td>\${a.files_analyzed ?? 0} / \${a.total_files ?? 0}</td>
              <td>\${a.findings_count ?? 0}</td>
              <td>
                <a href="/task-board?audit_run_id=\${a.id}">Board</a> ·
                <a href="/finding?audit_run_id=\${a.id}">Findings</a>
              </td>
            </tr>
          \`;
        }).join('');
      } catch (err) {
        document.getElementById('error').textContent = err.message;
      }
    }
    function decorateNavLinks() {
      const auditRunId = localStorage.getItem('auditengine_audit_run_id');
      document.querySelectorAll('nav a').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href === '#' || href.startsWith('http')) return;
        const u = new URL(href, location.origin);
        if (auditRunId) u.searchParams.set('audit_run_id', auditRunId);
        a.href = u.pathname + u.search;
      });
    }

    load();
    decorateNavLinks();
  </script>
</body>
</html>`
