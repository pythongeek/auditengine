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
  </style>
</head>
<body>
  <nav>
    <div class="brand">AuditEngine</div>
    <div>
      <a href="/">Home</a>
      <a href="/audit/new">New Audit</a>
      <a href="/dashboard">Dashboard</a>
    </div>
  </nav>

  <main>
    <h1>Start New Audit</h1>

    <div class="card">
      <label for="auditId">Audit Run ID</label>
      <input type="text" id="auditId" placeholder="run-2026-08-08-001" />
      <div class="hint">Leave blank to auto-generate. Use only letters, numbers, dashes, and underscores.</div>
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

        let filesPayload;
        const pasted = pasteArea.value.trim();
        if (pasted) {
          filesPayload = JSON.parse(pasted);
          if (!Array.isArray(filesPayload)) throw new Error('Pasted JSON must be an array.');
        } else {
          if (selectedFiles.length === 0) {
            throw new Error('Select files or paste a JSON array.');
          }
          filesPayload = await readFiles(selectedFiles);
        }

        if (filesPayload.length === 0) {
          throw new Error('At least one file is required.');
        }

        const resp = await fetch('/audit/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audit_run_id: auditId, files: filesPayload }),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.message || \`HTTP \${resp.status}\`);
        }

        statusEl.className = 'ok';
        statusEl.textContent = \`Audit started: \${auditId}. Redirecting to dashboard…\`;
        setTimeout(() => {
          location.href = \`/dashboard?audit_run_id=\${encodeURIComponent(auditId)}\`;
        }, 1200);
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
