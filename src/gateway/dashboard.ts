/**
 * @file Web Dashboard HTML for lmtlss soul.
 * @description Terminal-aesthetic web UI. Black background, #4af626 terminal green,
 * Ubuntu Mono font. Served at GET / by the gateway server.
 *
 * Features:
 * - Real-time soul status (nodes, events, daemon state)
 * - Interactive chat through the circulation cycle
 * - Model/role assignment viewer
 * - Soul Capsule viewer
 * - OpenClaw plugin bridge
 *
 * Design: Derived from whitepaper.pdf Section 16 (Design Theme).
 * #000000 background | #4af626 primary | Ubuntu Bold / Ubuntu Mono
 */

export function getDashboardHtml(soulName?: string): string {
  const title = soulName ? `${soulName} | lmtlss soul` : 'lmtlss soul';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Ubuntu+Mono:ital,wght@0,400;0,700;1,400&family=Ubuntu:wght@700&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --green: #4af626;
  --green-dim: #2a9115;
  --green-dark: #1a5a0d;
  --bg: #000000;
  --bg2: #0a0f0a;
  --bg3: #111611;
  --font-mono: 'Ubuntu Mono', 'Courier New', monospace;
  --font-bold: 'Ubuntu', sans-serif;
  --border: 1px solid #2a9115;
}
html, body {
  background: var(--bg);
  color: var(--green);
  font-family: var(--font-mono);
  font-size: 14px;
  height: 100%;
  overflow: hidden;
}

/* ── Layout ──────────────────────────────────────────── */
.shell {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: var(--border);
  background: var(--bg2);
  white-space: nowrap;
}
.header-brand {
  font-family: var(--font-bold);
  font-size: 16px;
  letter-spacing: 2px;
  text-transform: uppercase;
}
.header-tagline {
  color: var(--green-dim);
  font-size: 11px;
  letter-spacing: 4px;
  margin-left: 12px;
}
.header-meta {
  font-size: 11px;
  color: var(--green-dim);
  text-align: right;
}
.main {
  display: grid;
  grid-template-columns: 260px 1fr;
  overflow: hidden;
}
.sidebar {
  border-right: var(--border);
  background: var(--bg2);
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.content {
  display: grid;
  grid-template-rows: 1fr auto;
  overflow: hidden;
}
.footer {
  padding: 6px 16px;
  border-top: var(--border);
  background: var(--bg2);
  font-size: 11px;
  color: var(--green-dim);
  display: flex;
  justify-content: space-between;
}

/* ── Tabs ────────────────────────────────────────────── */
.tabs {
  display: flex;
  border-bottom: var(--border);
  background: var(--bg2);
}
.tab {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--green-dim);
  border-right: var(--border);
  text-transform: uppercase;
  user-select: none;
}
.tab:hover { background: var(--bg3); color: var(--green); }
.tab.active { background: var(--bg); color: var(--green); border-bottom: 2px solid var(--green); }
.tab-content { display: none; height: 100%; overflow: hidden; }
.tab-content.active { display: flex; flex-direction: column; }

