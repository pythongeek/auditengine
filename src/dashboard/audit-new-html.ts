export const AUDIT_NEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AuditEngine — New Audit</title>
  <style>
    :root {
      --bg: #111;
      --text: #e5e5e5;
      --muted: #888;
      --card: #1a1a1a;
      --border: #333;
      --accent: #3b82f6;
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
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    h1 { font-size: 2rem; margin: 0 0 1.5rem 0; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    label { display: block; margin-bottom: 0.4rem; font-weight: 600; }
    input[type="text"], input[type="file"], textarea {
      width: 100%;
      padding: 0.6rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text);
      font-family: inherit;
    }
    input[type="file"] { padding: 0.4rem; }
    textarea {
      min-height: 160px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.85rem;
    }
    .hint { color: var(--muted); font-size: 0.85rem; margin-top: 0.25rem; }
    .row { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; }
    .btn {
      padding: 0.7rem 1.4rem;
      background: var(--accent);
      color: #fff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      border: none;
      cursor: pointer;
    }
    .btn.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
    }
    .btn:hover { opacity: 0.9; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #fileList { margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted); }
    #status { margin-top: 1rem; font-weight: 600; }
    #status.ok { color: var(--green); }
    #status.err { color: var(--red); }
    #loginWarning { color: var(--red); margin-bottom: 1rem; display: none; }
    #tokenStatus { font-size: 0.85rem; color: var(--muted); margin-bottom: 1rem; }
    .repo-chip {
      display: inline-block;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.3rem 0.6rem;
      margin: 0 0.4rem 0.4rem 0;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .repo-chip:hover { border-color: var(--accent); color: var(--accent); }
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
    <h1>Start New Audit</h1>
    <div id="loginWarning">You are not logged in. <a href="/login" style="color: var(--accent);">Log in</a> with your tenant token first.</div>
    <div id="tokenStatus"></div>

    <div class="card">
      <label for="auditId">Audit Run ID</label>
      <input type="text" id="auditId" placeholder="run-2026-08-08-001" />
      <div class="hint">Leave blank to auto-generate. Use only letters, numbers, dashes, and underscores.</div>
    </div>

    <div class="card">
      <label for="repoUrl">Git Repository URL</label>
      <input type="text" id="repoUrl" placeholder="https://github.com/owner/repo" />
      <div class="hint">Enter a GitHub, GitLab, or Bitbucket repo URL to audit it directly. Leave blank to upload/paste files instead. Make sure a Git provider token is saved in <a href="/settings" style="color: var(--accent);">Settings</a> for private repos.</div>

      <label for="branch" style="margin-top: 1rem;">Branch (optional)</label>
      <input type="text" id="branch" placeholder="main" />
      <div class="hint">Defaults to the repo’s default branch. Leave blank unless you need a specific branch.</div>

      <div id="recentRepos" style="margin-top: 1rem;"></div>
    </div>

    <div class="card">
      <label for="files">Source Files</label>
      <input type="file" id="files" multiple />
      <div class="hint">Select one or more text files (source code, configs, docs). Files are read as UTF-8 text.</div>
      <div id="fileList">No files selected.</div>
    </div>

    <div class="card">
      <label for="paste">Or Paste Files (JSON array)</label>
      <textarea id="paste" placeholder='[{"path":"src/index.ts","content":"console.log(1);"}]'></textarea>
      <div class="hint">If you paste JSON here, it overrides file selection. Format: array of {path, content}.</div>
    </div>

    <div class="row">
      <button class="btn" id="startBtn">Start Audit</button>
      <a class="btn secondary" href="/dashboard">Go to Dashboard</a>
    </div>

    <div id="status"></div>
  </main>

  <script>
    const fileInput = document.getElementById('files');
    const fileList = document.getElementById('fileList');
    const pasteArea = document.getElementById('paste');
    const startBtn = document.getElementById('startBtn');
    const statusEl = document.getElementById('status');
    const auditIdInput = document.getElementById('auditId');
    const repoUrlInput = document.getElementById('repoUrl');
    const branchInput = document.getElementById('branch');
    const loginWarning = document.getElementById('loginWarning');
    const tokenStatus = document.getElementById('tokenStatus');
    const recentRepos = document.getElementById('recentRepos');

    const token = localStorage.getItem('auditengine_token');
    const tenantId = localStorage.getItem('auditengine_tenant');

    if (!token || !tenantId) {
      loginWarning.style.display = 'block';
      startBtn.disabled = true;
    } else {
      tokenStatus.textContent = 'Tenant: ' + tenantId;
    }

    const params = new URLSearchParams(location.search);
    const prefillRepo = params.get('repo');
    if (prefillRepo) {
      repoUrlInput.value = prefillRepo;
    }

    async function loadRecentRepos() {
      if (!token || !tenantId) return;
      try {
        const res = await fetch('/api/v1/tenants/' + tenantId + '/audits', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) return;
        const data = await res.json();
        const audits = data.audits || [];
        const urls = [...new Set(audits.map(a => a.repo_url).filter(Boolean))].slice(0, 5);
        if (urls.length === 0) return;
        recentRepos.innerHTML = '<div style="color: var(--muted); margin-bottom: 0.4rem; font-size: 0.85rem;">Recent repos:</div>' +
          urls.map(u => \`<span class="repo-chip" data-url="\${u}">\${u}</span>\`).join('');
        recentRepos.querySelectorAll('.repo-chip').forEach(el => {
          el.addEventListener('click', () => { repoUrlInput.value = el.dataset.url; });
        });
      } catch {
        // ignore
      }
    }
    loadRecentRepos();

    let selectedFiles = [];

    fileInput.addEventListener('change', () => {
      selectedFiles = Array.from(fileInput.files);
      fileList.textContent = selectedFiles.length
        ? selectedFiles.map(f => f.name).join(', ')
        : 'No files selected.';
    });

    function generateId() {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      return \`run-\${now.getFullYear()}-\${pad(now.getMonth()+1)}-\${pad(now.getDate())}-\${pad(now.getHours())}\${pad(now.getMinutes())}\${pad(now.getSeconds())}\`;
    }

    function readFiles(files) {
      return Promise.all(files.map(f => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ path: f.name, content: reader.result });
          reader.onerror = reject;
          reader.readAsText(f);
        });
      }));
    }

    startBtn.addEventListener('click', async () => {
      statusEl.className = '';
      statusEl.textContent = '';
      startBtn.disabled = true;

      try {
        let auditId = auditIdInput.value.trim();
        if (!auditId) auditId = generateId();
        if (!/^[a-zA-Z0-9_-]+\$/.test(auditId)) {
          throw new Error('Audit Run ID must contain only letters, numbers, dashes, and underscores.');
        }

        const repoUrl = repoUrlInput.value.trim();
        const branch = branchInput.value.trim();
        const body = { audit_run_id: auditId };

        if (repoUrl) {
          body.repo_url = repoUrl;
          if (branch) body.branch = branch;
        } else {
          let filesPayload;
          const pasted = pasteArea.value.trim();
          if (pasted) {
            filesPayload = JSON.parse(pasted);
            if (!Array.isArray(filesPayload)) throw new Error('Pasted JSON must be an array.');
          } else {
            if (selectedFiles.length === 0) {
              throw new Error('Select files, paste a JSON array, or enter a repository URL.');
            }
            filesPayload = await readFiles(selectedFiles);
          }

          if (filesPayload.length === 0) {
            throw new Error('At least one file is required.');
          }
          body.files = filesPayload;
        }

        if (!token) {
          throw new Error('Please log in first. Go to /login and paste your tenant token.');
        }

        const resp = await fetch('/audit/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify(body),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.error || data.message || \`HTTP \${resp.status}\`);
        }

        statusEl.className = 'ok';
        statusEl.textContent = \`Audit queued: \${auditId}. For large repos ingestion may take a few minutes. Redirecting to dashboard…\`;
        setTimeout(() => {
          location.href = \`/dashboard?audit_run_id=\${encodeURIComponent(auditId)}\`;
        }, 1500);
      } catch (err) {
        statusEl.className = 'err';
        statusEl.textContent = err.message;
      } finally {
        startBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
`
