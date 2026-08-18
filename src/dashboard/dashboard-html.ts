export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AuditEngine Dashboard</title>
  <style>
    :root {
      --bg: #111;
      --text: #e5e5e5;
      --muted: #888;
      --card: #1a1a1a;
      --border: #333;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #3b82f6;
      --info: #6b7280;
      --green: #22c55e;
      --yellow: #eab308;
      --orange: #f97316;
      --red: #ef4444;
      --accent: #3b82f6;
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
    #auditMeta { color: var(--muted); font-size: 0.85rem; }
    #connection { font-size: 0.85rem; color: var(--muted); }
    #connection.connected { color: var(--green); }
    main {
      padding: 1rem;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1rem;
    }
    section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 1rem;
    }
    section h2 {
      margin: 0 0 0.75rem 0;
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.5rem;
    }
    .agent-card {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.5rem;
      font-size: 0.85rem;
    }
    .agent-card .type { font-weight: 600; }
    .agent-card .state { color: var(--muted); }
    .feed {
      max-height: 320px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .finding {
      background: var(--bg);
      border-left: 4px solid var(--info);
      padding: 0.4rem 0.6rem;
      border-radius: 0 4px 4px 0;
      font-size: 0.85rem;
      animation: slideIn 0.2s ease;
    }
    .finding.critical { border-color: var(--critical); animation: flashRed 0.6s ease; }
    .finding.high { border-color: var(--high); }
    .finding.medium { border-color: var(--medium); }
    .finding.low { border-color: var(--low); }
    .finding .meta { color: var(--muted); font-size: 0.75rem; }
    @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes flashRed { 0%, 100% { box-shadow: 0 0 0 transparent; } 50% { box-shadow: 0 0 12px var(--critical); } }
    .kanban {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
    }
    .column {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      min-height: 120px;
      padding: 0.5rem;
    }
    .column h3 {
      margin: 0 0 0.5rem 0;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--muted);
    }
    .task {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 0.4rem;
      font-size: 0.8rem;
      margin-bottom: 0.4rem;
    }
    .task .conflict {
      display: inline-block;
      background: var(--critical);
      color: #fff;
      font-size: 0.65rem;
      padding: 0.05rem 0.3rem;
      border-radius: 3px;
      margin-left: 0.3rem;
    }
    .budget-bar {
      height: 1.25rem;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      overflow: hidden;
    }
    .budget-fill {
      height: 100%;
      width: 0%;
      background: var(--green);
      transition: width 0.3s ease, background 0.3s ease;
    }
    .budget-text { margin-top: 0.4rem; font-size: 0.85rem; color: var(--muted); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
      margin-top: 0.5rem;
    }
    th, td { text-align: left; padding: 0.35rem 0.3rem; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); }
    .salvation {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-bottom: 0.5rem;
    }
    .salvation summary {
      padding: 0.5rem;
      cursor: pointer;
      font-weight: 600;
    }
    .salvation .body { padding: 0.5rem; font-size: 0.85rem; }
    #budgetOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      display: none;
      place-items: center;
      z-index: 100;
    }
    #budgetOverlay.active { display: grid; }
    #budgetOverlay .box {
      background: var(--card);
      border: 2px solid var(--critical);
      padding: 2rem;
      border-radius: 8px;
      text-align: center;
    }
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

  <header style="padding: 0.75rem 1.5rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
    <div id="auditMeta">Audit: —</div>
    <div id="connection">Disconnected</div>
  </header>

  <div id="noAuditWarning" style="display:none; padding: 1rem 1.5rem; color: var(--muted); border-bottom: 1px solid var(--border);">
    No <code>audit_run_id</code> in the URL. <a href="/audit/new" style="color: var(--accent);">Start a new audit</a> or pick one from <a href="/audits" style="color: var(--accent);">Audits</a>.
  </div>

  <main>
    <section>
      <h2>Agent Status</h2>
      <div id="agents" class="grid"></div>
    </section>

    <section>
      <h2>Findings Feed</h2>
      <div id="findings" class="feed"></div>
    </section>

    <section>
      <h2>Task Board</h2>
      <div id="tasks" class="kanban">
        <div class="column" data-status="backlog"><h3>Backlog</h3></div>
        <div class="column" data-status="in_progress"><h3>In Progress</h3></div>
        <div class="column" data-status="in_review"><h3>In Review</h3></div>
        <div class="column" data-status="done"><h3>Done</h3></div>
      </div>
    </section>

    <section>
      <h2>Budget</h2>
      <div class="budget-bar"><div id="budgetFill" class="budget-fill"></div></div>
      <div id="budgetText" class="budget-text">\$0 / \$0</div>
      <table id="tokenTable">
        <thead><tr><th>Model</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr></thead>
        <tbody></tbody>
      </table>
    </section>

    <section>
      <h2>Salvation Reports</h2>
      <div id="salvations"></div>
    </section>
  </main>

  <div id="budgetOverlay">
    <div class="box">
      <h2>Budget Alert: 95% Spent</h2>
      <p>Spent <span id="overlaySpent">\$0</span> of <span id="overlayBudget">\$0</span>.</p>
    </div>
  </div>

  <script>
    const AGENT_TYPES = ['security','api','frontend','database','architecture','testing','performance','devops','documentation','visual_qa','backend','dependency','a11y','i18n','logging','code_quality','error_handling','configuration','refactoring'];
    const agents = {};
    const tasks = {};
    const tokenUsage = {};
    let budgetTotal = 0;
    let budgetSpent = 0;

    AGENT_TYPES.forEach(type => {
      agents[type] = { state: 'idle', files: 0, findings: 0 };
    });

    const token = localStorage.getItem('auditengine_token');
    const params = new URLSearchParams(location.search);
    const auditRunId = params.get('audit_run_id') || 'default';
    if (!token) location.href = '/login';
    if (auditRunId === 'default') {
      document.getElementById('noAuditWarning').style.display = 'block';
    }

    const els = {
      agents: document.getElementById('agents'),
      findings: document.getElementById('findings'),
      budgetFill: document.getElementById('budgetFill'),
      budgetText: document.getElementById('budgetText'),
      tokenTable: document.querySelector('#tokenTable tbody'),
      salvations: document.getElementById('salvations'),
      connection: document.getElementById('connection'),
      auditMeta: document.getElementById('auditMeta'),
      overlay: document.getElementById('budgetOverlay'),
      overlaySpent: document.getElementById('overlaySpent'),
      overlayBudget: document.getElementById('overlayBudget'),
    };

    els.auditMeta.textContent = 'Audit: ' + auditRunId;

    function renderAgents() {
      els.agents.innerHTML = AGENT_TYPES.map(type => {
        const a = agents[type];
        return \`<div class="agent-card"><div class="type">\${type}</div><div class="state">\${a.state}</div><div class="meta">files: \${a.files} · findings: \${a.findings}</div></div>\`;
      }).join('');
    }

    function addFinding(event) {
      const payload = event.payload || {};
      const severity = payload.severity || 'info';
      const div = document.createElement('div');
      div.className = \`finding \${severity}\`;
      div.innerHTML = \`<div><strong>\${payload.category || 'finding'}</strong> · \${payload.file || ''}</div><div>\${payload.description || ''}</div><div class="meta">\${payload.agent_type || ''} · \${new Date(event.ts).toLocaleTimeString()}</div>\`;
      els.findings.prepend(div);
      if (els.findings.children.length > 50) els.findings.lastElementChild.remove();
      const type = payload.agent_type;
      if (type && agents[type]) agents[type].findings++;
    }

    function renderTasks() {
      document.querySelectorAll('.column .task').forEach(el => el.remove());
      Object.values(tasks).forEach(task => {
        const col = document.querySelector(\`.column[data-status="\${task.status}"]\`);
        if (!col) return;
        const div = document.createElement('div');
        div.className = 'task';
        div.innerHTML = \`<div>#\${task.id.slice(-6)} · score \${task.priority_score}</div><div>findings: \${task.finding_count}\${task.conflict_flag ? '<span class="conflict">CONFLICT</span>' : ''}</div>\`;
        col.appendChild(div);
      });
    }

    function renderBudget() {
      const pct = budgetTotal ? Math.min(100, (budgetSpent / budgetTotal) * 100) : 0;
      els.budgetFill.style.width = pct + '%';
      els.budgetFill.style.background = pct >= 95 ? 'var(--red)' : pct >= 80 ? 'var(--orange)' : pct >= 50 ? 'var(--yellow)' : 'var(--green)';
      els.budgetText.textContent = \`\$\${budgetSpent.toFixed(4)} / \$\${budgetTotal.toFixed(4)} (\${pct.toFixed(1)}%)\`;
    }

    function renderTokenUsage() {
      els.tokenTable.innerHTML = Object.entries(tokenUsage).map(([model, data]) => {
        return \`<tr><td>\${model}</td><td>\${data.calls}</td><td>\${data.tokens}</td><td>\$\${data.cost.toFixed(4)}</td></tr>\`;
      }).join('');
    }

    function handleEvent(event) {
      const payload = event.payload || {};
      switch (event.type) {
        case 'agent_spawned': {
          const type = payload.agent_type;
          if (type && agents[type]) agents[type].state = 'boot';
          break;
        }
        case 'agent_state_change': {
          const type = payload.agent_type;
          if (type && agents[type]) {
            agents[type].state = payload.new_state || 'running';
            if (payload.file) agents[type].files++;
          }
          break;
        }
        case 'finding_created': {
          addFinding(event);
          break;
        }
        case 'gate_rejected':
        case 'gate_passed':
          break;
        case 'salvation_activated': {
          const id = payload.salvation_id || payload.finding_id;
          const div = document.createElement('div');
          div.className = 'salvation';
          div.id = 'salvation-' + id;
          div.innerHTML = \`<details><summary>\${payload.file || id}</summary><div class="body">Activated · \${payload.reason || ''}</div></details>\`;
          els.salvations.prepend(div);
          break;
        }
        case 'salvation_complete': {
          const id = payload.salvation_id || payload.finding_id;
          const el = document.getElementById('salvation-' + id);
          if (el) {
            el.querySelector('.body').innerHTML += \`<br><strong>Complete</strong><br>\${(payload.research_sources || []).map(s => \`<a href="\${s.url}" target="_blank">\${s.source_type}</a>\`).join(' · ')}<br>\${payload.human_recommendation || ''}\`;
          }
          break;
        }
        case 'task_created': {
          tasks[payload.task_id] = {
            id: payload.task_id,
            status: 'backlog',
            priority_score: payload.priority_score || 0,
            finding_count: (payload.finding_ids || []).length,
            conflict_flag: payload.conflict_flag || false,
          };
          renderTasks();
          break;
        }
        case 'task_status_change': {
          if (tasks[payload.task_id]) {
            tasks[payload.task_id].status = payload.new_status || 'backlog';
            renderTasks();
          }
          break;
        }
        case 'budget_alert': {
          budgetSpent = payload.spent_usd ?? budgetSpent;
          budgetTotal = payload.budget_usd ?? budgetTotal;
          renderBudget();
          if (payload.threshold === 95) {
            els.overlaySpent.textContent = '\$' + budgetSpent.toFixed(2);
            els.overlayBudget.textContent = '\$' + budgetTotal.toFixed(2);
            els.overlay.classList.add('active');
          }
          break;
        }
        case 'token_usage': {
          const model = payload.model || 'unknown';
          if (!tokenUsage[model]) tokenUsage[model] = { calls: 0, tokens: 0, cost: 0 };
          tokenUsage[model].calls++;
          tokenUsage[model].tokens += (payload.tokens || 0);
          tokenUsage[model].cost += (payload.cost_usd || 0);
          budgetSpent = payload.spent_usd ?? budgetSpent;
          budgetTotal = payload.budget_usd ?? budgetTotal;
          renderBudget();
          renderTokenUsage();
          break;
        }
        case 'audit_complete': {
          els.connection.textContent = 'Audit complete';
          els.connection.classList.add('connected');
          break;
        }
      }
      renderAgents();
    }

    let ws;
    function connect() {
      const url = new URL('/dashboard/ws', location.origin);
      url.searchParams.set('audit_run_id', auditRunId);
      url.searchParams.set('token', token);
      url.protocol = url.protocol.replace('http', 'ws');
      ws = new WebSocket(url);
      ws.onopen = () => {
        els.connection.textContent = 'Connected';
        els.connection.classList.add('connected');
      };
      ws.onmessage = (e) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch (err) {
          console.error('Bad event', err);
        }
      };
      ws.onclose = () => {
        els.connection.textContent = 'Reconnecting…';
        els.connection.classList.remove('connected');
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }

    renderAgents();
    connect();
  </script>
</body>
</html>
`