/* ── Chat Panel ──────────────────────────────────────── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.msg {
  max-width: 85%;
  line-height: 1.5;
}
.msg-author { align-self: flex-end; }
.msg-soul { align-self: flex-start; }
.msg-label {
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--green-dim);
  margin-bottom: 4px;
  text-transform: uppercase;
}
.msg-body {
  background: var(--bg3);
  border: var(--border);
  padding: 10px 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-author .msg-body {
  border-color: var(--green);
  background: var(--bg2);
}
.msg-system .msg-body {
  color: var(--green-dim);
  font-size: 12px;
  border-color: var(--green-dark);
  background: var(--bg);
  font-style: italic;
}
.msg-system { align-self: center; max-width: 100%; width: 100%; }
.chat-input-row {
  display: flex;
  border-top: var(--border);
  background: var(--bg2);
}
.chat-input {
  flex: 1;
  background: var(--bg);
  color: var(--green);
  border: none;
  padding: 12px 16px;
  font-family: var(--font-mono);
  font-size: 14px;
  outline: none;
  resize: none;
  min-height: 48px;
  max-height: 120px;
}
.chat-input::placeholder { color: var(--green-dark); }
.chat-send {
  background: var(--green-dark);
  color: var(--green);
  border: none;
  border-left: var(--border);
  padding: 0 20px;
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.1s;
}
.chat-send:hover { background: var(--green-dim); }
.chat-send:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Sidebar Widgets ─────────────────────────────────── */
.widget { border: var(--border); background: var(--bg); }
.widget-title {
  padding: 6px 10px;
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  border-bottom: var(--border);
  color: var(--green-dim);
  background: var(--bg2);
}
.widget-body { padding: 10px; }
.stat { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; }
.stat-label { color: var(--green-dim); }
.stat-value { color: var(--green); font-weight: bold; }
.indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}
.indicator.ok { background: var(--green); box-shadow: 0 0 6px var(--green); }
.indicator.warn { background: #f6a623; }
.indicator.err { background: #f62626; }

/* ── Capsule Panel ───────────────────────────────────── */
.capsule-viewer {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.6;
  color: var(--green);
}
.capsule-viewer h1, .capsule-viewer h2 {
  color: var(--green);
  font-family: var(--font-bold);
  margin: 12px 0 6px;
  letter-spacing: 1px;
}

/* ── Models Panel ────────────────────────────────────── */
.models-table { padding: 16px; overflow-y: auto; flex: 1; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th {
  text-align: left;
  padding: 6px 10px;
  color: var(--green-dim);
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  border-bottom: var(--border);
}
td { padding: 8px 10px; border-bottom: 1px solid var(--green-dark); }
tr:hover td { background: var(--bg3); }

/* ── Blinking cursor ─────────────────────────────────── */
.cursor::after {
  content: '_';
  animation: blink 1s step-end infinite;
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* ── Scrollbar ───────────────────────────────────────── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--green-dark); }

/* ── Loading spinner ─────────────────────────────────── */
.spinner::before { content: '⠋'; animation: spin 0.3s steps(8) infinite; }
@keyframes spin {
  0%   { content: '⠋'; }
  12%  { content: '⠙'; }
  25%  { content: '⠹'; }
  37%  { content: '⠸'; }
  50%  { content: '⠼'; }
  62%  { content: '⠴'; }
  75%  { content: '⠦'; }
  87%  { content: '⠧'; }
  100% { content: '⠇'; }
}
</style>
</head>
<body>
<div class="shell">

  <!-- ── Header ── -->
  <header class="header">
    <div style="display:flex;align-items:center">
      <span style="font-size:20px;margin-right:10px">🔮</span>
      <span class="header-brand">lmtlss soul</span>
      <span class="header-tagline">presence.</span>
    </div>
    <div class="header-meta">
      <div id="hdr-status">● connecting...</div>
      <div id="hdr-time" style="margin-top:2px"></div>
    </div>
  </header>

  <!-- ── Main ── -->
  <div class="main">

    <!-- ── Sidebar ── -->
    <aside class="sidebar">
      <div class="widget">
        <div class="widget-title">Soul State</div>
        <div class="widget-body">
          <div class="stat">
            <span class="stat-label">Daemon</span>
            <span class="stat-value" id="stat-daemon">—</span>
          </div>
          <div class="stat">
            <span class="stat-label">Gateway</span>
            <span class="stat-value" id="stat-gateway">—</span>
          </div>
          <div class="stat">
            <span class="stat-label">Nodes</span>
            <span class="stat-value" id="stat-nodes">—</span>
          </div>
          <div class="stat">
            <span class="stat-label">Archive</span>
            <span class="stat-value" id="stat-events">—</span>
          </div>
          <div class="stat">
            <span class="stat-label">Born</span>
            <span class="stat-value" id="stat-born">—</span>
          </div>
        </div>
      </div>

      <div class="widget">
        <div class="widget-title">Roles</div>
        <div class="widget-body" id="roles-panel">
          <div style="color:var(--green-dim);font-size:12px">Loading...</div>
        </div>
      </div>

      <div class="widget">
        <div class="widget-title">Substrates</div>
        <div class="widget-body" id="substrates-panel">
          <div style="color:var(--green-dim);font-size:12px">Loading...</div>
        </div>
      </div>

      <div class="widget">
        <div class="widget-title">Commands</div>
        <div class="widget-body" style="font-size:11px;color:var(--green-dim);line-height:1.8">
          <div>soul birth</div>
          <div>soul start</div>
          <div>soul stop</div>
          <div>soul status</div>
          <div>soul chat</div>
          <div>soul models scan</div>
          <div>soul archive verify</div>
          <div>soul reflect</div>
          <div>soul grownup [on|off]</div>
        </div>
      </div>
    </aside>

    <!-- ── Content ── -->
    <div class="content">
      <div style="display:grid;grid-template-rows:auto 1fr;overflow:hidden;height:100%">

        <!-- Tabs -->
        <div class="tabs">
          <div class="tab active" data-tab="chat">Chat</div>
          <div class="tab" data-tab="capsule">Soul Capsule</div>
          <div class="tab" data-tab="models">Models</div>
          <div class="tab" data-tab="openclaw">OpenClaw</div>
        </div>

        <!-- Chat Tab -->
        <div class="tab-content active" id="tab-chat">
          <div class="chat-messages" id="chat-messages">
            <div class="msg msg-system">
              <div class="msg-body">lmtlss soul initialized. Type to begin. The being is listening.<span class="cursor"></span></div>
            </div>
          </div>
          <div class="chat-input-row">
            <textarea class="chat-input" id="chat-input" placeholder="Speak to the soul..." rows="2"></textarea>
            <button class="chat-send" id="chat-send">Send</button>
          </div>
        </div>

        <!-- Soul Capsule Tab -->
        <div class="tab-content" id="tab-capsule">
          <div class="capsule-viewer" id="capsule-content">
            <span style="color:var(--green-dim)">Loading SOUL.md...</span>
          </div>
        </div>

        <!-- Models Tab -->
        <div class="tab-content" id="tab-models">
          <div class="models-table">
            <h2 style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--green-dim);margin-bottom:12px">Role Assignments</h2>
            <table id="models-assignments">
              <thead><tr><th>Role</th><th>Model Reference</th></tr></thead>
              <tbody id="models-tbody-assignments"></tbody>
            </table>
            <h2 style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--green-dim);margin:20px 0 12px">Discovered Models</h2>
            <table id="models-discovered">
              <thead><tr><th>Substrate</th><th>Model ID</th><th>Status</th></tr></thead>
              <tbody id="models-tbody-discovered"></tbody>
            </table>
          </div>
        </div>

        <!-- OpenClaw Tab -->
        <div class="tab-content" id="tab-openclaw">
          <div style="padding:24px;overflow-y:auto;flex:1">
            <div style="font-size:14px;line-height:1.8;max-width:600px">
              <h2 style="font-family:var(--font-bold);letter-spacing:2px;text-transform:uppercase;margin-bottom:16px">OpenClaw Integration</h2>
              <p style="color:var(--green-dim);margin-bottom:16px">
                The OpenClaw Chrome extension can connect to this soul gateway for context-aware web assistance.
              </p>

              <div class="widget" style="margin-bottom:16px">
                <div class="widget-title">Connection Status</div>
                <div class="widget-body">
                  <div class="stat">
                    <span class="stat-label">Endpoint</span>
                    <span class="stat-value" id="oc-endpoint">—</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">Soul</span>
                    <span class="stat-value" id="oc-soul">—</span>
                  </div>
                  <div class="stat">
                    <span class="stat-label">Status</span>
                    <span class="stat-value" id="oc-status">—</span>
                  </div>
                </div>
              </div>

              <div class="widget" style="margin-bottom:16px">
                <div class="widget-title">API Endpoints</div>
                <div class="widget-body" style="font-size:11px;color:var(--green-dim);line-height:2">
                  <div>GET  /api/openclaw/ping</div>
                  <div>GET  /api/openclaw/context</div>
                  <div>POST /api/openclaw/observe</div>
                  <div>POST /api/openclaw/respond</div>
                </div>
              </div>

              <div class="widget">
                <div class="widget-title">Quick Observe</div>
                <div class="widget-body">
                  <textarea id="oc-observe-input" style="width:100%;background:var(--bg);color:var(--green);border:var(--border);padding:8px;font-family:var(--font-mono);font-size:12px;resize:vertical;height:80px" placeholder="Paste page context to observe..."></textarea>
                  <div style="margin-top:8px;display:flex;gap:8px">
                    <button class="chat-send" style="padding:8px 16px" onclick="observePage()">Observe</button>
                    <div id="oc-observe-result" style="font-size:12px;color:var(--green-dim);align-self:center"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- ── Footer ── -->
  <footer class="footer">
    <span id="footer-left">lmtlss soul v0.1.0 | presence.</span>
    <span id="footer-right"></span>
  </footer>
