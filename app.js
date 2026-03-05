// ─── State ────────────────────────────────────────────────────────────────────

let currentSkill = null
let searchTimeout = null
let availableFlags = []
let currentSkillsDir = ''
let currentFilePath = null   // null = SKILL.md
let currentRawContent = ''
let editorMode = false

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadSkillList()
  loadFlags()
  initSearch()
  initHotReload()
  initKeyboard()
  initTreeEvents()
  initFolderSelector()
  initContextMenu()
  initEditorToggle()
  initTocResizer()

  // Restore last skill/file from URL hash
  const hash = location.hash.slice(1)
  if (hash) {
    const slashIdx = hash.indexOf('/')
    if (slashIdx === -1) {
      loadSkill(hash)
    } else {
      const skill = hash.slice(0, slashIdx)
      const rest = decodeURIComponent(hash.slice(slashIdx + 1))
      // If rest looks like a file path (has a dot in the filename part), load as file
      const lastName = rest.split('/').pop()
      if (lastName.includes('.')) {
        loadSkill(skill).then(() => loadFile(skill, rest))
      } else {
        loadSkill(skill, rest)
      }
    }
  }
})

// ─── Skill list ───────────────────────────────────────────────────────────────

async function loadSkillList() {
  const res = await fetch('/api/skills')
  const skills = await res.json()
  const nav = document.getElementById('skillList')

  if (skills.length === 0) {
    nav.innerHTML = `<div class="empty-state">
      ${currentSkillsDir ? 'No se encontraron skills en esta carpeta.' : 'Selecciona una carpeta para comenzar.'}
    </div>`
    return
  }

  nav.innerHTML = skills.map(s => `
    <div class="skill-item ${currentSkill === s.name ? 'active' : ''}"
         data-skill="${escAttr(s.name)}">
      <div class="skill-name">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        ${escHtml(s.name)}
      </div>
      ${s.description ? `<div class="skill-desc">${escHtml(s.description)}</div>` : ''}
    </div>
  `).join('')

  // Click on skill item → load SKILL.md
  nav.querySelectorAll('.skill-item').forEach(el => {
    el.addEventListener('click', () => loadSkill(el.dataset.skill))
  })
}

// ─── Load & render skill ──────────────────────────────────────────────────────

async function loadSkill(name, section = null) {
  currentSkill = name

  document.querySelectorAll('.skill-item').forEach(el => {
    el.classList.toggle('active', el.dataset.skill === name)
  })
  document.querySelectorAll('.tree-file').forEach(el => el.classList.remove('active'))

  const tocSection = document.getElementById('toc')
  tocSection.classList.add('visible')

  try {
    const res = await fetch(`/api/skills/${encodeURIComponent(name)}`)
    if (!res.ok) throw new Error('Not found')
    const data = await res.json()

    if (editorMode) {
      document.getElementById('editorToggle').checked = false
      toggleEditorMode(false)
    }
    currentFilePath = null
    currentRawContent = data.rawContent || ''

    showPanel('skillContent')
    document.getElementById('skillContent').innerHTML = data.html
    document.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el))
    buildTOC(data.sections, name)

    location.hash = section ? `${name}/${section}` : name

    if (section) {
      setTimeout(() => {
        const el = document.getElementById(section)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } else {
      document.getElementById('main').scrollTop = 0
    }

    // Load file tree after showing skill content
    loadSkillTree(name)
  } catch (e) {
    showPanel('skillContent')
    document.getElementById('skillContent').innerHTML = `<div class="error">Error cargando el skill: ${e.message}</div>`
  }

  return Promise.resolve()
}

// ─── File tree ────────────────────────────────────────────────────────────────

