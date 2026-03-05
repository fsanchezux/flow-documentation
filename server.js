const express = require('express')
const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const { marked } = require('marked')
const { spawnSync, exec } = require('child_process')

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000
const CONFIG_FILE = path.join(process.env.USER_DATA_PATH || __dirname, 'skilldocs.config.json')

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      if (cfg.skillsDir && fs.existsSync(cfg.skillsDir)) return cfg.skillsDir
    }
  } catch (_) {}
  return null
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ skillsDir: SKILLS_DIR }, null, 2))
}

let SKILLS_DIR = loadConfig() || null

// ─── Search flags ─────────────────────────────────────────────────────────────
// Add new flags here.
//   dirs: top-level subdirectory names to restrict search to (null = all dirs)
//   exts: file extensions to restrict search to (null = all extensions)
// Multiple flags combine with OR logic (union of dirs and exts).

const SEARCH_FLAGS = {
  '--ejemplo': { label: 'Ejemplos',    dirs: null,              exts: ['.vb', '.js', '.html', '.cs'] },
  '--ref':     { label: 'Referencias', dirs: ['references'],    exts: null },
  '--lib':     { label: 'Librerías',   dirs: ['libraries'],     exts: null },
  '--style':   { label: 'Estilos',     dirs: ['style'],         exts: ['.css'] },
  '--script':  { label: 'Scripts',     dirs: ['scripts'],       exts: ['.js'] },
  '--sql':     { label: 'SQL',         dirs: null,              exts: ['.sql'] },
  '--doc':     { label: 'Docs',        dirs: null,              exts: ['.md'] },
  '--vb':      { label: 'VB.NET',      dirs: null,              exts: ['.vb'] },
}

// ─── Marked setup (syntax highlight via highlight.js token names) ─────────────

marked.use({
  renderer: {
    code(code, lang) {
      lang = lang || 'plaintext'
      const escaped = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return `
<div class="code-block">
  <div class="code-header">
    <span class="code-lang">${lang}</span>
    <button class="btn-copy" onclick="copyCode(this)" title="Copiar código">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copiar
    </button>
  </div>
  <pre><code class="hljs language-${lang}">${escaped}</code></pre>
</div>`
    }
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeJoin(base, ...parts) {
  const resolved = path.resolve(base, ...parts)
  if (!resolved.startsWith(base)) throw new Error('Path traversal detected')
  return resolved
}

function getSkillList() {
  if (!SKILLS_DIR || !fs.existsSync(SKILLS_DIR)) return []
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const skillMd = path.join(SKILLS_DIR, d.name, 'SKILL.md')
      let description = ''
      if (fs.existsSync(skillMd)) {
        const firstLines = fs.readFileSync(skillMd, 'utf-8').split('\n').slice(0, 5).join('\n')
        const m = firstLines.match(/^#\s+(.+)/m)
        description = m ? m[1] : ''
      }
      return { name: d.name, description }
    })
}

function extractSections(markdown) {
  const sections = []
  const lines = markdown.split('\n')
  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/)
    if (m) {
      const level = m[1].length
      const title = m[2].trim()
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      sections.push({ level, title, id })
    }
  }
  return sections
}

function renderSkill(skillName) {
  if (!SKILLS_DIR) return null
  const skillDir = safeJoin(SKILLS_DIR, skillName)
  const skillMd = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(skillMd)) return null

  let content = fs.readFileSync(skillMd, 'utf-8')

  // Resolve file references: links like [foo](examples/bar.vb) embed inline
  content = content.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g, (match, text, ref) => {
    const refPath = safeJoin(skillDir, ref)
    if (fs.existsSync(refPath)) {
      const ext = path.extname(ref).replace('.', '')
      const fileContent = fs.readFileSync(refPath, 'utf-8')
      return `**${text}** (\`${ref}\`)\n\`\`\`${ext}\n${fileContent}\n\`\`\``
    }
    return match
  })

  // Add heading IDs manually by injecting anchors
  content = content.replace(/^(#{1,3})\s+(.+)$/gm, (match, hashes, title) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return `${hashes} <a id="${id}"></a>${title}`
  })

  const rawContent = fs.readFileSync(skillMd, 'utf-8')
  const html = marked.parse(content)
  const sections = extractSections(rawContent)
  return { html, sections, rawContent }
}