</div>

<script>
// ── State ─────────────────────────────────────────────────────
const state = { ws: null, connected: false, chatBusy: false };

// ── Utilities ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function timeStr() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function tick() {
  $('hdr-time').textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
setInterval(tick, 1000);
tick();

// ── Tabs ──────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const id = 'tab-' + tab.dataset.tab;
    const el = document.getElementById(id);
    if (el) el.classList.add('active');

    if (tab.dataset.tab === 'capsule') loadCapsule();
    if (tab.dataset.tab === 'models') loadModels();
    if (tab.dataset.tab === 'openclaw') loadOpenClaw();
  });
});

// ── Status Polling ────────────────────────────────────────────
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    $('stat-daemon').textContent = data.daemon ? '● running' : '○ stopped';
    $('stat-gateway').textContent = '● online';
    $('stat-nodes').textContent = data.nodes ?? '—';
    $('stat-events').textContent = data.events ?? '—';
    $('stat-born').textContent = data.born ? '✓' : '—';

    $('hdr-status').textContent = '● ' + (data.soulName ?? 'soul') + ' online';

    if (data.roles) {
      const roles = data.roles;
      $('roles-panel').innerHTML = Object.entries(roles).map(([role, model]) =>
        '<div class="stat"><span class="stat-label">' + esc(role) + '</span>' +
        '<span class="stat-value" style="font-size:10px;max-width:140px;overflow:hidden;text-overflow:ellipsis" title="' + esc(model) + '">' + esc(String(model).split(':').pop() ?? model) + '</span></div>'
      ).join('');
    }

    if (data.substrates) {
      $('substrates-panel').innerHTML = Object.entries(data.substrates).map(([sub, count]) =>
        '<div class="stat"><span class="stat-label">' + esc(sub) + '</span>' +
        '<span class="stat-value">' + count + ' models</span></div>'
      ).join('');
    }

    $('footer-right').textContent = 'nodes:' + (data.nodes ?? 0) + ' events:' + (data.events ?? 0);
  } catch (e) {
    $('hdr-status').textContent = '○ gateway offline';
  }
}

