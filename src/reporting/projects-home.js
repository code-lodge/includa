import { faviconLink } from "../utils/favicon.js"

export function renderProjectsHome(projects) {
  const cards = projects.map((p) => renderCardHtml(p)).join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Includa — Projects</title>
${faviconLink()}
<style>
:root {
  --bg: #0f1117;
  --panel: #1a1d27;
  --border: #2a2d3a;
  --accent: #7c6af7;
  --text: #e2e8f0;
  --muted: #8892a4;
  --critical: #ef4444;
  --serious: #f97316;
  --completed: #22c55e;
  --stopped: #f59e0b;
  --running: #7c6af7;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif;min-height:100vh}
a{color:var(--accent);text-decoration:none}
header{background:var(--panel);border-bottom:1px solid var(--border);padding:1rem 2rem;display:flex;align-items:center;gap:1rem}
header h1{font-size:1.25rem;font-weight:600;color:var(--text)}
header .subtitle{color:var(--muted);font-size:.875rem}
main{max-width:1400px;margin:0 auto;padding:2rem}
.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem}
.toolbar h2{font-size:1.1rem;font-weight:600;color:var(--text)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.25rem}
.empty{grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)}
.empty p{margin-top:.5rem;font-size:.9rem}
.card{background:var(--panel);border:1px solid var(--border);border-radius:.75rem;padding:1.25rem;display:flex;flex-direction:column;gap:.75rem;transition:border-color .2s}
.card:hover{border-color:var(--accent)}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem}
.card-title{font-size:1rem;font-weight:600;color:var(--text);word-break:break-word}
.card-url{font-size:.8rem;color:var(--muted);word-break:break-all}
.card-stats{font-size:.8rem;color:var(--muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:.25rem;min-height:1.2rem}
.card-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.25rem}
.status-pill{font-size:.7rem;font-weight:600;padding:.2rem .55rem;border-radius:9999px;white-space:nowrap;flex-shrink:0}
.status-never{background:#2a2d3a;color:var(--muted)}
.status-running{background:rgba(124,106,247,.2);color:var(--running)}
.status-completed{background:rgba(34,197,94,.15);color:var(--completed)}
.status-stopped{background:rgba(245,158,11,.15);color:var(--stopped)}
.status-failed{background:rgba(239,68,68,.15);color:var(--critical)}
.card-error{font-size:.78rem;color:var(--critical);background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:.4rem;padding:.4rem .55rem;word-break:break-word}
.btn{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .9rem;border-radius:.4rem;font-size:.8rem;font-weight:500;cursor:pointer;border:1px solid transparent;transition:opacity .15s,background .15s;text-decoration:none;white-space:nowrap}
.btn:hover{opacity:.85}
.btn-sm{padding:.3rem .7rem;font-size:.78rem}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-danger{background:rgba(239,68,68,.15);color:var(--critical);border-color:rgba(239,68,68,.3)}
.btn-ghost{background:transparent;color:var(--muted);border-color:var(--border)}
.btn-ghost:hover{background:var(--border);color:var(--text);opacity:1}
.btn-delete:hover{color:var(--critical);border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.08)}
.btn-disabled{background:var(--border);color:var(--muted);cursor:default;pointer-events:none;display:inline-flex;align-items:center;border-radius:.4rem;padding:.3rem .7rem;font-size:.78rem;white-space:nowrap}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;align-items:center;justify-content:center}
.overlay.open{display:flex}
.modal{background:var(--panel);border:1px solid var(--border);border-radius:.75rem;padding:1.75rem;width:100%;max-width:460px;display:flex;flex-direction:column;gap:1rem}
.modal h3{font-size:1rem;font-weight:600}
label{font-size:.85rem;color:var(--muted);display:block;margin-bottom:.3rem}
input[type=text],input[type=url]{width:100%;background:#0f1117;border:1px solid var(--border);border-radius:.4rem;padding:.55rem .75rem;color:var(--text);font-size:.9rem;outline:none}
input:focus{border-color:var(--accent)}
.modal-footer{display:flex;justify-content:flex-end;gap:.5rem;margin-top:.25rem}
.error-msg{color:var(--critical);font-size:.8rem;min-height:1rem}
/* --- Log console drawer --- */
.console-toggle{margin-left:auto;position:relative}
.console-badge{display:none;margin-left:.4rem;min-width:1.15rem;height:1.15rem;padding:0 .3rem;border-radius:9999px;background:var(--critical);color:#fff;font-size:.68rem;line-height:1.15rem;text-align:center;font-weight:700}
.console-badge.visible{display:inline-block}
.console-drawer{position:fixed;left:0;right:0;bottom:0;height:42vh;min-height:240px;background:var(--panel);border-top:1px solid var(--border);box-shadow:0 -8px 24px rgba(0,0,0,.4);display:flex;flex-direction:column;transform:translateY(101%);transition:transform .2s ease;z-index:200}
.console-drawer.open{transform:translateY(0)}
.console-head{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;border-bottom:1px solid var(--border);flex-wrap:wrap}
.console-head h3{font-size:.85rem;font-weight:600;margin-right:.25rem}
.console-head select,.console-head input[type=text]{background:#0f1117;border:1px solid var(--border);border-radius:.35rem;color:var(--text);font-size:.78rem;padding:.32rem .5rem;outline:none}
.console-head input[type=text]{flex:1;min-width:120px}
.console-head input:focus,.console-head select:focus{border-color:var(--accent)}
.console-head .spacer{flex-basis:100%;height:0}
.console-head label.inline{display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;color:var(--muted);margin:0}
.console-body{flex:1;overflow:auto;padding:.5rem .75rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.74rem;line-height:1.5}
.cl{white-space:pre-wrap;word-break:break-word;display:flex;gap:.55rem}
.cl .t{color:var(--muted);opacity:.55;flex-shrink:0}
.cl .s{color:var(--muted);opacity:.85;flex-shrink:0}
.cl.error .m{color:var(--critical)}
.cl.warn .m{color:var(--serious)}
.cl.success .m{color:var(--completed)}
.cl.debug{opacity:.65}
.console-empty{color:var(--muted);padding:1.5rem;text-align:center;font-size:.82rem}
</style>
</head>
<body>
<header>
  <div>
    <h1>Includa</h1>
    <div class="subtitle">Accessibility Scanner</div>
  </div>
  <button class="btn btn-ghost console-toggle" id="consoleToggle" title="Show the log console (errors, warnings, scan output) — Ctrl+\`">
    Console<span class="console-badge" id="consoleBadge">0</span>
  </button>
</header>
<main>
  <div class="toolbar">
    <h2 id="project-count">Projects (${projects.length})</h2>
    <button class="btn btn-primary" id="addProjectBtn">+ Add Project</button>
  </div>
  <div class="grid" id="projects-grid">
    ${projects.length === 0 ? '<div class="empty"><strong>No projects yet</strong><p>Add a project to start scanning.</p></div>' : cards}
  </div>
</main>

<div class="overlay" id="project-modal">
  <div class="modal">
    <h3 id="modal-title">Add Project</h3>
    <input type="hidden" id="modal-project-id">
    <div>
      <label for="modal-name">Project Name</label>
      <input type="text" id="modal-name" placeholder="My Website" autocomplete="off">
    </div>
    <div>
      <label for="modal-url">URL</label>
      <input type="url" id="modal-url" placeholder="https://example.com" autocomplete="off">
    </div>
    <div>
      <label for="modal-concurrency">Parallel page scans <span style="opacity:.65;font-weight:400">— lower (e.g. 3) if the site rate-limits</span></label>
      <input type="number" id="modal-concurrency" min="1" max="50" placeholder="10" autocomplete="off">
    </div>
    <div class="error-msg" id="modal-error"></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="cancelModalBtn">Cancel</button>
      <button class="btn btn-primary" id="saveProjectBtn">Save</button>
    </div>
  </div>
</div>

<script>
var POLL_INTERVAL = 2500

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'Add Project'
  document.getElementById('modal-project-id').value = ''
  document.getElementById('modal-name').value = ''
  document.getElementById('modal-url').value = ''
  document.getElementById('modal-concurrency').value = ''
  document.getElementById('modal-error').textContent = ''
  document.getElementById('project-modal').classList.add('open')
  document.getElementById('modal-name').focus()
}

function openEditModal(id, name, url, concurrency) {
  document.getElementById('modal-title').textContent = 'Edit Project'
  document.getElementById('modal-project-id').value = id
  document.getElementById('modal-name').value = name
  document.getElementById('modal-url').value = url
  document.getElementById('modal-concurrency').value = concurrency || ''
  document.getElementById('modal-error').textContent = ''
  document.getElementById('project-modal').classList.add('open')
  document.getElementById('modal-name').focus()
}

function closeModal() {
  document.getElementById('project-modal').classList.remove('open')
}

document.getElementById('addProjectBtn').addEventListener('click', openAddModal)
document.getElementById('cancelModalBtn').addEventListener('click', closeModal)
document.getElementById('project-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal()
})
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal()
  if (e.key === 'Enter' && document.getElementById('project-modal').classList.contains('open')) saveProject()
})

