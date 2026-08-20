export const TENANT_SELECTOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tenants — AuditEngine</title>
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
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1rem;
    }
    .tenant {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
      cursor: pointer;
    }
    .tenant:hover { border-color: var(--accent); }
    .tenant .id { font-weight: 600; margin-bottom: 0.25rem; }
    .tenant .meta { color: var(--muted); font-size: 0.85rem; }
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
    <h1>Select Tenant</h1>
    <div id="error"></div>
    <div id="tenants" class="grid"></div>
  </main>
  <script>
    const token = localStorage.getItem('auditengine_token');
    if (!token) location.href = '/login';

    document.getElementById('logout').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('auditengine_token');
      localStorage.removeItem('auditengine_tenant');
      location.href = '/login';
    });

    async function load() {
      try {
        const res = await fetch('/api/v1/tenant', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('Failed to load tenant');
        const data = await res.json();
        const container = document.getElementById('tenants');
        if (!data.tenant) {
          container.innerHTML = '<p class="empty">No tenant found.</p>';
          return;
        }
        container.innerHTML = \`
          <div class="tenant" data-id="\${data.tenant.id}">
            <div class="id">\${data.tenant.id}</div>
            <div class="meta">plan: \${data.tenant.plan || 'free'}</div>
          </div>
        \`;
        container.querySelectorAll('.tenant').forEach(el => {
          el.addEventListener('click', () => {
            localStorage.setItem('auditengine_tenant', el.dataset.id);
            location.href = '/audits';
          });
        });
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