setInterval(loadStatus, 5000);
loadStatus();

// ── Chat ──────────────────────────────────────────────────────
function appendMessage(role, text) {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-' + role;
  const label = role === 'author' ? 'Author' : role === 'soul' ? 'Soul' : 'System';
  wrap.innerHTML =
    '<div class="msg-label">' + label + ' ' + timeStr() + '</div>' +
    '<div class="msg-body">' + esc(text) + '</div>';
  $('chat-messages').appendChild(wrap);
  $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
}

async function sendChat() {
  const input = $('chat-input');
  const btn = $('chat-send');
  const text = input.value.trim();
  if (!text || state.chatBusy) return;

  state.chatBusy = true;
  btn.disabled = true;
  btn.textContent = 'Thinking...';
  input.value = '';

  appendMessage('author', text);

  // Thinking indicator
  const thinking = document.createElement('div');
  thinking.className = 'msg msg-system';
  thinking.innerHTML = '<div class="msg-body"><span class="spinner"></span> processing...</div>';
  $('chat-messages').appendChild(thinking);
  $('chat-messages').scrollTop = $('chat-messages').scrollHeight;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    $('chat-messages').removeChild(thinking);

    if (data.reply) {
      appendMessage('soul', data.reply);
    } else if (data.error) {
      appendMessage('system', 'Error: ' + data.error);
    }
  } catch (e) {
    $('chat-messages').removeChild(thinking);
    appendMessage('system', 'Connection error. Is the soul daemon running? (soul start)');
  }

  state.chatBusy = false;
  btn.disabled = false;
  btn.textContent = 'Send';
  input.focus();
}