function searchSkills(query, activeFlags = []) {
  const q = query.toLowerCase()
  const results = []

  if (!SKILLS_DIR || !fs.existsSync(SKILLS_DIR)) return results

  // Build dir/ext filters from active flags (OR logic: union of all flag constraints)
  let allowedDirs = null  // null = no restriction
  let allowedExts = null  // null = no restriction

  if (activeFlags.length > 0) {
    const dirSet = new Set()
    const extSet = new Set()
    let anyDirRestriction = false
    let anyExtRestriction = false

    for (const flagName of activeFlags) {
      const flagDef = SEARCH_FLAGS[flagName]
      if (!flagDef) continue
      if (flagDef.dirs !== null) { anyDirRestriction = true; flagDef.dirs.forEach(d => dirSet.add(d)) }
      if (flagDef.exts !== null) { anyExtRestriction = true; flagDef.exts.forEach(e => extSet.add(e)) }
    }

    if (anyDirRestriction) allowedDirs = dirSet
    if (anyExtRestriction) allowedExts = extSet
  }

  const ALL_EXTS = ['.md', '.vb', '.sql', '.html', '.js', '.txt', '.cs']
  // Collect more results when flags are active so sorting by priority works well
  const collectLimit = activeFlags.length > 0 ? 150 : 50

  function searchDir(dir, skillName, depth = 0) {
    // In flag-only mode (no query text) ignore dir/ext filters so @tag markers
    // in any file type are reachable (e.g. <!-- @ejemplo --> in a .md file).
    const flagOnlyMode = q.length < 2
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!flagOnlyMode && depth === 0 && allowedDirs !== null && !allowedDirs.has(entry.name)) continue
        searchDir(fullPath, skillName, depth + 1)
      } else {
        if (!flagOnlyMode && depth === 0 && allowedDirs !== null) continue  // skip root-level files when dir filter active
        const ext = path.extname(entry.name)
        if (!ALL_EXTS.includes(ext)) continue
        if (!flagOnlyMode && allowedExts !== null && !allowedExts.has(ext)) continue
        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          const lines = content.split('\n')

          // ── Priority zones ──────────────────────────────────────────────────
          // A zone starts at any line containing  @flagname  (e.g. <!-- @ejemplo -->)
          // and extends up to ZONE_LINES lines forward, stopping early if another
          // @tag (for a different flag) is found.  Works for every file type:
          //   Markdown / HTML : <!-- @ejemplo -->
          //   JavaScript      : // @ejemplo
          //   VB / VBScript   : ' @ejemplo
          //   SQL             : -- @ejemplo
          //   CSS             : /* @ejemplo */
          const priorityLineSet = new Set()
          if (activeFlags.length > 0) {
            const ZONE_LINES = 50
            for (const flagName of activeFlags) {
              const tagName = flagName.replace(/^--/, '')
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('@' + tagName)) {
                  const zoneEnd = Math.min(lines.length - 1, i + ZONE_LINES)
                  for (let j = i; j <= zoneEnd; j++) {
                    // Stop zone if a *different* @tag appears
                    if (j > i && lines[j].includes('@') && !lines[j].includes('@' + tagName)) break
                    priorityLineSet.add(j)
                  }
                }
              }
            }
          }
          // ───────────────────────────────────────────────────────────────────

          const relPath = path.relative(path.join(SKILLS_DIR, skillName), fullPath)
          for (let i = 0; i < lines.length; i++) {
            const inPriority = priorityLineSet.has(i)
            // flag-only mode (no query): return only tagged lines
            // normal mode: return lines matching the query text
            const isMatch = q.length >= 2
              ? lines[i].toLowerCase().includes(q)
              : inPriority
            if (isMatch) {
              results.push({
                skill: skillName,
                file: relPath,
                line: i + 1,
                context: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
                match: lines[i].trim(),
                priority: activeFlags.length > 0 && inPriority
              })
              if (results.length >= collectLimit) return
            }
          }
        } catch (_) {}
      }
    }
  }

  const skills = getSkillList()
  for (const skill of skills) {
    searchDir(path.join(SKILLS_DIR, skill.name), skill.name)
    if (results.length >= collectLimit) break
  }

  // Sort: priority (marked) results first, keep relative order within each group
  if (activeFlags.length > 0) {
    results.sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0))
  }

  return results.slice(0, 50)
}

