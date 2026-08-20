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
    .row { display: flex; gap: 1rem; align-items: center; margin-top: 1rem; flex-wrap: wrap; }
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
    #tokenWarning { color: var(--red); font-size: 0.85rem; margin-top: 0.5rem; display: none; }
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
    .repo-field-row { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
    .repo-field-row .field { flex: 1; min-width: 220px; }
    .repo-field-row .btn { margin-bottom: 0.1rem; }
    .file-list {
      margin-top: 1rem;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg);
      max-height: 320px;
      overflow-y: auto;
    }
    .file-list-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      background: var(--bg);
      z-index: 1;
      flex-wrap: wrap;
    }
    .file-list-toolbar input {
      flex: 1;
      min-width: 160px;
      padding: 0.4rem 0.5rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text);
    }
    .file-list-toolbar .actions { display: flex; gap: 0.75rem; font-size: 0.85rem; }
    .file-list-toolbar a { color: var(--accent); text-decoration: none; cursor: pointer; }
    .file-list-toolbar a:hover { text-decoration: underline; }
    .file-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      border-bottom: 1px solid var(--border);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.85rem;
    }
    .file-item:last-child { border-bottom: none; }
    .file-item input[type="checkbox"] { cursor: pointer; }
    .file-item label { margin: 0; font-weight: normal; cursor: pointer; flex: 1; }
    .file-list-empty { padding: 1rem; color: var(--muted); font-size: 0.85rem; text-align: center; }
    .file-list-count { color: var(--muted); font-size: 0.8rem; }
    .file-list-error { color: var(--red); margin-top: 0.5rem; font-size: 0.85rem; }
    .file-list-loading { color: var(--muted); margin-top: 0.5rem; font-size: 0.85rem; }
    .hidden { display: none; }
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
      <div class="repo-field-row">
        <div class="field">
          <input type="text" id="repoUrl" placeholder="https://github.com/owner/repo" />
        </div>
        <div class="field">
          <label for="branch" style="margin-top: 0;">Branch (optional)</label>
          <input type="text" id="branch" placeholder="main" />
        </div>
        <button class="btn secondary" id="loadFilesBtn" type="button">Load files</button>
      </div>
      <div class="repo-field-row" style="margin-top: 0.75rem;">
        <div class="field">
          <label for="githubToken" style="margin-top: 0;">GitHub Personal Access Token (optional)</label>
          <input type="password" id="githubToken" placeholder="ghp_..." autocomplete="off" />
        </div>
      </div>
      <div id="tokenWarning"></div>
      <div class="hint">Enter a GitHub, GitLab, or Bitbucket repo URL to audit it directly. Leave blank to upload/paste files instead. A token is required for private repos and helps avoid public-repo rate limits. Tokens entered here are used only for this audit.</div>

      <div id="fileListSection" class="hidden">
        <div class="file-list-toolbar">
          <input type="text" id="fileFilter" placeholder="Filter files…" />
          <div class="actions">
            <a id="selectAll">Select all</a>
            <a id="selectNone">Select none</a>
          </div>
        </div>
        <div class="file-list" id="fileListBox"></div>
        <div class="file-list-count" id="fileListCount"></div>
        <div class="file-list-loading hidden" id="fileListLoading">Loading files…</div>
        <div class="file-list-error hidden" id="fileListError"></div>
      </div>

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
    const loadFilesBtn = document.getElementById('loadFilesBtn');
    const fileListSection = document.getElementById('fileListSection');
    const fileListBox = document.getElementById('fileListBox');
    const fileFilter = document.getElementById('fileFilter');
    const selectAll = document.getElementById('selectAll');
    const selectNone = document.getElementById('selectNone');
    const fileListCount = document.getElementById('fileListCount');
    const fileListLoading = document.getElementById('fileListLoading');
    const fileListError = document.getElementById('fileListError');
    const githubTokenInput = document.getElementById('githubToken');
    const tokenWarning = document.getElementById('tokenWarning');

    const token = localStorage.getItem('auditengine_token');
    const tenantId = localStorage.getItem('auditengine_tenant');

    if (!token || !tenantId) {
      loginWarning.style.display = 'block';
      startBtn.disabled = true;
      loadFilesBtn.disabled = true;
    } else {
      tokenStatus.textContent = 'Tenant: ' + tenantId;
    }

    const params = new URLSearchParams(location.search);
    const prefillRepo = params.get('repo');
    const prefillBranch = params.get('branch');
    const autoSelect = params.get('select') === '1';
    if (prefillRepo) {
      repoUrlInput.value = prefillRepo;
    }
    if (prefillBranch) {
      branchInput.value = prefillBranch;
    }

    function updateTokenWarning() {
      const url = repoUrlInput.value.trim();
      const token = githubTokenInput.value.trim();
      if (url.includes('github.com') && !token) {
        tokenWarning.style.display = 'block';
        tokenWarning.textContent = 'No GitHub token entered. Public repo audits may hit rate limits; private repos require a token.';
      } else {
        tokenWarning.style.display = 'none';
      }
    }
    repoUrlInput.addEventListener('input', updateTokenWarning);
    githubTokenInput.addEventListener('input', updateTokenWarning);
    updateTokenWarning();

    let loadedRepoFiles = [];
    let loadedRepoUrl = '';
    let loadedBranch = '';

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

    function extractPaths(data) {
      const files = data && Array.isArray(data.files) ? data.files : (Array.isArray(data) ? data : []);
      return files.map(f => (typeof f === 'string' ? f : (f && f.path ? f.path : null))).filter(Boolean);
    }

    function renderFileList(paths) {
      loadedRepoFiles = paths.map(p => ({ path: p, selected: true }));
      fileListSection.classList.remove('hidden');
      applyFileFilter();
      updateSelectedCount();
    }

    function applyFileFilter() {
      const q = (fileFilter.value || '').trim().toLowerCase();
      const visible = loadedRepoFiles.filter(f => !q || f.path.toLowerCase().includes(q));
      if (visible.length === 0) {
        fileListBox.innerHTML = '<div class="file-list-empty">No files match.</div>';
        return;
      }
      fileListBox.innerHTML = visible.map((f, i) => \`
        <div class="file-item">
          <input type="checkbox" id="f\${i}" data-path="\${escapeHtml(f.path)}" \${f.selected ? 'checked' : ''} />
          <label for="f\${i}">\${escapeHtml(f.path)}</label>
        </div>
      \`).join('');
      fileListBox.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const item = loadedRepoFiles.find(f => f.path === cb.dataset.path);
          if (item) item.selected = cb.checked;
          updateSelectedCount();
        });
      });
    }

    function updateSelectedCount() {
      const selected = loadedRepoFiles.filter(f => f.selected).length;
      const total = loadedRepoFiles.length;
      fileListCount.textContent = total ? \`\${selected} of \${total} selected\` : '';
    }

    function escapeHtml(str) {
      return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    async function loadRepoFiles() {
      if (!token) {
        fileListError.textContent = 'Please log in first.';
        fileListError.classList.remove('hidden');
        return;
      }
      const repoUrl = repoUrlInput.value.trim();
      if (!repoUrl) {
        fileListError.textContent = 'Enter a repository URL first.';
        fileListError.classList.remove('hidden');
        return;
      }
      const branch = branchInput.value.trim();
      fileListLoading.classList.remove('hidden');
      fileListError.classList.add('hidden');
      loadFilesBtn.disabled = true;
      try {
        const tokenOverride = githubTokenInput.value.trim();
        const res = await fetch('/api/v1/repo/files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify({ repo_url: repoUrl, branch: branch || undefined, github_token_override: tokenOverride || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || data.message || \`HTTP \${res.status}\`);
        }
        const paths = extractPaths(data);
        loadedRepoUrl = repoUrl;
        loadedBranch = branch;
        if (paths.length === 0) {
          fileListError.textContent = 'No files found in repository.';
          fileListError.classList.remove('hidden');
          fileListSection.classList.add('hidden');
        } else {
          renderFileList(paths);
        }
      } catch (err) {
        fileListError.textContent = err.message;
        fileListError.classList.remove('hidden');
        fileListSection.classList.add('hidden');
      } finally {
        fileListLoading.classList.add('hidden');
        loadFilesBtn.disabled = false;
      }
    }

    loadFilesBtn.addEventListener('click', loadRepoFiles);

    fileFilter.addEventListener('input', applyFileFilter);

    selectAll.addEventListener('click', (e) => {
      e.preventDefault();
      const q = (fileFilter.value || '').trim().toLowerCase();
      loadedRepoFiles.forEach(f => {
        if (!q || f.path.toLowerCase().includes(q)) f.selected = true;
      });
      applyFileFilter();
      updateSelectedCount();
    });

    selectNone.addEventListener('click', (e) => {
      e.preventDefault();
      const q = (fileFilter.value || '').trim().toLowerCase();
      loadedRepoFiles.forEach(f => {
        if (!q || f.path.toLowerCase().includes(q)) f.selected = false;
      });
      applyFileFilter();
      updateSelectedCount();
    });

    if (autoSelect && prefillRepo) {
      loadRepoFiles();
    }

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
          const tokenOverride = githubTokenInput.value.trim();
          if (tokenOverride) body.github_token_override = tokenOverride;
          if (loadedRepoFiles.length > 0 && repoUrl === loadedRepoUrl && branch === loadedBranch) {
            const selected = loadedRepoFiles.filter(f => f.selected).map(f => f.path);
            body.selected_paths = selected;
          }
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
    decorateNavLinks();
  </script>
</body>
</html>
`