async function loadSkillTree(skillName) {
  // Remove any existing trees
  document.querySelectorAll('.skill-tree').forEach(el => el.remove())

  const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/tree`)
  if (!res.ok) return
  const tree = await res.json()
  if (!tree.length) return

  const skillItem = document.querySelector(`.skill-item[data-skill="${escAttr(skillName)}"]`)
  if (!skillItem) return

  const treeEl = document.createElement('div')
  treeEl.className = 'skill-tree'
  treeEl.dataset.skill = skillName
  treeEl.innerHTML = renderTreeNodes(tree, skillName)
  skillItem.insertAdjacentElement('afterend', treeEl)
}

function renderTreeNodes(nodes, skillName) {
  return nodes.map(node => {
    if (node.type === 'dir') {
      const hasFiles = node.children.length > 0
      return `
        <div class="tree-dir">
          <div class="tree-dir-header" data-open="false">
            <svg class="tree-chevron" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>${escHtml(node.name)}</span>
            ${hasFiles ? `<span class="tree-count">${countFiles(node.children)}</span>` : ''}
          </div>
          <div class="tree-dir-children hidden">
            ${renderTreeNodes(node.children, skillName)}
          </div>
        </div>`
    } else {
      return `
        <div class="tree-file" data-skill="${escAttr(skillName)}" data-path="${escAttr(node.path)}" title="${escAttr(node.path)}">
          ${fileIcon(node.ext)}
          <span>${escHtml(node.name)}</span>
        </div>`
    }
  }).join('')
}

function countFiles(nodes) {
  return nodes.reduce((n, node) => n + (node.type === 'file' ? 1 : countFiles(node.children)), 0)
}

function fileIcon(ext) {
  const icons = {
    md:   `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    vb:   `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    js:   `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    css:  `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/></svg>`,
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    sql:  `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  }
  return icons[ext] || icons.md
}

// ─── Tree interaction (delegated) ─────────────────────────────────────────────

function initTreeEvents() {
  document.getElementById('skillList').addEventListener('click', e => {
    // Toggle directory
    const header = e.target.closest('.tree-dir-header')
    if (header) {
      e.stopPropagation()
      const children = header.nextElementSibling
      const chevron = header.querySelector('.tree-chevron')
      const open = header.dataset.open === 'true'
      header.dataset.open = !open
      children.classList.toggle('hidden', open)
      chevron.style.transform = open ? '' : 'rotate(90deg)'
      return
    }

    // Open file
    const fileEl = e.target.closest('.tree-file')
    if (fileEl) {
      e.stopPropagation()
      loadFile(fileEl.dataset.skill, fileEl.dataset.path)
    }
  })
}

// ─── Load individual file ─────────────────────────────────────────────────────

async function loadFile(skillName, filePath) {
  currentSkill = skillName

  document.querySelectorAll('.skill-item').forEach(el => {
    el.classList.toggle('active', el.dataset.skill === skillName)
  })
  document.querySelectorAll('.tree-file').forEach(el => {
    el.classList.toggle('active', el.dataset.skill === skillName && el.dataset.path === filePath)
  })

  try {
    const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}/file?path=${encodeURIComponent(filePath)}`)
    if (!res.ok) throw new Error('Not found')
    const data = await res.json()

    if (editorMode) {
      document.getElementById('editorToggle').checked = false
      toggleEditorMode(false)
    }
    currentFilePath = filePath
    currentRawContent = data.rawContent || data.content || ''

    showPanel('skillContent')

    if (data.html) {
      document.getElementById('skillContent').innerHTML = data.html
      document.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el))
      buildTOC(data.sections, skillName)
      document.getElementById('toc').classList.add('visible')
    } else {
      const lang = data.ext || 'plaintext'
      const escaped = (data.content || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      document.getElementById('skillContent').innerHTML = `
        <div class="file-header">
          <span class="file-breadcrumb">${escHtml(skillName)} / ${escHtml(filePath)}</span>
        </div>
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">${escHtml(lang)}</span>
            <button class="btn-copy" onclick="copyCode(this)" title="Copiar código">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copiar
            </button>
          </div>
          <pre><code class="hljs language-${escHtml(lang)}">${escaped}</code></pre>
        </div>`
      document.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el))
      document.getElementById('tocList').innerHTML = ''
      document.getElementById('toc').classList.remove('visible')
    }

    location.hash = `${skillName}/${encodeURIComponent(filePath)}`
    document.getElementById('main').scrollTop = 0
  } catch (e) {
    showPanel('skillContent')
    document.getElementById('skillContent').innerHTML = `<div class="error">Error cargando el archivo: ${escHtml(e.message)}</div>`
  }
}

