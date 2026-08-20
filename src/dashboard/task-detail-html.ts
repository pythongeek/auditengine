export const TASK_DETAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Task — AuditEngine</title>
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
      --orange: #f97316;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      background: var(--bg);
      color: var(--text);
      line-height: 1.4;
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
    main { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 0.25rem 0; font-size: 1.25rem; }
    .meta { color: var(--muted); margin-bottom: 1rem; font-size: 0.85rem; }
    #error { color: var(--red); margin-bottom: 1rem; }
    #status { color: var(--green); margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .panel h2 { margin: 0 0 0.75rem 0; font-size: 1rem; color: var(--muted); text-transform: uppercase; }
    .finding {
      border-left: 4px solid var(--muted);
      padding: 0.6rem 0.75rem;
      margin-bottom: 0.5rem;
      background: var(--bg);
      border-radius: 0 4px 4px 0;
    }
    .finding.critical { border-left-color: var(--red); }
    .finding.high { border-left-color: var(--orange); }
    .finding.medium { border-left-color: var(--yellow); }
    .finding.low { border-left-color: var(--accent); }
    .finding .file { font-weight: 600; font-size: 0.85rem; }
    .finding .cat { color: var(--muted); font-size: 0.75rem; }
    .finding pre {
      background: #0a0a0a;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.5rem;
      font-size: 0.8rem;
      white-space: pre-wrap;
      margin-top: 0.4rem;
    }
    label { display: block; color: var(--muted); font-size: 0.85rem; margin: 0.75rem 0 0.25rem 0; }
    textarea, input[type="text"] {
      width: 100%;
      padding: 0.6rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text);
      font-family: inherit;
    }
    textarea { min-height: 100px; }
    .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.75rem; }
    button, .btn-link {
      padding: 0.6rem 1rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      text-decoration: none;
    }
    button:hover, .btn-link:hover { background: var(--accent-hover); }
    button.secondary { background: transparent; border: 1px solid var(--border); color: var(--text); }
    button.secondary:hover { border-color: var(--accent); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .diff {
      background: #0a0a0a;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.75rem;
      font-size: 0.8rem;
      max-height: 60vh;
      overflow-y: auto;
      white-space: pre-wrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .diff .file { color: var(--accent); margin-bottom: 0.5rem; font-weight: 600; }
    .diff .minus { color: var(--red); }
    .diff .plus { color: var(--green); }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
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
    <h1>Task <span id="taskIdShort"></span></h1>
    <div class="meta">
      Audit: <span id="auditRunId"></span> ·
      Status: <span id="taskStatus"></span> ·
      Score: <span id="taskScore"></span>
    </div>
    <div id="error"></div>
    <div id="status"></div>

    <div class="grid">
      <div>
        <div class="panel">
          <h2>Findings</h2>
          <div id="findings"></div>
        </div>

        <div class="panel">
          <h2>Remediation Plan</h2>
          <pre id="planText" style="white-space:pre-wrap; color:var(--muted);">No plan generated yet.</pre>
          <div class="actions">
            <button id="regenPlanBtn" class="secondary">Regenerate Plan</button>
          </div>
        </div>
      </div>

      <div>
        <div class="panel">
          <h2>AI Fix Studio</h2>
          <label for="customPrompt">Adjust the fix prompt (optional)</label>
          <textarea id="customPrompt" placeholder="e.g. prefer early returns, keep function signatures unchanged"></textarea>
          <div class="actions">
            <button id="previewBtn">Preview Diff</button>
            <button id="applyBtn" class="secondary">Apply Fix → PR</button>
          </div>
          <div id="previewActions" style="display:none; margin-top:1rem;">
            <button id="applyFromPreviewBtn">Apply This Diff</button>
            <button id="discardPreviewBtn" class="secondary">Discard</button>
          </div>
        </div>

        <div class="panel">
          <h2>Preview</h2>
          <div id="diffContainer">No preview yet.</div>
        </div>

        <div class="panel">
          <h2>Actions</h2>
          <div class="actions">
            <button id="releaseBtn" class="secondary">Release Lock</button>
            <a class="btn-link" id="boardLink" href="/task-board">Back to Board</a>
          </div>
        </div>
      </div>
    </div>
  </main>

  <script>
    const token = localStorage.getItem('auditengine_token');
    const tenantId = localStorage.getItem('auditengine_tenant');
    const params = new URLSearchParams(location.search);
    const auditRunId = params.get('audit_run_id');
    const taskId = params.get('task_id');
    if (!token || !tenantId || !auditRunId || !taskId) location.href = '/login';

    document.getElementById('taskIdShort').textContent = '#' + taskId.slice(-6);
    document.getElementById('auditRunId').textContent = auditRunId;
    document.getElementById('boardLink').href = '/task-board?audit_run_id=' + encodeURIComponent(auditRunId);

    document.getElementById('logout').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('auditengine_token');
      localStorage.removeItem('auditengine_tenant');
      localStorage.removeItem('auditengine_audit_run_id');
      location.href = '/login';
    });

    const basePath = '/api/v1/tenants/' + tenantId + '/audits/' + auditRunId + '/tasks/' + taskId;
    const errorEl = document.getElementById('error');
    const statusEl = document.getElementById('status');
    let currentPreview = null;

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    async function loadTask() {
      try {
        const res = await fetch(basePath, { headers: { Authorization: 'Bearer ' + token } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load task');
        const task = data.task;
        document.getElementById('taskStatus').textContent = task.status;
        document.getElementById('taskScore').textContent = (task.priority_score || 0).toFixed(1);
        document.getElementById('planText').textContent = task.plan_text || 'No plan generated yet.';
        document.getElementById('releaseBtn').style.display = task.status === 'in_progress' ? 'inline-block' : 'none';

        const container = document.getElementById('findings');
        if (!data.findings || data.findings.length === 0) {
          container.innerHTML = '<p style="color:var(--muted)">No findings.</p>';
        } else {
          container.innerHTML = data.findings.map(f => \`
            <div class="finding \${f.severity}">
              <div class="file">\${escapeHtml(f.file || '—')}</div>
              <div class="cat">\${escapeHtml(f.category || 'finding')} · \${f.severity} · \${f.status}</div>
              <div style="margin-top:0.3rem; font-size:0.85rem;">\${escapeHtml(f.description || '')}</div>
              <pre>\${escapeHtml(f.evidence_quote || '')}</pre>
            </div>
          \`).join('');
        }
      } catch (err) {
        errorEl.textContent = err.message;
      }
    }

    function renderDiff(preview) {
      const container = document.getElementById('diffContainer');
      if (!preview || preview.length === 0) {
        container.innerHTML = 'No changes proposed.';
        return;
      }
      container.innerHTML = preview.map(p => {
        const lines = [];
        const originalLines = p.original.split('\\n');
        const fixedLines = p.fixed.split('\\n');
        const max = Math.max(originalLines.length, fixedLines.length);
        for (let i = 0; i < max; i++) {
          const o = originalLines[i] || '';
          const n = fixedLines[i] || '';
          if (o === n) {
            lines.push(escapeHtml(' ' + o));
          } else {
            if (o) lines.push('<span class="minus">' + escapeHtml('-' + o) + '</span>');
            if (n) lines.push('<span class="plus">' + escapeHtml('+' + n) + '</span>');
          }
        }
        return \`<div class="diff"><div class="file">\${escapeHtml(p.file)}</div>\${lines.join('\\n')}</div>\`;
      }).join('');
    }

    async function postPreview() {
      errorEl.textContent = '';
      statusEl.textContent = 'Generating preview…';
      try {
        const customPrompt = document.getElementById('customPrompt').value.trim();
        const res = await fetch(basePath + '/fix-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ custom_prompt: customPrompt })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Preview failed');
        currentPreview = data.preview;
        renderDiff(currentPreview);
        document.getElementById('previewActions').style.display = 'block';
        statusEl.textContent = 'Preview ready.';
      } catch (err) {
        statusEl.textContent = '';
        errorEl.textContent = err.message;
      }
    }

    async function applyFix() {
      if (!confirm('Generate fixes, commit to a new branch, and open a PR/MR?')) return;
      errorEl.textContent = '';
      statusEl.textContent = 'Applying fix…';
      try {
        const res = await fetch(basePath + '/fix', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Fix failed');
        statusEl.textContent = 'Fix applied. PR: ' + (data.pr_url || data.commit_sha);
        loadTask();
      } catch (err) {
        statusEl.textContent = '';
        errorEl.textContent = err.message;
      }
    }

    async function applyFromPreview() {
      if (!currentPreview || currentPreview.length === 0) return;
      if (!confirm('Apply the previewed diff as a commit and open a PR/MR?')) return;
      errorEl.textContent = '';
      statusEl.textContent = 'Applying previewed diff…';
      try {
        const customPrompt = document.getElementById('customPrompt').value.trim();
        const res = await fetch(basePath + '/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ custom_prompt: customPrompt })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Fix failed');
        statusEl.textContent = 'Fix applied. PR: ' + (data.pr_url || data.commit_sha);
        currentPreview = null;
        document.getElementById('previewActions').style.display = 'none';
        loadTask();
      } catch (err) {
        statusEl.textContent = '';
        errorEl.textContent = err.message;
      }
    }

    async function releaseLock() {
      if (!confirm('Release the task lock and return it to the backlog?')) return;
      errorEl.textContent = '';
      try {
        const res = await fetch(basePath + '/release', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Release failed');
        statusEl.textContent = 'Lock released.';
        loadTask();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    }

    async function regenPlan() {
      errorEl.textContent = '';
      statusEl.textContent = 'Generating plan…';
      try {
        const res = await fetch(basePath + '/plan', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Plan failed');
        document.getElementById('planText').textContent = data.plan || 'No plan generated.';
        statusEl.textContent = 'Plan ready.';
      } catch (err) {
        statusEl.textContent = '';
        errorEl.textContent = err.message;
      }
    }

    document.getElementById('previewBtn').addEventListener('click', postPreview);
    document.getElementById('applyBtn').addEventListener('click', applyFix);
    document.getElementById('applyFromPreviewBtn').addEventListener('click', applyFromPreview);
    document.getElementById('discardPreviewBtn').addEventListener('click', () => {
      currentPreview = null;
      document.getElementById('diffContainer').innerHTML = 'No preview yet.';
      document.getElementById('previewActions').style.display = 'none';
    });
    document.getElementById('releaseBtn').addEventListener('click', releaseLock);
    document.getElementById('regenPlanBtn').addEventListener('click', regenPlan);

    function decorateNavLinks() {
      localStorage.setItem('auditengine_audit_run_id', auditRunId);
      document.querySelectorAll('nav a').forEach(a => {
        const href = a.getAttribute('href');
        if (!href || href === '#' || href.startsWith('http')) return;
        const u = new URL(href, location.origin);
        u.searchParams.set('audit_run_id', auditRunId);
        a.href = u.pathname + u.search;
      });
    }

    loadTask();
    decorateNavLinks();
  </script>
</body>
</html>`
