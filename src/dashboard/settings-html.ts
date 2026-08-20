export const SETTINGS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Settings — AuditEngine</title>
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
    main {
      max-width: 560px;
      margin: 0 auto;
      padding: 3rem 1.5rem;
    }
    h1 { margin: 0 0 0.5rem 0; }
    .subtitle { color: var(--muted); margin-bottom: 2rem; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
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
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    button {
      padding: 0.7rem 1.25rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: var(--accent-hover); }
    button.secondary { background: transparent; border: 1px solid var(--border); color: var(--text); }
    button.secondary:hover { border-color: var(--accent); }
    .status { font-size: 0.85rem; color: var(--muted); margin-top: 0.25rem; }
    .status.set { color: var(--green); }
    .status.unset { color: var(--red); }
    .message { margin-top: 1rem; font-size: 0.9rem; }
    .message.success { color: var(--green); }
    .message.error { color: var(--red); }
    .hint { color: var(--muted); font-size: 0.85rem; margin-top: 1rem; }
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
    </div>
  </nav>

  <main>
    <h1>Settings</h1>
    <p class="subtitle">Admin area: create tenants and configure provider API keys. Keys are encrypted at rest with <code>ENCRYPTION_KEY</code>.</p>

    <div class="card">
      <h2 style="margin: 0 0 1rem 0; font-size: 1.1rem;">Quick Start</h2>
      <ol style="margin: 0 0 1rem 1rem; padding-left: 1rem; color: var(--muted);">
        <li>Create a tenant below and copy the JWT token.</li>
        <li>Go to <a href="/login" style="color: var(--accent);">/login</a> and paste the token.</li>
        <li>Go to <a href="/audit/new" style="color: var(--accent);">/audit/new</a> and enter a repo URL.</li>
      </ol>
      <a class="btn" href="/audit/new">Start New Audit</a>
    </div>

    <div class="card">
      <label for="adminEmail">Admin email</label>
      <input id="adminEmail" type="email" placeholder="admin@example.com" />

      <label for="adminPassword">Admin password</label>
      <input id="adminPassword" type="password" placeholder="admin password" />

      <button id="loadBtn" class="secondary">Load current keys</button>
    </div>

    <div class="card">
      <label for="kimiKey">Kimi API key</label>
      <input id="kimiKey" type="password" placeholder="sk-..." autocomplete="off" />
      <div id="kimiStatus" class="status unset">Not loaded</div>

      <label for="minimaxKey">Minimax API key</label>
      <input id="minimaxKey" type="password" placeholder="..." autocomplete="off" />
      <div id="minimaxStatus" class="status unset">Not loaded</div>

      <button id="saveBtn">Save API keys</button>
      <div id="message" class="message"></div>
    </div>

    <div class="card">
      <h2 style="margin: 0 0 0.5rem 0; font-size: 1.1rem;">Git Provider Access</h2>
      <p class="hint" style="margin: 0 0 1rem 0;">
        Tokens let agents read and write to your repositories. Leave blank and save to remove.
      </p>

      <label for="githubToken">GitHub personal access token</label>
      <input id="githubToken" type="password" placeholder="ghp_..." autocomplete="off" />
      <div id="githubStatus" class="status unset">Not loaded</div>
      <p class="hint" style="margin-top: 0.25rem;">
        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" style="color: var(--accent);">Create token →</a>
        Required scopes: <code>repo</code> (full repository access) or <code>contents:write</code>, <code>pull_requests:write</code> for fine-grained tokens.
      </p>

      <label for="gitlabToken">GitLab personal access token</label>
      <input id="gitlabToken" type="password" placeholder="glpat-..." autocomplete="off" />
      <div id="gitlabStatus" class="status unset">Not loaded</div>
      <p class="hint" style="margin-top: 0.25rem;">
        <a href="https://gitlab.com/-/profile/personal_access_tokens" target="_blank" rel="noopener" style="color: var(--accent);">Create token →</a>
        Required scopes: <code>api</code>, <code>read_repository</code>, <code>write_repository</code>.
      </p>

      <label for="bitbucketToken">Bitbucket app password / access token</label>
      <input id="bitbucketToken" type="password" placeholder="..." autocomplete="off" />
      <div id="bitbucketStatus" class="status unset">Not loaded</div>
      <p class="hint" style="margin-top: 0.25rem;">
        <a href="https://bitbucket.org/account/settings/app-passwords/" target="_blank" rel="noopener" style="color: var(--accent);">Create app password →</a>
        Required permissions: <code>Repositories: Read</code>, <code>Repositories: Write</code>, <code>Pull requests: Write</code>.
      </p>

      <button id="saveGitBtn" class="secondary">Save Git tokens</button>
      <div id="gitMessage" class="message"></div>
    </div>

    <p class="hint">Leave a key blank and save to remove it. Environment secrets (<code>KIMI_API_KEY</code> / <code>MINIMAX_API_KEY</code> / <code>GITHUB_TOKEN</code> / <code>GITLAB_TOKEN</code> / <code>BITBUCKET_TOKEN</code>) take precedence when set.</p>

    <div class="card">
      <h2 style="margin: 0 0 1rem 0; font-size: 1.1rem;">Create Tenant</h2>
      <label for="tenantName">Tenant name</label>
      <input id="tenantName" type="text" placeholder="my-team" autocomplete="off" />
      <button id="createTenantBtn" class="secondary">Create tenant</button>
      <div id="tenantMessage" class="message"></div>
      <div id="tenantResult" style="display:none; margin-top:1rem;">
        <label>Tenant ID</label>
        <input id="createdTenantId" type="text" readonly />
        <label>JWT Token</label>
        <input id="createdTenantToken" type="text" readonly />
        <p class="hint">Copy the token above. Users log in at /login with it.</p>
      </div>
    </div>
  </main>

  <script>
    const adminEmail = document.getElementById('adminEmail');
    const adminPassword = document.getElementById('adminPassword');
    const kimiKey = document.getElementById('kimiKey');
    const minimaxKey = document.getElementById('minimaxKey');
    const kimiStatus = document.getElementById('kimiStatus');
    const minimaxStatus = document.getElementById('minimaxStatus');
    const githubToken = document.getElementById('githubToken');
    const gitlabToken = document.getElementById('gitlabToken');
    const bitbucketToken = document.getElementById('bitbucketToken');
    const githubStatus = document.getElementById('githubStatus');
    const gitlabStatus = document.getElementById('gitlabStatus');
    const bitbucketStatus = document.getElementById('bitbucketStatus');
    const loadBtn = document.getElementById('loadBtn');
    const saveBtn = document.getElementById('saveBtn');
    const saveGitBtn = document.getElementById('saveGitBtn');
    const messageEl = document.getElementById('message');
    const gitMessageEl = document.getElementById('gitMessage');

    function basicAuth() {
      const email = adminEmail.value.trim();
      const password = adminPassword.value;
      if (!email || !password) throw new Error('Admin email and password are required');
      return 'Basic ' + btoa(email + ':' + password);
    }

    function setStatus(el, set) {
      el.textContent = set ? 'Key is set' : 'Key is not set';
      el.className = 'status ' + (set ? 'set' : 'unset');
    }

    loadBtn.addEventListener('click', async () => {
      messageEl.className = 'message';
      messageEl.textContent = '';
      gitMessageEl.className = 'message';
      gitMessageEl.textContent = '';
      try {
        const res = await fetch('/api/v1/settings/keys', {
          headers: { Authorization: basicAuth() }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load keys');

        const keys = new Map(data.keys.map(k => [k.key, k.value]));
        setStatus(kimiStatus, !!keys.get('kimi_api_key'));
        setStatus(minimaxStatus, !!keys.get('minimax_api_key'));
        setStatus(githubStatus, !!keys.get('github_token'));
        setStatus(gitlabStatus, !!keys.get('gitlab_token'));
        setStatus(bitbucketStatus, !!keys.get('bitbucket_token'));
      } catch (err) {
        messageEl.className = 'message error';
        messageEl.textContent = err.message;
      }
    });

    saveBtn.addEventListener('click', async () => {
      messageEl.className = 'message';
      messageEl.textContent = 'Saving…';
      try {
        const body = {
          kimi_api_key: kimiKey.value,
          minimax_api_key: minimaxKey.value
        };
        const res = await fetch('/api/v1/settings/keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: basicAuth()
          },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save keys');

        messageEl.className = 'message success';
        messageEl.textContent = 'API keys saved.';
        setStatus(kimiStatus, data.saved.kimi_api_key);
        setStatus(minimaxStatus, data.saved.minimax_api_key);
        kimiKey.value = '';
        minimaxKey.value = '';
      } catch (err) {
        messageEl.className = 'message error';
        messageEl.textContent = err.message;
      }
    });

    saveGitBtn.addEventListener('click', async () => {
      gitMessageEl.className = 'message';
      gitMessageEl.textContent = 'Saving…';
      try {
        const body = {
          github_token: githubToken.value,
          gitlab_token: gitlabToken.value,
          bitbucket_token: bitbucketToken.value
        };
        const res = await fetch('/api/v1/settings/keys', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: basicAuth()
          },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save Git tokens');

        gitMessageEl.className = 'message success';
        gitMessageEl.textContent = 'Git tokens saved.';
        setStatus(githubStatus, data.saved.github_token);
        setStatus(gitlabStatus, data.saved.gitlab_token);
        setStatus(bitbucketStatus, data.saved.bitbucket_token);
        githubToken.value = '';
        gitlabToken.value = '';
        bitbucketToken.value = '';
      } catch (err) {
        gitMessageEl.className = 'message error';
        gitMessageEl.textContent = err.message;
      }
    });

    const tenantName = document.getElementById('tenantName');
    const createTenantBtn = document.getElementById('createTenantBtn');
    const tenantMessage = document.getElementById('tenantMessage');
    const tenantResult = document.getElementById('tenantResult');
    const createdTenantId = document.getElementById('createdTenantId');
    const createdTenantToken = document.getElementById('createdTenantToken');

    createTenantBtn.addEventListener('click', async () => {
      tenantMessage.className = 'message';
      tenantMessage.textContent = 'Creating…';
      tenantResult.style.display = 'none';
      try {
        const res = await fetch('/api/v1/tenants', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: basicAuth()
          },
          body: JSON.stringify({ name: tenantName.value.trim() || undefined })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create tenant');
        createdTenantId.value = data.tenant.id;
        createdTenantToken.value = data.token;
        tenantResult.style.display = 'block';
        tenantMessage.className = 'message success';
        tenantMessage.textContent = 'Tenant created. Copy the token.';
      } catch (err) {
        tenantMessage.className = 'message error';
        tenantMessage.textContent = err.message;
      }
    });

    (function decorateNavLinks() {
      const auditRunId = localStorage.getItem('auditengine_audit_run_id');
      document.querySelectorAll('nav a').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href === '#' || href.startsWith('http')) return;
        const u = new URL(href, location.origin);
        if (auditRunId) u.searchParams.set('audit_run_id', auditRunId);
        a.href = u.pathname + u.search;
      });
    })();
  </script>
</body>
</html>
`