// ─── TOC ──────────────────────────────────────────────────────────────────────

function buildTOC(sections, skillName) {
  const list = document.getElementById('tocList')
  list.innerHTML = sections.map(s => `
    <li class="toc-level-${s.level}">
      <a href="#${skillName}/${s.id}" onclick="scrollToSection('${escAttr(s.id)}', event)">${escHtml(s.title)}</a>
    </li>
  `).join('')
}

function scrollToSection(id, e) {
  e.preventDefault()
  const el = document.getElementById(id)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    location.hash = `${currentSkill}/${id}`
  }
}

// ─── Flags ────────────────────────────────────────────────────────────────────

async function loadFlags() {
  try {
    const res = await fetch('/api/flags')
    availableFlags = await res.json()
  } catch (_) {}
}

function parseSearchQuery(raw) {
  const tokens = raw.trim().split(/\s+/).filter(Boolean)
  const flags = tokens.filter(t => t.startsWith('--') && t.length > 2)
  const query = tokens.filter(t => !t.startsWith('--')).join(' ').trim()
  return { flags, query }
}

function updateFlagChips(activeFlags) {
  const container = document.getElementById('searchFlags')
  if (!activeFlags.length) {
    container.classList.add('hidden')
    container.innerHTML = ''
    return
  }
  container.classList.remove('hidden')
  container.innerHTML = activeFlags.map(flag => {
    const def = availableFlags.find(f => f.flag === flag)
    return `<span class="flag-chip">${escHtml(def ? def.label : flag)}</span>`
  }).join('')
}

function showFlagSuggestions(inputEl) {
  const val = inputEl.value
  const cursorPos = inputEl.selectionStart
  const textBeforeCursor = val.slice(0, cursorPos)
  const lastSpaceIdx = textBeforeCursor.lastIndexOf(' ')
  const currentWord = textBeforeCursor.slice(lastSpaceIdx + 1)

  if (!currentWord.startsWith('--') || currentWord.length < 2) {
    hideFlagSuggestions()
    return
  }

  const matches = availableFlags.filter(f => f.flag.startsWith(currentWord) && f.flag !== currentWord)

  if (!matches.length) {
    hideFlagSuggestions()
    return
  }

  const dropdown = document.getElementById('flagSuggestions')
  dropdown.innerHTML = matches.map(f => `
    <div class="flag-suggestion" data-flag="${escAttr(f.flag)}">
      <code>${escHtml(f.flag)}</code>
      <span>${escHtml(f.label)}</span>
    </div>
  `).join('')
  dropdown.classList.remove('hidden')

  dropdown.querySelectorAll('.flag-suggestion').forEach(el => {
    el.addEventListener('mousedown', (ev) => {
      ev.preventDefault()
      const flag = el.dataset.flag
      const before = val.slice(0, lastSpaceIdx + 1)
      const after = val.slice(cursorPos).trimStart()
      inputEl.value = (before + flag + ' ' + after).trimStart()
      inputEl.dispatchEvent(new Event('input'))
      inputEl.focus()
      hideFlagSuggestions()
    })
  })
}

function hideFlagSuggestions() {
  const el = document.getElementById('flagSuggestions')
  if (el) el.classList.add('hidden')
}