// ─── SSE clients for hot-reload ───────────────────────────────────────────────

const sseClients = new Set()

function notifyReload(changedPath) {
  const rel = path.relative(SKILLS_DIR, changedPath)
  const payload = JSON.stringify({ type: 'reload', file: rel })
  for (const res of sseClients) {
    res.write(`data: ${payload}\n\n`)
  }
}

function startWatcher(dir) {
  return chokidar.watch(dir, { ignoreInitial: true, persistent: true })
    .on('add', notifyReload)
    .on('change', notifyReload)
    .on('unlink', notifyReload)
}

let watcher = SKILLS_DIR ? startWatcher(SKILLS_DIR) : null

// ─── Folder picker (overridable by Electron) ──────────────────────────────────

let folderPickerFn = null
let fileOpenerFn = null
let urlOpenerFn = null

function setFolderPicker(fn) {
  folderPickerFn = fn
}

function setFileOpener(fn) {
  fileOpenerFn = fn
}

function setUrlOpener(fn) {
  urlOpenerFn = fn
}

// ─── App ─────────────────────────────────────────────────────────────────────

const app = express()

app.use(express.static(__dirname))

// Hot-reload SSE endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write('data: {"type":"connected"}\n\n')
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

// List all skills
app.get('/api/skills', (req, res) => {
  res.json(getSkillList())
})