async function saveProject() {
  var id = document.getElementById('modal-project-id').value
  var name = document.getElementById('modal-name').value.trim()
  var url = document.getElementById('modal-url').value.trim()
  var concurrencyRaw = document.getElementById('modal-concurrency').value.trim()
  var errEl = document.getElementById('modal-error')

  if (!name) { errEl.textContent = 'Name is required'; return }
  if (!url) { errEl.textContent = 'URL is required'; return }
  try { new URL(url) } catch(e) { errEl.textContent = 'Enter a valid URL'; return }

  var payload = { name: name, url: url }
  if (concurrencyRaw) {
    var concurrency = parseInt(concurrencyRaw, 10)
    if (!(concurrency >= 1)) { errEl.textContent = 'Parallel page scans must be a whole number of at least 1'; return }
    payload.options = { concurrency: concurrency }
  }

  errEl.textContent = ''
  try {
    if (id) {
      await fetch('/api/projects/' + id, { method: 'PATCH', headers: {'content-type':'application/json'}, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/projects', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(payload) })
    }
    closeModal()
    await refreshProjects()
  } catch (err) {
    errEl.textContent = 'Error: ' + err.message
  }
}

document.getElementById('saveProjectBtn').addEventListener('click', saveProject)

// Event delegation — all card button actions
document.getElementById('projects-grid').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]')
  if (!btn) return
  var action = btn.dataset.action
  var id = btn.dataset.id
  if (!id) return
  if (action === 'start') { startProject(id) }
  else if (action === 'stop') { stopProject(id) }
  else if (action === 'resume') { resumeProject(id) }
  else if (action === 'edit') { openEditModal(id, btn.dataset.name || '', btn.dataset.url || '', btn.dataset.concurrency || '') }
  else if (action === 'delete') { deleteProject(id) }
})