// ─── Search ───────────────────────────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('searchInput')
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout)
    const raw = input.value.trim()
    const { flags, query } = parseSearchQuery(raw)

    updateFlagChips(flags)
    showFlagSuggestions(input)

    const hasSearch = query.length >= 2 || flags.length > 0
    if (!hasSearch) {
      if (currentSkill) loadSkill(currentSkill)
      else showPanel('welcome')
      return
    }
    searchTimeout = setTimeout(() => doSearch(raw), 250)
  })

  input.addEventListener('blur', () => {
    setTimeout(hideFlagSuggestions, 150)
  })
}

async function doSearch(rawQuery) {
  const { flags, query } = parseSearchQuery(rawQuery)
  if (query.length < 2 && !flags.length) return

  const params = new URLSearchParams({ q: query })
  if (flags.length) params.set('flags', flags.join(','))

  const res = await fetch(`/api/search?${params}`)
  const results = await res.json()

  showPanel('searchResults')
  hideFlagSuggestions()

  const container = document.getElementById('searchResults')

  const flagBadges = flags.map(f => {
    const def = availableFlags.find(af => af.flag === f)
    return `<span class="flag-chip">${escHtml(def ? def.label : f)}</span>`
  }).join('')

  if (results.length === 0) {
    container.innerHTML = `<div class="search-empty">Sin resultados para "<strong>${escHtml(query)}</strong>"${flagBadges ? `<span class="search-filter-badges">${flagBadges}</span>` : ''}</div>`
    return
  }

  const highlighted = (text) => {
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    return escHtml(text).replace(re, '<mark>$1</mark>')
  }

  const renderResult = (r) => `
    <div class="search-result${r.priority ? ' priority' : ''}" data-skill="${escAttr(r.skill)}" data-file="${escAttr(r.file)}">
      <div class="search-result-meta">
        <span class="tag">${escHtml(r.skill)}</span>
        <span class="file-path">${escHtml(r.file)}:${r.line}</span>
        ${r.priority ? `<span class="priority-badge">★ destacado</span>` : ''}
      </div>
      <div class="search-result-match">${highlighted(r.match)}</div>
      <div class="search-result-context">${highlighted(r.context)}</div>
    </div>`

  const priorityResults = results.filter(r => r.priority)
  const normalResults   = results.filter(r => !r.priority)

  let resultsHtml = priorityResults.map(renderResult).join('')
  if (priorityResults.length > 0 && normalResults.length > 0) {
    resultsHtml += `<div class="search-divider">Otros resultados</div>`
  }
  resultsHtml += normalResults.map(renderResult).join('')

  container.innerHTML = `
    <div class="search-header">
      ${results.length} resultado${results.length !== 1 ? 's' : ''} para "<strong>${escHtml(query)}</strong>"
      ${flagBadges ? `<span class="search-filter-badges">${flagBadges}</span>` : ''}
    </div>
    ${resultsHtml}
  `

  container.querySelectorAll('.search-result').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('searchInput').value = ''
      updateFlagChips([])
      loadFile(el.dataset.skill, el.dataset.file)
    })
  })

  document.getElementById('toc').classList.remove('visible')
}

// ─── Copy snippet ─────────────────────────────────────────────────────────────

function copyCode(btn) {
  const code = btn.closest('.code-block').querySelector('code')
  navigator.clipboard.writeText(code.innerText).then(() => showToast())
}

function showToast(msg) {
  document.getElementById('toastMsg').textContent = msg || 'Copiado'
  const toast = document.getElementById('toast')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 1800)
}

// ─── Hot-reload via SSE ───────────────────────────────────────────────────────

function initHotReload() {
  const es = new EventSource('/api/events')
  es.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.type === 'reload') {
      document.getElementById('reloadBanner').classList.remove('hidden')
    }
  }
  es.onerror = () => {}
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      document.getElementById('searchInput').focus()
      document.getElementById('searchInput').select()
    }
    if (e.key === 'Escape') {
      const input = document.getElementById('searchInput')
      if (document.activeElement === input) {
        input.value = ''
        input.blur()
        if (currentSkill) loadSkill(currentSkill)
        else showPanel('welcome')
      }
    }
  })
}

