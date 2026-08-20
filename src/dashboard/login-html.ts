export const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AuditEngine Login</title>
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
      display: grid;
      place-items: center;
      min-height: 100vh;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2rem;
      width: min(400px, 90vw);
    }
    h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
    p { color: var(--muted); margin: 0 0 1.5rem 0; font-size: 0.9rem; }
    label { display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--muted); }
    input {
      width: 100%;
      padding: 0.6rem 0.75rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text);
      font-family: inherit;
      font-size: 0.95rem;
      margin-bottom: 1rem;
    }
    input:focus { outline: none; border-color: var(--accent); }
    button {
      width: 100%;
      padding: 0.7rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: var(--accent-hover); }
    .error {
      color: var(--red);
      font-size: 0.85rem;
      margin-top: 0.75rem;
      display: none;
    }
    .error.active { display: block; }
    .token-mode {
      margin-top: 1rem;
      font-size: 0.8rem;
      color: var(--muted);
      text-align: center;
    }
    .token-mode a { color: var(--accent); }
  </style>
</head>
<body>
  <div class="card">
    <h1>AuditEngine</h1>
    <p>Sign in with your tenant email and password.</p>
    <form id="loginForm">
      <label for="tenantId">Tenant ID</label>
      <input id="tenantId" type="text" autocomplete="off" placeholder="tenant-abc123" required />
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="email" placeholder="you@example.com" required />
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
      <button type="submit">Sign In</button>
      <div id="error" class="error"></div>
    </form>
    <p class="token-mode">Admins: need a tenant token? Use <a href="/settings">/settings</a>.</p>
  </div>
  <script>
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.remove('active');
      const tenantId = document.getElementById('tenantId').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: tenantId, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        localStorage.setItem('auditengine_token', data.token);
        localStorage.setItem('auditengine_tenant', data.tenant.id);
        location.href = '/tenants';
      } catch (err) {
        errorEl.textContent = err.message || 'Login failed';
        errorEl.classList.add('active');
      }
    });
  </script>
</body>
</html>`