// Get rendered skill
app.get('/api/skills/:name', (req, res) => {
  try {
    const result = renderSkill(req.params.name)
    if (!result) return res.status(404).json({ error: 'Skill not found' })
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Get raw file from a skill
app.get('/api/skills/:name/file', (req, res) => {
  if (!SKILLS_DIR) return res.status(503).json({ error: 'No hay carpeta configurada' })
  try {
    const skillDir = safeJoin(SKILLS_DIR, req.params.name)
    const filePath = safeJoin(skillDir, req.query.path || '')
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' })
    const content = fs.readFileSync(filePath, 'utf-8')
    const ext = path.extname(filePath).slice(1)
    if (ext === 'md') {
      let mdContent = content.replace(/^(#{1,3})\s+(.+)$/gm, (match, hashes, title) => {
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        return `${hashes} <a id="${id}"></a>${title}`
      })
      res.json({ html: marked.parse(mdContent), sections: extractSections(content), ext, rawContent: content })
    } else {
      res.json({ content, ext })
    }
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Directory tree of a skill
app.get('/api/skills/:name/tree', (req, res) => {
  if (!SKILLS_DIR) return res.status(503).json({ error: 'No hay carpeta configurada' })
  try {
    const skillDir = safeJoin(SKILLS_DIR, req.params.name)
    if (!fs.existsSync(skillDir)) return res.status(404).json({ error: 'Skill not found' })

    function buildTree(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      const nodes = []
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const fullPath = path.join(dir, entry.name)
        const relPath = path.relative(skillDir, fullPath).replace(/\\/g, '/')
        if (entry.isDirectory()) {
          nodes.push({ type: 'dir', name: entry.name, path: relPath, children: buildTree(fullPath) })
        } else if (entry.name !== 'SKILL.md') {
          nodes.push({ type: 'file', name: entry.name, path: relPath, ext: path.extname(entry.name).slice(1) })
        }
      }
      return nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    }

    res.json(buildTree(skillDir))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// List available search flags
app.get('/api/flags', (req, res) => {
  res.json(Object.entries(SEARCH_FLAGS).map(([flag, def]) => ({ flag, label: def.label })))
})

// Search
app.get('/api/search', (req, res) => {
  const q = req.query.q || ''
  const flags = (req.query.flags || '').split(',').map(f => f.trim()).filter(Boolean)
  if (q.length < 2 && !flags.length) return res.json([])
  res.json(searchSkills(q, flags))
})

// Get current config
app.get('/api/config', (req, res) => {
  res.json({ skillsDir: SKILLS_DIR })
})

// Open native folder picker dialog
app.post('/api/pick-folder', async (req, res) => {
  let selectedPath

  if (folderPickerFn) {
    // Electron mode: use native Electron dialog
    selectedPath = await folderPickerFn()
  } else {
    // Standalone Node mode: use PowerShell (Windows only)
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Seleccionar carpeta de documentacion'
$f.RootFolder = [System.Environment+SpecialFolder]::MyComputer
$f.ShowNewFolderButton = $false
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }
`
    const result = spawnSync('powershell', ['-NoProfile', '-Command', psScript], {
      timeout: 120000,
      encoding: 'utf-8'
    })
    selectedPath = (result.stdout || '').trim()
  }

  if (!selectedPath) return res.json({ cancelled: true })
  res.json({ path: selectedPath })
})

// Change the active skills directory
app.post('/api/set-dir', express.json(), (req, res) => {
  const newDir = req.body && req.body.path
  if (!newDir || typeof newDir !== 'string') return res.status(400).json({ error: 'Ruta inválida' })
  const resolved = path.resolve(newDir)
  if (!fs.existsSync(resolved)) return res.status(400).json({ error: 'La carpeta no existe' })

  SKILLS_DIR = resolved
  saveConfig()

  // Restart file watcher on new directory
  if (watcher) watcher.close()
  watcher = startWatcher(SKILLS_DIR)

  res.json({ success: true, skillsDir: SKILLS_DIR })
})

// Save file content
app.put('/api/skills/:name/file', express.json({ limit: '10mb' }), (req, res) => {
  if (!SKILLS_DIR) return res.status(503).json({ error: 'No hay carpeta configurada' })
  try {
    const skillDir = safeJoin(SKILLS_DIR, req.params.name)
    const relPath = req.query.path || 'SKILL.md'
    const filePath = safeJoin(skillDir, relPath)
    if (typeof req.body.content !== 'string') return res.status(400).json({ error: 'Contenido inválido' })
    fs.writeFileSync(filePath, req.body.content, 'utf-8')
    res.json({ success: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Open file location in Explorer
app.post('/api/open-folder', express.json(), (req, res) => {
  if (!SKILLS_DIR) return res.status(503).json({ error: 'No hay carpeta configurada' })
  try {
    const { skill, filePath } = req.body
    if (!skill || typeof skill !== 'string') return res.status(400).json({ error: 'Parámetros inválidos' })
    const skillDir = safeJoin(SKILLS_DIR, skill)
    const fullPath = filePath ? safeJoin(skillDir, filePath) : skillDir
    if (fileOpenerFn) {
      fileOpenerFn(fullPath)
    } else {
      const winPath = fullPath.replace(/\//g, '\\')
      exec(`explorer /select,"${winPath}"`)
    }
    res.json({ success: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// Open external URL in system browser
app.post('/api/open-url', express.json(), (req, res) => {
  const { url } = req.body || {}
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL inválida' })
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Solo URLs http/https' })
  try {
    if (urlOpenerFn) {
      urlOpenerFn(url)
    } else {
      exec(`start "" "${url.replace(/"/g, '')}"`)
    }
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Global error handler — always return JSON, never HTML
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

if (require.main === module) {
  app.listen(PORT)
}

module.exports = { app, setFolderPicker, setFileOpener, setUrlOpener, PORT }