// ─── Folder selector ─────────────────────────────────────────────────────────

async function initFolderSelector() {
  document.getElementById('btnPickFolder').addEventListener('click', pickFolder)

  try {
    const res = await fetch('/api/config')
    const data = await res.json()
    if (data.skillsDir) {
      currentSkillsDir = data.skillsDir
      updateDirDisplay(data.skillsDir)
    } else {
      showNoFolderState()
    }
  } catch (_) {
    showNoFolderState()
  }
}

function showNoFolderState() {
  updateDirDisplay('')
  document.getElementById('welcome').innerHTML = `
    <div class="welcome-inner">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <h1>Flow-Docs</h1>
      <p>Selecciona una carpeta de tu ordenador para comenzar.</p>
      <button class="btn-welcome-folder" onclick="pickFolder()">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        Seleccionar carpeta
      </button>
    </div>`
  showPanel('welcome')
}

function updateDirDisplay(dirPath) {
  const nameEl = document.getElementById('folderName')
  const pathEl = document.getElementById('folderCurrentPath')
  if (!dirPath) {
    if (nameEl) nameEl.textContent = 'Sin carpeta'
    if (pathEl) pathEl.title = ''
    return
  }
  const parts = dirPath.replace(/\\/g, '/').split('/')
  const folderName = parts[parts.length - 1] || dirPath
  if (nameEl) nameEl.textContent = folderName
  if (pathEl) pathEl.title = dirPath
}

async function pickFolder() {
  const btn = document.getElementById('btnPickFolder')
  btn.disabled = true
  btn.classList.add('loading')

  try {
    // Ask the server to open the native Windows folder picker
    const pickRes = await fetch('/api/pick-folder', { method: 'POST' })
    const pickData = await pickRes.json()

    if (pickData.cancelled || !pickData.path) {
      return
    }

    // Apply the new directory
    const setRes = await fetch('/api/set-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pickData.path })
    })
    const setData = await setRes.json()

    if (!setRes.ok) {
      alert('Error al cambiar carpeta: ' + (setData.error || 'Error desconocido'))
      return
    }

    currentSkillsDir = setData.skillsDir
    updateDirDisplay(setData.skillsDir)

    // Reset state and reload skill list
    currentSkill = null
    location.hash = ''
    showPanel('welcome')
    document.getElementById('tocList').innerHTML = ''
    document.getElementById('toc').classList.remove('visible')
    loadSkillList()
  } catch (e) {
    alert('Error al seleccionar carpeta: ' + e.message)
  } finally {
    btn.disabled = false
    btn.classList.remove('loading')
  }
}

// ─── Editor mode ──────────────────────────────────────────────────────────────

function initEditorToggle() {
  document.getElementById('editorToggle').addEventListener('change', e => {
    toggleEditorMode(e.target.checked)
  })
  document.getElementById('btnSave').addEventListener('click', saveFile)

  document.getElementById('editorTextarea').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) {
      e.preventDefault()
      saveFile()
    }
  })
}

function toggleEditorMode(active) {
  editorMode = active
  const skillContent = document.getElementById('skillContent')
  const editorArea = document.getElementById('editorArea')
  const btnSave = document.getElementById('btnSave')
  const contentArea = document.getElementById('contentArea')

  if (active) {
    document.getElementById('editorTextarea').value = currentRawContent
    skillContent.classList.add('hidden')
    editorArea.classList.remove('hidden')
    btnSave.classList.remove('hidden')
    contentArea.classList.add('editor-mode-active')
    document.getElementById('editorTextarea').focus()
  } else {
    editorArea.classList.add('hidden')
    skillContent.classList.remove('hidden')
    btnSave.classList.add('hidden')
    contentArea.classList.remove('editor-mode-active')
  }
}