async function startProject(id) {
  await fetch('/api/projects/' + id + '/scan', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' })
  await refreshProjects()
}

async function stopProject(id) {
  await fetch('/api/projects/' + id + '/scan/stop', { method: 'POST' })
  await refreshProjects()
}

async function resumeProject(id) {
  await fetch('/api/projects/' + id + '/scan/resume', { method: 'POST' })
  await refreshProjects()
}

async function deleteProject(id) {
  if (!confirm('Delete this project? The project record will be removed (scan reports on disk are kept).')) return
  await fetch('/api/projects/' + id, { method: 'DELETE' })
  await refreshProjects()
}

async function refreshProjects() {
  try {
    var res = await fetch('/api/projects?ts=' + Date.now())
    if (!res.ok) return
    var projects = await res.json()
    renderGrid(projects)
  } catch(e) {}
}

function statusClass(p) {
  var s = p.scanRunning ? 'running' : (p.lastScanStatus || 'never')
  return 'status-' + s
}

function statusLabel(p) {
  if (p.scanRunning) return 'Running'
  var map = { never: 'Never scanned', running: 'Running', completed: 'Completed', stopped: 'Stopped', failed: 'Failed' }
  return map[p.lastScanStatus] || 'Never scanned'
}

function renderCardHtml(p) {
  var sc = statusClass(p)
  var sl = statusLabel(p)
  var lastScan = p.lastScanAt ? 'Last scan: ' + new Date(p.lastScanAt).toLocaleString() : 'No scans yet'
  var stats = p.lastPages != null
    ? p.lastPages.toLocaleString() + ' pages' + (p.lastViolations != null ? ' &bull; ' + p.lastViolations.toLocaleString() + ' violations' : '')
    : ''

  var dashLink = p.lastScanDir
    ? '<a class="btn btn-sm" href="/projects/' + p.id + '/" target="_blank">Open Dashboard</a>'
    : '<span class="btn-disabled">No Report Yet</span>'

  var exportBtn = p.lastScanDir
    ? '<a class="btn btn-sm btn-ghost" href="/api/projects/' + p.id + '/export.zip" title="Download a self-contained static HTML site of this scan">Export</a>'
    : ''

  var startBtn = p.scanRunning
    ? '<button class="btn btn-sm btn-danger" data-action="stop" data-id="' + p.id + '">Stop Scan</button>'
    : '<button class="btn btn-sm btn-primary" data-action="start" data-id="' + p.id + '">Start Scan</button>'

  var resumeBtn = (!p.scanRunning && p.lastScanStatus === 'stopped')
    ? '<button class="btn btn-sm" data-action="resume" data-id="' + p.id + '">Resume</button>'
    : ''

  var errBlock = (!p.scanRunning && p.lastScanStatus === 'failed' && p.lastScanError)
    ? '<div class="card-error" role="alert">⚠ ' + escHtml(p.lastScanError) + '</div>'
    : ''

  return '<div class="card" id="card-' + p.id + '" data-id="' + p.id + '">' +
    '<div class="card-header">' +
      '<div class="card-title">' + escHtml(p.name) + '</div>' +
      '<span class="status-pill ' + sc + '">' + sl + '</span>' +
    '</div>' +
    '<div class="card-url">' + escHtml(p.url) + '</div>' +
    '<div class="card-stats">' + (stats ? '<span>' + stats + '</span>' : '') + '<span>' + lastScan + '</span></div>' +
    errBlock +
    '<div class="card-actions">' +
      startBtn + resumeBtn + dashLink + exportBtn +
      '<button class="btn btn-sm btn-ghost" data-action="edit" data-id="' + p.id + '" data-name="' + escHtml(p.name) + '" data-url="' + escHtml(p.url) + '" data-concurrency="' + ((p.options && p.options.concurrency) || '') + '">Edit</button>' +
      '<button class="btn btn-sm btn-ghost btn-delete" data-action="delete" data-id="' + p.id + '">Delete</button>' +
    '</div>' +
  '</div>'
}

function renderGrid(projects) {
  var grid = document.getElementById('projects-grid')
  var countEl = document.getElementById('project-count')
  countEl.textContent = 'Projects (' + projects.length + ')'
  if (projects.length === 0) {
    grid.innerHTML = '<div class="empty"><strong>No projects yet</strong><p>Add a project to start scanning.</p></div>'
    return
  }
  var ids = new Set(projects.map(function(p) { return p.id }))
  Array.from(grid.querySelectorAll('.card')).forEach(function(el) {
    if (!ids.has(el.dataset.id)) el.remove()
  })
  projects.forEach(function(p) {
    var existing = document.getElementById('card-' + p.id)
    var tmp = document.createElement('div')
    tmp.innerHTML = renderCardHtml(p)
    var newCard = tmp.firstElementChild
    if (existing) {
      grid.replaceChild(newCard, existing)
    } else {
      grid.appendChild(newCard)
    }
  })
}

setInterval(refreshProjects, POLL_INTERVAL)
</script>

<div class="console-drawer" id="consoleDrawer" role="region" aria-label="Log console">
  <div class="console-head">
    <h3>Console</h3>
    <select id="consoleLevel" title="Minimum level to show">
      <option value="0">All</option>
      <option value="1" selected>Info &amp; up</option>
      <option value="2">Warnings &amp; up</option>
      <option value="3">Errors only</option>
    </select>
    <input type="text" id="consoleSearch" placeholder="Filter text…" autocomplete="off">
    <label class="inline"><input type="checkbox" id="consoleAutoscroll" checked> Autoscroll</label>
    <span class="spacer"></span>
    <button class="btn btn-sm btn-ghost" id="consoleCopy">Copy</button>
    <a class="btn btn-sm btn-ghost" href="/api/logs.txt" download="includa-logs.txt">Download</a>
    <button class="btn btn-sm btn-ghost" id="consoleClear">Clear view</button>
    <button class="btn btn-sm btn-ghost" id="consoleClose">Close</button>
  </div>
  <div class="console-body" id="consoleBody"></div>
</div>

<script>
(function() {
  var drawer = document.getElementById('consoleDrawer')
  var badge = document.getElementById('consoleBadge')
  var body = document.getElementById('consoleBody')
  var levelSel = document.getElementById('consoleLevel')
  var searchEl = document.getElementById('consoleSearch')
  var autoscrollEl = document.getElementById('consoleAutoscroll')
  var RANK = { debug: 0, info: 1, success: 1, warn: 2, error: 3 }
  var MAX = 2000
  var entries = []
  var unread = 0
  var open = false

  function passes(e) {
    if ((RANK[e.level] != null ? RANK[e.level] : 1) < Number(levelSel.value)) return false
    var q = searchEl.value.trim().toLowerCase()
    if (q && ((e.message || '') + ' ' + (e.source || '')).toLowerCase().indexOf(q) === -1) return false
    return true
  }

  function fmtTime(iso) {
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    function p(n) { return (n < 10 ? '0' : '') + n }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  }

  function lineHtml(e) {
    return '<div class="cl ' + (e.level || 'info') + '">' +
      '<span class="t">' + fmtTime(e.at) + '</span>' +
      '<span class="s">' + escHtml(e.source || '') + '</span>' +
      '<span class="m">' + escHtml(e.message || '') + '</span>' +
    '</div>'
  }

  function render() {
    var visible = entries.filter(passes)
    if (visible.length === 0) {
      body.innerHTML = '<div class="console-empty">No log entries match the current filter.</div>'
      return
    }
    var html = ''
    for (var i = 0; i < visible.length; i++) html += lineHtml(visible[i])
    body.innerHTML = html
    if (autoscrollEl.checked) body.scrollTop = body.scrollHeight
  }

  function addEntry(e) {
    entries.push(e)
    if (entries.length > MAX) entries.shift()
    if (open && passes(e)) {
      var empty = body.querySelector('.console-empty')
      if (empty) body.innerHTML = ''
      body.insertAdjacentHTML('beforeend', lineHtml(e))
      if (autoscrollEl.checked) body.scrollTop = body.scrollHeight
    } else if (!open && e.level === 'error') {
      unread++
      badge.textContent = unread > 99 ? '99+' : String(unread)
      badge.classList.add('visible')
    }
  }

  function openDrawer() { open = true; drawer.classList.add('open'); unread = 0; badge.classList.remove('visible'); render() }
  function closeDrawer() { open = false; drawer.classList.remove('open') }
  function toggleDrawer() { if (open) closeDrawer(); else openDrawer() }

  document.getElementById('consoleToggle').addEventListener('click', toggleDrawer)
  document.getElementById('consoleClose').addEventListener('click', closeDrawer)
  document.getElementById('consoleClear').addEventListener('click', function() { entries = []; render() })
  levelSel.addEventListener('change', render)
  searchEl.addEventListener('input', render)

  document.getElementById('consoleCopy').addEventListener('click', function() {
    var btn = this
    var text = entries.filter(passes).map(function(e) {
      return e.at + ' [' + String(e.level || 'info').toUpperCase() + '] ' + (e.source || '') + ': ' + (e.message || '')
    }).join('\\n')
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = 'Copy' }, 1500)
      }, function() {})
    }
  })

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === '\`') { e.preventDefault(); toggleDrawer() }
  })

  try {
    var es = new EventSource('/api/logs/stream')
    es.onmessage = function(ev) { try { addEntry(JSON.parse(ev.data)) } catch (_e) {} }
  } catch (_e) {}
})()
</script>
</body>
</html>`
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function renderCardHtml(p) {
  const sc = p.scanRunning ? "status-running"
    : { never: "status-never", completed: "status-completed", stopped: "status-stopped", failed: "status-failed" }[p.lastScanStatus] || "status-never"
  const sl = p.scanRunning ? "Running"
    : { never: "Never scanned", completed: "Completed", stopped: "Stopped", failed: "Failed" }[p.lastScanStatus] || "Never scanned"
  const lastScan = p.lastScanAt ? `Last scan: ${new Date(p.lastScanAt).toLocaleString()}` : "No scans yet"
  const stats = p.lastPages != null
    ? `${p.lastPages.toLocaleString()} pages${p.lastViolations != null ? ` &bull; ${p.lastViolations.toLocaleString()} violations` : ""}`
    : ""
  const dashLink = p.lastScanDir
    ? `<a class="btn btn-sm" href="/projects/${p.id}/" target="_blank">Open Dashboard</a>`
    : `<span class="btn-disabled">No Report Yet</span>`
  const exportBtn = p.lastScanDir
    ? `<a class="btn btn-sm btn-ghost" href="/api/projects/${p.id}/export.zip" title="Download a self-contained static HTML site of this scan">Export</a>`
    : ""
  const startBtn = p.scanRunning
    ? `<button class="btn btn-sm btn-danger" data-action="stop" data-id="${p.id}">Stop Scan</button>`
    : `<button class="btn btn-sm btn-primary" data-action="start" data-id="${p.id}">Start Scan</button>`
  const resumeBtn = !p.scanRunning && p.lastScanStatus === "stopped"
    ? `<button class="btn btn-sm" data-action="resume" data-id="${p.id}">Resume</button>`
    : ""
  const errBlock = !p.scanRunning && p.lastScanStatus === "failed" && p.lastScanError
    ? `<div class="card-error" role="alert">⚠ ${escHtml(p.lastScanError)}</div>`
    : ""

  return `<div class="card" id="card-${p.id}" data-id="${p.id}">
  <div class="card-header">
    <div class="card-title">${escHtml(p.name)}</div>
    <span class="status-pill ${sc}">${sl}</span>
  </div>
  <div class="card-url">${escHtml(p.url)}</div>
  <div class="card-stats">${stats ? `<span>${stats}</span>` : ""}<span>${lastScan}</span></div>
  ${errBlock}
  <div class="card-actions">
    ${startBtn}${resumeBtn}${dashLink}${exportBtn}
    <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${p.id}" data-name="${escHtml(p.name)}" data-url="${escHtml(p.url)}" data-concurrency="${p.options?.concurrency ?? ""}">Edit</button>
    <button class="btn btn-sm btn-ghost btn-delete" data-action="delete" data-id="${p.id}">Delete</button>
  </div>
</div>`
}
