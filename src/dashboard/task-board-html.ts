export const TASK_BOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Task Board — AuditEngine</title>
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
    h1 { margin: 0 0 0.25rem 0; font-size: 1.25rem; }
    .meta { color: var(--muted); margin-bottom: 1rem; font-size: 0.85rem; }
    #error { color: var(--red); margin-bottom: 1rem; }
    #connection { color: var(--muted); font-size: 0.85rem; }
    #connection.connected { color: var(--green); }
    .board {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
    }
    .column {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem;
      min-height: 200px;
    }
    .column h3 { margin: 0 0 0.75rem 0; font-size: 0.75rem; text-transform: uppercase; color: var(--muted); }
    .column.drag-over { border-color: var(--accent); background: #1e293b; }
    .task {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.6rem;
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
      cursor: grab;
    }
    .task.dragging { opacity: 0.5; }
    .task .id { font-weight: 600; margin-bottom: 0.2rem; }
    .task .info { color: var(--muted); font-size: 0.75rem; }
    .task .actions { display: flex; gap: 0.3rem; margin-top: 0.4rem; }
    .task .mini { flex: 1; padding: 0.25rem 0.3rem; font-size: 0.7rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
    .task .mini:hover { border-color: var(--accent); color: var(--accent); }
    .task .conflict { background: var(--red); color: #fff; font-size: 0.65rem; padding: 0.05rem 0.3rem; border-radius: 3px; margin-left: 0.3rem; }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      display: none;
      place-items: center;
      z-index: 100;
    }
    .modal-overlay.active { display: grid; }
    .modal {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      width: min(420px, 90vw);
    }
    .modal h3 { margin-top: 0; }
    .modal label { display: block; color: var(--muted); font-size: 0.85rem; margin: 0.75rem 0 0.25rem 0; }
    .modal input, .modal select { width: 100%; padding: 0.5rem; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 4px; }
    .modal .row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; }
    .modal button { margin-top: 1rem; width: 100%; padding: 0.6rem; background: var(--accent); color: #fff; border: none; border-radius: 4px; cursor: pointer; }
    .modal button:hover { background: var(--accent-hover); }
    .modal .cancel { background: transparent; border: 1px solid var(--border); color: var(--text); }
    @media (max-width: 900px) { .board { grid-template-columns: repeat(2, 1fr); } }
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
    <h1>Task Board</h1>
    <div class="meta">
      Audit: <span id="auditRunId"></span> ·
      <span id="connection">Disconnected</span>
    </div>
    <div id="error"></div>
    <div class="board">
      <div class="column" data-status="backlog"><h3>Backlog</h3></div>
      <div class="column" data-status="in_progress"><h3>In Progress</h3></div>
      <div class="column" data-status="in_review"><h3>In Review</h3></div>
      <div class="column" data-status="done"><h3>Done</h3></div>
    </div>
  </main>

  <div id="doneModal" class="modal-overlay">
    <div class="modal">
      <h3>Mark task done</h3>
      <label for="commitSha">Commit SHA</label>
      <input id="commitSha" type="text" placeholder="abc1234" />
      <div class="row">
        <input type="checkbox" id="humanApproved" />
        <label for="humanApproved" style="margin:0">Human sign-off</label>
      </div>
      <button id="confirmDone">Move to Done</button>
      <button class="cancel" id="cancelDone">Cancel</button>
    </div>
  </div>

  <div id="planModal" class="modal-overlay">
    <div class="modal">
      <h3>Remediation plan</h3>
      <pre id="planBody" style="white-space:pre-wrap;max-height:50vh;overflow:auto;text-align:left"></pre>
      <button class="cancel" id="closePlan">Close</button>
    </div>
  </div>

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

    const tasks = new Map();
    const basePath = '/api/v1/tenants/' + tenantId + '/audits/' + auditRunId;

    async function loadTasks() {
      try {
        const res = await fetch(basePath + '/tasks', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) throw new Error('Failed to load tasks');
        const data = await res.json();
        tasks.clear();
        (data.tasks || []).forEach(t => tasks.set(t.task_id, t));
        render();
      } catch (err) {
        document.getElementById('error').textContent = err.message;
      }
    }

    function render() {
      document.querySelectorAll('.column .task').forEach(el => el.remove());
      tasks.forEach(task => {
        const col = document.querySelector('.column[data-status="' + task.status + '"]');
        if (!col) return;
        const el = document.createElement('div');
        el.className = 'task';
        el.draggable = true;
        el.dataset.taskId = task.task_id;
        el.dataset.status = task.status;
        el.innerHTML = '<div class="id">#' + task.task_id.slice(-6) + (task.conflict_flag ? '<span class="conflict">CONFLICT</span>' : '') + '</div>' +
          '<div class="info">score ' + (task.priority_score || 0) + ' · ' + (task.assigned_agent || 'unassigned') + '</div>' +
          '<div class="actions">' +
            '<button class="mini" data-act="plan">' + (task.plan_status === 'ready' ? 'View Plan' : 'AI Plan') + '</button>' +
            '<button class="mini" data-act="fix">Apply Fix → PR</button>' +
            '<button class="mini" data-act="detail">Studio</button>' +
            (task.status === 'in_progress' ? '<button class="mini" data-act="release">Release</button>' : '') +
          '</div>';
        el.querySelector('[data-act="plan"]').addEventListener('click', (e) => { e.stopPropagation(); openPlan(task); });
        el.querySelector('[data-act="fix"]').addEventListener('click', (e) => { e.stopPropagation(); applyFix(task.task_id); });
        el.querySelector('[data-act="detail"]').addEventListener('click', (e) => {
          e.stopPropagation();
          const u = new URL('/task', location.origin);
          u.searchParams.set('tenant_id', tenantId);
          u.searchParams.set('audit_run_id', auditRunId);
          u.searchParams.set('task_id', task.task_id);
          location.href = u.toString();
        });
        const releaseBtn = el.querySelector('[data-act="release"]');
        if (releaseBtn) releaseBtn.addEventListener('click', (e) => { e.stopPropagation(); releaseTask(task.task_id); });
        el.addEventListener('dragstart', () => el.classList.add('dragging'));
        el.addEventListener('dragend', () => el.classList.remove('dragging'));
        col.appendChild(el);
      });
    }

    const planModal = document.getElementById('planModal');
    async function openPlan(task) {
      document.getElementById('planBody').textContent = task.plan_text || 'No plan yet — generating…';
      planModal.classList.add('active');
      if (task.plan_status !== 'ready') {
        try {
          const res = await fetch(basePath + '/tasks/' + task.task_id + '/plan', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token }
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Plan generation failed');
          task.plan_text = data.plan;
          task.plan_status = 'ready';
          document.getElementById('planBody').textContent = data.plan;
          render();
        } catch (err) {
          document.getElementById('planBody').textContent = 'Plan failed: ' + err.message;
        }
      }
    }
    document.getElementById('closePlan').addEventListener('click', () => planModal.classList.remove('active'));

    async function applyFix(taskId) {
      if (!confirm('Generate fixes with the AI fix agent, commit them to a new branch, and open a PR/MR?')) return;
      document.getElementById('error').textContent = 'Fix agent running — this can take a minute…';
      try {
        const res = await fetch(basePath + '/tasks/' + taskId + '/fix', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Fix failed');
        document.getElementById('error').textContent = '';
        alert('Fix committed. PR: ' + (data.pr_url || data.commit_sha));
        loadTasks();
      } catch (err) {
        document.getElementById('error').textContent = err.message;
      }
    }

    async function releaseTask(taskId) {
      if (!confirm('Release the task lock and return it to the backlog?')) return;
      try {
        const res = await fetch(basePath + '/tasks/' + taskId + '/release', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Release failed');
        loadTasks();
      } catch (err) {
        document.getElementById('error').textContent = err.message;
      }
    }

    document.querySelectorAll('.column').forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
      });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('text/plain');
        const task = tasks.get(taskId);
        if (!task) return;
        const newStatus = col.dataset.status;
        if (newStatus === 'done') {
          openDoneModal(taskId);
          return;
        }
        updateTask(taskId, newStatus);
      });
    });

    document.addEventListener('dragstart', (e) => {
      if (e.target.classList.contains('task')) {
        e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
      }
    });

    async function updateTask(taskId, newStatus, extra = {}) {
      const url = basePath + '/tasks/' + taskId;
      try {
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ status: newStatus, ...extra })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
        const task = tasks.get(taskId);
        if (task) {
          task.status = data.status || newStatus;
          task.assigned_agent = data.assigned_agent || task.assigned_agent;
          task.commit_sha = data.commit_sha || task.commit_sha;
        }
        render();
      } catch (err) {
        document.getElementById('error').textContent = err.message;
      }
    }

    const doneModal = document.getElementById('doneModal');
    let pendingDoneTaskId = null;
    function openDoneModal(taskId) {
      pendingDoneTaskId = taskId;
      document.getElementById('commitSha').value = '';
      document.getElementById('humanApproved').checked = false;
      doneModal.classList.add('active');
    }
    document.getElementById('cancelDone').addEventListener('click', () => {
      doneModal.classList.remove('active');
      pendingDoneTaskId = null;
    });
    document.getElementById('confirmDone').addEventListener('click', () => {
      if (!pendingDoneTaskId) return;
      const commitSha = document.getElementById('commitSha').value.trim();
      if (!commitSha) {
        document.getElementById('error').textContent = 'Commit SHA is required';
        return;
      }
      doneModal.classList.remove('active');
      updateTask(pendingDoneTaskId, 'done', { commit_sha: commitSha, human_approved: document.getElementById('humanApproved').checked });
      pendingDoneTaskId = null;
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
          if (ev.type === 'task_status_change' || ev.type === 'task_updated') {
            loadTasks();
          }
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

    loadTasks();
    decorateNavLinks();
    connect();
  </script>
</body>
</html>`