async function saveFile() {
  if (!currentSkill) return
  const content = document.getElementById('editorTextarea').value
  const filePath = currentFilePath || 'SKILL.md'
  const btn = document.getElementById('btnSave')
  btn.disabled = true

  try {
    const res = await fetch(
      `/api/skills/${encodeURIComponent(currentSkill)}/file?path=${encodeURIComponent(filePath)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      }
    )
    if (!res.ok) {
      let errMsg = `Error del servidor (${res.status})`
      try { const err = await res.json(); errMsg = err.error || errMsg } catch (_) {}
      throw new Error(errMsg)
    }

    currentRawContent = content
    document.getElementById('editorToggle').checked = false
    toggleEditorMode(false)

    if (currentFilePath) {
      await loadFile(currentSkill, currentFilePath)
    } else {
      await loadSkill(currentSkill)
    }

    showToast('Guardado')
  } catch (e) {
    alert('Error al guardar: ' + e.message)
  } finally {
    btn.disabled = false
  }
}

// ─── Context menu ─────────────────────────────────────────────────────────────

let ctxTarget = null

function initContextMenu() {
  const menu = document.getElementById('contextMenu')

  // Right-click on tree files (delegated from skillList)
  document.getElementById('skillList').addEventListener('contextmenu', e => {
    const fileEl = e.target.closest('.tree-file')
    if (!fileEl) return
    e.preventDefault()
    ctxTarget = { skill: fileEl.dataset.skill, path: fileEl.dataset.path }
    showContextMenu(e.clientX, e.clientY)
  })

  document.getElementById('ctxOpenFolder').addEventListener('click', async () => {
    if (!ctxTarget) return
    const target = ctxTarget  // save before hideContextMenu nullifies ctxTarget
    hideContextMenu()
    try {
      const res = await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill: target.skill, filePath: target.path })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast('Error: ' + (err.error || res.status))
      }
    } catch (e) {
      showToast('Error al abrir explorador')
    }
  })

  document.addEventListener('click', () => hideContextMenu())
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu() })
}

function showContextMenu(x, y) {
  const menu = document.getElementById('contextMenu')
  menu.style.left = x + 'px'
  menu.style.top = y + 'px'
  menu.classList.remove('hidden')
  const rect = menu.getBoundingClientRect()
  if (rect.right > window.innerWidth)  menu.style.left = (x - rect.width) + 'px'
  if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px'
}

function hideContextMenu() {
  document.getElementById('contextMenu').classList.add('hidden')
  ctxTarget = null
}

// ─── TOC resizer ──────────────────────────────────────────────────────────────

function initTocResizer() {
  const resizer = document.getElementById('tocResizer')
  const toc = document.getElementById('toc')

  // Restore saved width
  const savedW = parseInt(localStorage.getItem('flow-docs-toc-width'))
  if (savedW && savedW >= 100 && savedW <= 600) {
    document.documentElement.style.setProperty('--toc-w', savedW + 'px')
  }

  resizer.addEventListener('mousedown', e => {
    e.preventDefault()
    const startX = e.clientX
    const startW = toc.offsetWidth
    let currentW = startW
    resizer.classList.add('dragging')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(e) {
      currentW = Math.max(100, Math.min(600, startW + (startX - e.clientX)))
      document.documentElement.style.setProperty('--toc-w', currentW + 'px')
    }

    function onUp() {
      resizer.classList.remove('dragging')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('flow-docs-toc-width', currentW)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function showPanel(id) {
  ;['welcome', 'skillContent', 'searchResults'].forEach(p => {
    document.getElementById(p).classList.toggle('hidden', p !== id)
  })
  document.getElementById('editorArea').classList.add('hidden')
  document.getElementById('editorToolbar').classList.toggle('hidden', id !== 'skillContent')
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
