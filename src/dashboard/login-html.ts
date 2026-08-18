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
  </style>
</head>
<body>
  <div class="card">
    <h1>AuditEngine</h1>
    <p>Enter your tenant JWT token to continue.</p>
    <p style="font-size: 0.8rem; color: var(--muted);">Admins: create a tenant and get a token from <a href="/settings" style="color: var(--accent);">/settings</a>.</p>
    <form id="loginForm">
      <label for="token">JWT Token</label>
      <input id="token" type="password" autocomplete="off" placeholder="paste token here" required />
      <button type="submit">Continue</button>
      <div id="error" class="error"></div>
    </form>
  </div>
  <script>
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('error');
    const tokenInput = document.getElementById('token');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.remove('active');
      const token = tokenInput.value.trim();
      if (!token) return;

      try {
        const res = await fetch('/api/v1/tenant', {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Invalid token');
        localStorage.setItem('auditengine_token', token);
        location.href = '/tenants';
      } catch (err) {
        errorEl.textContent = err.message || 'Login failed';
        errorEl.classList.add('active');
      }
    });
  </script>
</body>
</html>`