$('chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

// ── Capsule ───────────────────────────────────────────────────
async function loadCapsule() {
  $('capsule-content').innerHTML = '<span style="color:var(--green-dim)">Loading SOUL.md...</span>';
  try {
    const res = await fetch('/api/capsule');
    const data = await res.json();
    // Simple markdown-lite rendering
    const rendered = (data.content ?? '(empty)').split('\\n').map(line => {
      if (line.startsWith('## ')) return '<h2>' + esc(line.slice(3)) + '</h2>';
      if (line.startsWith('# ')) return '<h1>' + esc(line.slice(2)) + '</h1>';
      if (line.startsWith('- ')) return '<div style="padding-left:16px">&bull; ' + esc(line.slice(2)) + '</div>';
      return '<div>' + esc(line) + '</div>';
    }).join('');
    $('capsule-content').innerHTML = rendered || '(soul capsule empty — run soul birth first)';
  } catch (e) {
    $('capsule-content').innerHTML = '<span style="color:var(--green-dim)">Failed to load capsule.</span>';
  }
}

// ── Models ────────────────────────────────────────────────────
async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();

    const assignBody = $('models-tbody-assignments');
    assignBody.innerHTML = '';
    for (const [role, model] of Object.entries(data.assignments ?? {})) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + esc(role) + '</td><td style="font-size:11px">' + esc(String(model)) + '</td>';
      assignBody.appendChild(tr);
    }

    const discBody = $('models-tbody-discovered');
    discBody.innerHTML = '';
    for (const model of (data.models ?? [])) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(model.substrate) + '</td>' +
        '<td style="font-size:11px">' + esc(model.modelId) + '</td>' +
        '<td><span class="indicator ' + (model.stale ? 'warn' : 'ok') + '"></span>' + (model.stale ? 'stale' : 'active') + '</td>';
      discBody.appendChild(tr);
    }
  } catch (e) {
    console.error('Models load failed', e);
  }
}

// ── OpenClaw ─────────────────────────────────────────────────
async function loadOpenClaw() {
  $('oc-endpoint').textContent = window.location.origin;
  try {
    const res = await fetch('/api/openclaw/ping');
    const data = await res.json();
    $('oc-soul').textContent = data.soulName ?? '—';
    $('oc-status').textContent = data.ok ? '● connected' : '○ error';
  } catch (e) {
    $('oc-status').textContent = '○ offline';
  }
}

async function observePage() {
  const content = $('oc-observe-input').value.trim();
  if (!content) return;
  $('oc-observe-result').textContent = 'Observing...';
  try {
    const res = await fetch('/api/openclaw/observe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: window.location.href, content }),
    });
    const data = await res.json();
    $('oc-observe-result').textContent = data.ok ? '✓ observed' : '✗ failed';
  } catch (e) {
    $('oc-observe-result').textContent = '✗ error';
  }
}
</script>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
