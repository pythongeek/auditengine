export const FINDING_DETAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Findings — AuditEngine</title>
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
    main { padding: 1.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    h1 { margin: 0 0 0.25rem 0; font-size: 1.25rem; }
    .meta { color: var(--muted); margin-bottom: 1rem; font-size: 0.85rem; }
    #error { color: var(--red); margin-bottom: 1rem; }
    #connection { color: var(--muted); font-size: 0.85rem; }
    #connection.connected { color: var(--green); }
    .panel { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: 1rem; }
    .panel h2 { margin: 0 0 0.75rem 0; font-size: 1rem; color: var(--muted); text-transform: uppercase; }
    .finding {
      border-left: 4px solid var(--muted);
      padding: 0.6rem 0.75rem;
      margin-bottom: 0.5rem;
      background: var(--bg);
      border-radius: 0 4px 4px 0;
      cursor: pointer;
    }
    .finding:hover { border-color: var(--accent); }
    .finding.critical { border-left-color: var(--red); }
    .finding.high { border-left-color: var(--orange); }
    .finding.medium { border-left-color: var(--yellow); }
    .finding.low { border-left-color: var(--accent); }
    .finding.active { background: #1e293b; }
    .finding .file { font-weight: 600; font-size: 0.85rem; }
    .finding .cat { color: var(--muted); font-size: 0.75rem; }
    .detail label { display: block; color: var(--muted); font-size: 0.8rem; margin-top: 0.75rem; }
    .detail .value { font-size: 0.9rem; margin-top: 0.15rem; }
    .detail pre {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.5rem;
      font-size: 0.8rem;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .actions { margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .actions input { flex: 1; min-width: 120px; padding: 0.4rem; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 4px; }
    .actions button { padding: 0.5rem 0.75rem; background: var(--accent); color: #fff; border: none; border-radius: 4px; cursor: pointer; }
    .actions button:hover { background: var(--accent-hover); }
    .actions label { display: flex; align-items: center; gap: 0.3rem; color: var(--text); }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
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
    <div>
      <h1>Findings</h1>
      <div class="meta">
        Audit: <span id="auditRunId"></span> ·
        <span id="connection">Disconnected</span>
      </div>
      <div id="error"></div>
      <div class="panel">
        <h2>List</h2>
        <div id="findings"></div>
      </div>
    </div>
    <div>
      <div class="panel detail">
        <h2>Detail</h2>
        <div id="detailEmpty" style="color:var(--muted)">Select a finding.</div>
        <div id="detailContent" style="display:none">
          <label>ID</label>
          <div class="value" id="detailId"></div>
          <label>File</label>
          <div class="value" id="detailFile"></div>
          <label>Category</label>
          <div class="value" id="detailCategory"></div>
          <label>Severity</label>
          <div class="value" id="detailSeverity"></div>
          <label>Status</label>
          <div class="value" id="detailStatus"></div>
          <label>Evidence</label>
          <pre id="detailEvidence"></pre>
          <div class="actions">
            <input id="commitSha" type="text" placeholder="Commit SHA" />
            <label><input type="checkbox" id="humanApproved" /> Human sign-off</label>
            <button id="verifyBtn">Verify</button>
          </div>
          <div id="verifyResult" style="margin-top:0.75rem"></div>
        </div>
      </div>
    </div>
  </main>

  <script>
    const token = localStorage.getItem('auditengine_token');
    const tenantId = localStorage.getItem('auditengine_tenant');
    const params = new URLSearchParams(location.search);
    const auditRunId = params.get('audit_run_id');
    if (!token || !tenantId || !auditRunId) location.href = '/login';

    document.getElementById('auditRunId').textContent = auditRunId;
    document.getElementById('logout').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('auditengine_token');
      localStorage.removeItem('auditengine_tenant');
      location.href = '/login';
    });

    const basePath = '/api/v1/tenants/' + tenantId + '/audits/' + auditRunId;
    const findings = new Map();
    let selectedFindingId = null;

    async function loadFindings() {
      try {
        const res = await fetch(basePath + '/findings', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('Failed to load findings');
        const data = await res.json();
        findings.clear();
        (data.findings || []).forEach(f => findings.set(f.finding_id, f));
        renderList();
      } catch (err) {
        document.getElementById('error').textContent = err.message;
      }
    }

    function renderList() {
      const container = document.getElementById('findings');
      if (findings.size === 0) {
        container.innerHTML = '<p style="color:var(--muted)">No findings.</p>';
        return;
      }
      container.innerHTML = Array.from(findings.values()).map(f => \`
        <div class="finding \${f.severity} \${f.finding_id === selectedFindingId ? 'active' : ''}" data-id="\${f.finding_id}">
          <div class="file">\${f.file || '—'}</div>
          <div class="cat">\${f.category || 'finding'} · \${f.severity} · \${f.status}</div>
        </div>
      \`).join('');
      container.querySelectorAll('.finding').forEach(el => {
        el.addEventListener('click', () => selectFinding(el.dataset.id));
      });
    }

    function selectFinding(id) {
      selectedFindingId = id;
      const f = findings.get(id);
      if (!f) return;
      renderList();
      document.getElementById('detailEmpty').style.display = 'none';
      document.getElementById('detailContent').style.display = 'block';
      document.getElementById('detailId').textContent = f.finding_id;
      document.getElementById('detailFile').textContent = f.file || '—';
      document.getElementById('detailCategory').textContent = f.category || '—';
      document.getElementById('detailSeverity').textContent = f.severity || '—';
      document.getElementById('detailStatus').textContent = f.status || '—';
      document.getElementById('detailEvidence').textContent = f.evidence_quote || '—';
      document.getElementById('verifyResult').textContent = '';
    }

    document.getElementById('verifyBtn').addEventListener('click', async () => {
      if (!selectedFindingId) return;
      const commitSha = document.getElementById('commitSha').value.trim();
      const humanApproved = document.getElementById('humanApproved').checked;
      const resultEl = document.getElementById('verifyResult');
      resultEl.textContent = 'Verifying…';
      try {
        const res = await fetch(basePath + '/findings/' + selectedFindingId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ status: 'resolved', reason: commitSha ? 'commit ' + commitSha : 'human sign-off', human_approved: humanApproved })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Verify failed');
        resultEl.textContent = 'Marked ' + data.status;
        loadFindings();
      } catch (err) {
        resultEl.textContent = err.message;
      }
    });

    function connect() {
      const wsUrl = new URL('/dashboard/ws', location.origin);
      wsUrl.searchParams.set('audit_run_id', auditRunId);
      wsUrl.searchParams.set('token', token);
      wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
      const ws = new WebSocket(wsUrl);
      const conn = document.getElementById('connection');
      ws.onopen = () => { conn.textContent = 'Connected'; conn.classList.add('connected'); };
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.type === 'finding_created') loadFindings();
        } catch (err) { console.error('bad event', err); }
      };
      ws.onclose = () => { conn.textContent = 'Reconnecting…'; conn.classList.remove('connected'); setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    }

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

    loadFindings();
    decorateNavLinks();
    connect();
  </script>
</body>
</html>`
