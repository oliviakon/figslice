import { useState, useRef, useCallback, useEffect } from 'react'
import JSZip from 'jszip'
import {
  parseFigmaUrl,
  fetchFigmaFile,
  renderFigmaNode,
  extractPages,
  groupIntoFlows,
  sanitize,
} from './figma'

function useToast() {
  const [msg, setMsg] = useState('')
  const timer = useRef(null)
  const show = useCallback((text) => {
    setMsg(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 2500)
  }, [])
  return { msg, show }
}

// ── LocalStorage helpers ──
function loadToken() {
  return localStorage.getItem('figma-capture-token') || ''
}
function saveToken(t) {
  localStorage.setItem('figma-capture-token', t)
}
function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem('figma-capture-projects') || '[]')
  } catch {
    return []
  }
}
function saveProject(name) {
  if (!name) return
  const projects = loadProjects()
  const existing = projects.find((p) => p.name === name)
  if (existing) {
    existing.count++
    existing.lastUsed = Date.now()
  } else {
    projects.push({ name, count: 1, lastUsed: Date.now() })
  }
  localStorage.setItem('figma-capture-projects', JSON.stringify(projects))
}

export default function App() {
  const [project, setProject] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useState(loadToken)
  const [step, setStep] = useState(1)
  const [allPages, setAllPages] = useState([])
  const [selectedPage, setSelectedPage] = useState(0)
  const [checkedFlows, setCheckedFlows] = useState({})
  const [fetchError, setFetchError] = useState('')
  const [renderError, setRenderError] = useState('')
  const [fetching, setFetching] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [renderStatus, setRenderStatus] = useState('')
  const [capturedImages, setCapturedImages] = useState([])
  const [manualImages, setManualImages] = useState([])
  const sessionRef = useRef({ fileKey: '', token: '' })
  const toast = useToast()
  const manualNumRef = useRef(1)

  const projects = loadProjects()
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, 8)

  // Build sections with flows for the selected page
  const page = allPages[selectedPage]
  const sectionsWithFlows = page
    ? page.sections.map((sec) => ({ ...sec, flows: groupIntoFlows(sec.frames) }))
    : []

  // Initialize all flows as checked when pages load
  useEffect(() => {
    if (!allPages.length) return
    const checked = {}
    let idx = 0
    const p = allPages[selectedPage]
    if (!p) return
    p.sections.forEach((sec) => {
      const flows = groupIntoFlows(sec.frames)
      flows.forEach(() => {
        checked[idx] = true
        idx++
      })
    })
    setCheckedFlows(checked)
  }, [allPages, selectedPage])

  // ── Step 1: Fetch ──
  async function handleFetch() {
    setFetchError('')
    if (!url || !token) {
      setFetchError('Need both URL and token')
      return
    }
    setFetching(true)
    try {
      saveToken(token)
      const { fileKey, nodeId } = parseFigmaUrl(url)
      sessionRef.current = { fileKey, token }
      const data = await fetchFigmaFile(fileKey, token, nodeId)
      const pages = extractPages(data, nodeId)
      if (!pages.length) {
        setFetchError('No frames found in this file')
        return
      }
      setAllPages(pages)
      setSelectedPage(0)
      setStep(2)
    } catch (e) {
      setFetchError('Failed: ' + e.message)
    } finally {
      setFetching(false)
    }
  }

  // ── Step 2: Toggle helpers ──
  function toggleFlow(idx) {
    setCheckedFlows((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }
  function toggleSection(sectionFlowIndices, checked) {
    setCheckedFlows((prev) => {
      const next = { ...prev }
      sectionFlowIndices.forEach((i) => (next[i] = checked))
      return next
    })
  }

  // ── Step 2: Render & Slice ──
  async function handleRender() {
    setRenderError('')
    setCapturedImages([])
    const PAD_TOP = 80,
      PAD_BOTTOM = 120,
      PAD_LEFT = 20,
      PAD_RIGHT = 40

    const selectedFrames = []
    const sectionIds = new Set()
    let flowIdx = 0

    sectionsWithFlows.forEach((sec) => {
      sec.flows.forEach((flow) => {
        if (checkedFlows[flowIdx]) {
          const ff = flow.frames
          const minX = Math.min(...ff.map((f) => f.x)) - PAD_LEFT
          const maxX = Math.max(...ff.map((f) => f.x + f.w)) + PAD_RIGHT
          const minY = Math.min(...ff.map((f) => f.y)) - PAD_TOP
          const maxY =
            flow.yBandEnd !== Infinity
              ? flow.yBandEnd - 20
              : Math.max(...ff.map((f) => f.y + f.h)) + PAD_BOTTOM
          selectedFrames.push({
            x: minX,
            y: minY,
            w: maxX - minX,
            h: maxY - minY,
            name: flow.title,
            section: sec.name,
            sectionId: sec.id,
          })
          if (sec.id) sectionIds.add(sec.id)
        }
        flowIdx++
      })
    })

    if (!selectedFrames.length) {
      toast.show('Select at least one flow')
      return
    }

    const sectionsToRender = sectionsWithFlows
      .filter((s) => sectionIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, bounds: s.bounds }))

    setRendering(true)
    setRenderStatus(
      `Calling Figma API to render ${sectionIds.size} section(s)... this may take a moment.`
    )

    try {
      const { fileKey, token: tok } = sessionRef.current
      const bySection = {}
      for (const f of selectedFrames) {
        if (!bySection[f.sectionId]) bySection[f.sectionId] = []
        bySection[f.sectionId].push(f)
      }
      const sectionMap = {}
      for (const s of sectionsToRender) sectionMap[s.id] = s

      const images = []
      let flowNum = 0

      for (const [sid, flows] of Object.entries(bySection)) {
        const sec = sectionMap[sid]
        if (!sec || !sec.bounds) continue
        let sb = { ...sec.bounds }

        setRenderStatus(`Rendering section "${sec.name}"...`)
        const imgBlob = await renderFigmaNode(fileKey, tok, sid, 2)
        const img = await createImageBitmap(imgBlob)
        const imgW = img.width,
          imgH = img.height

        let scaleX = imgW / sb.w,
          scaleY = imgH / sb.h

        if (Math.abs(scaleX - 2.0) > 0.1 || Math.abs(scaleY - 2.0) > 0.1) {
          const fxC = flows.map((f) => f.x).concat([sb.x])
          const fyC = flows.map((f) => f.y).concat([sb.y])
          const frC = flows.map((f) => f.x + f.w).concat([sb.x + sb.w])
          const fbC = flows.map((f) => f.y + f.h).concat([sb.y + sb.h])
          const estX = Math.min(...fxC),
            estY = Math.min(...fyC)
          const estW = Math.max(...frC) - estX,
            estH = Math.max(...fbC) - estY
          const adjSx = imgW / estW,
            adjSy = imgH / estH
          if (Math.abs(adjSx - 2.0) < Math.abs(scaleX - 2.0)) {
            sb = { x: estX, y: estY, w: estW, h: estH }
            scaleX = adjSx
            scaleY = adjSy
          }
        }

        for (const flow of flows) {
          flowNum++
          setRenderStatus(`Cropping "${flow.name}" (${flowNum}/${selectedFrames.length})...`)

          let px = Math.round((flow.x - sb.x) * scaleX)
          let py = Math.round((flow.y - sb.y) * scaleY)
          let pw = Math.round(flow.w * scaleX)
          let ph = Math.round(flow.h * scaleY)
          px = Math.max(0, px)
          py = Math.max(0, py)
          pw = Math.min(pw, imgW - px)
          ph = Math.min(ph, imgH - py)
          if (pw <= 0 || ph <= 0) continue

          const canvas = document.createElement('canvas')
          canvas.width = pw
          canvas.height = ph
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, px, py, pw, ph, 0, 0, pw, ph)

          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
          const dataUrl = canvas.toDataURL('image/png')

          const secSlug = sanitize(flow.section || '')
          const nameSlug = sanitize(flow.name)
          const filename = secSlug
            ? `${String(flowNum).padStart(2, '0')}-${secSlug}--${nameSlug}.png`
            : `${String(flowNum).padStart(2, '0')}-${nameSlug}.png`

          images.push({ filename, blob, dataUrl, section: flow.section || '', name: flow.name })
        }
        img.close()
      }

      if (project) saveProject(project)
      setCapturedImages(images)
      setRenderStatus('')
      setStep(3)
    } catch (ex) {
      setRenderError('Render failed: ' + ex.message)
      setRenderStatus('')
    } finally {
      setRendering(false)
    }
  }

  // ── Downloads ──
  function downloadSingle(idx) {
    const img = capturedImages[idx]
    if (!img) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(img.blob)
    a.download = img.filename
    a.click()
    URL.revokeObjectURL(a.href)
    toast.show('Downloaded ' + img.filename)
  }

  async function downloadAllZip() {
    if (!capturedImages.length) return
    const zipName = project ? sanitize(project) + '-captures.zip' : 'figma-captures.zip'
    toast.show('Creating ZIP...')
    const zip = new JSZip()
    for (const img of capturedImages) {
      zip.file(img.filename, img.blob)
    }
    const content = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(content)
    a.download = zipName
    a.click()
    URL.revokeObjectURL(a.href)
    toast.show('Downloaded ' + zipName)
  }

  // ── Manual paste/drop ──
  function handleManualFile(file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      const filename = `manual-${String(manualNumRef.current++).padStart(2, '0')}.png`
      fetch(dataUrl)
        .then((r) => r.blob())
        .then((blob) => {
          setManualImages((prev) => [...prev, { filename, blob, dataUrl }])
          toast.show('Added: ' + filename)
        })
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    function onPaste(e) {
      if (document.activeElement.tagName === 'INPUT') return
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) handleManualFile(item.getAsFile())
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  async function downloadManualZip() {
    if (!manualImages.length) return
    const zip = new JSZip()
    for (const img of manualImages) zip.file(img.filename, img.blob)
    const content = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(content)
    a.download = 'figma-captures-manual.zip'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.show('Downloaded ZIP')
  }

  // ── Group results by section ──
  const resultsBySection = {}
  capturedImages.forEach((f, i) => {
    const sec = f.section || 'Flows'
    if (!resultsBySection[sec]) resultsBySection[sec] = []
    resultsBySection[sec].push({ ...f, idx: i })
  })

  return (
    <div className="wrap">
      {/* Header */}
      <div className="logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <h1>Figma Capture</h1>
      </div>
      <p className="sub">
        Auto-slice Figma pages into flow screenshots. Runs entirely in your browser &mdash; nothing
        leaves your machine.
      </p>

      {/* Step 1: Connect */}
      <div className="card">
        <div className="card-header">
          <span className="badge">1</span>
          <h2>Connect to Figma</h2>
        </div>
        <label className="field-label">
          Project name <span className="field-label-note">(used for ZIP filename)</span>
        </label>
        <input
          type="text"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          placeholder="e.g. reimagine-packs, pack-management"
        />
        {projects.length > 0 && (
          <div className="project-suggestions">
            {projects.map((p) => (
              <button key={p.name} className="project-chip" onClick={() => setProject(p.name)}>
                {p.name}
                <span className="chip-count">{p.count}</span>
              </button>
            ))}
          </div>
        )}
        <label className="field-label">Figma URL or file key</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://figma.com/design/abc123/My-File?node-id=..."
        />
        <label className="field-label">
          Personal access token{' '}
          <a
            href="https://www.figma.com/developers/api#access-tokens"
            target="_blank"
            rel="noreferrer"
          >
            (get one here)
          </a>
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="figd_..."
        />
        <div className="privacy-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Your token is stored in your browser only and sent directly to Figma's API. No server
          involved.
        </div>
        <div className="btn-row">
          <button className="btn-primary" disabled={fetching} onClick={handleFetch}>
            {fetching ? (
              <>
                <span className="spinner" />
                Fetching...
              </>
            ) : (
              'Fetch Structure'
            )}
          </button>
        </div>
        {fetchError && <div className="err">{fetchError}</div>}
      </div>

      {/* Step 2: Review Flows */}
      {step >= 2 && (
        <div className="card">
          <div className="card-header">
            <span className="badge">2</span>
            <h2>Review Detected Flows</h2>
          </div>
          <p className="card-desc">
            Flows grouped by Figma sections. Each checked flow will be rendered as{' '}
            <b>one screenshot</b>.
          </p>

          {allPages.length > 1 && (
            <div className="page-tabs">
              {allPages.map((p, i) => (
                <button
                  key={i}
                  className={`page-tab ${i === selectedPage ? 'active' : ''}`}
                  onClick={() => setSelectedPage(i)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {(() => {
            let flowIdx = 0
            return sectionsWithFlows.map((sec, si) => {
              const startIdx = flowIdx
              const items = sec.flows.map((flow) => {
                const idx = flowIdx++
                const screenCount = flow.frames.length - 1
                return (
                  <div key={idx} className="flow-item">
                    <input
                      type="checkbox"
                      checked={!!checkedFlows[idx]}
                      onChange={() => toggleFlow(idx)}
                    />
                    {flow.title}
                    <span className="screen-count">
                      {screenCount} screen{screenCount !== 1 ? 's' : ''} &rarr; 1 screenshot
                    </span>
                  </div>
                )
              })
              const endIdx = flowIdx
              const indices = []
              for (let i = startIdx; i < endIdx; i++) indices.push(i)
              const allChecked = indices.every((i) => checkedFlows[i])
              return (
                <div key={si}>
                  <div className="section-hdr">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(e) => toggleSection(indices, e.target.checked)}
                      style={{ marginRight: 6 }}
                    />
                    {sec.name}{' '}
                    <span className="sec-count">
                      {sec.flows.length} flow{sec.flows.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {items}
                </div>
              )
            })
          })()}

          <div className="btn-row">
            <button className="btn-primary" disabled={rendering} onClick={handleRender}>
              {rendering ? (
                <>
                  <span className="spinner" />
                  Rendering...
                </>
              ) : (
                'Render & Slice'
              )}
            </button>
            <button className="btn-outline" onClick={() => window.location.reload()}>
              Start over
            </button>
          </div>
          {renderStatus && (
            <div className="render-status">
              <span className="spinner" />
              {renderStatus}
            </div>
          )}
          {renderError && <div className="err">{renderError}</div>}
        </div>
      )}

      {/* Step 3: Results */}
      {step >= 3 && (
        <div className="card">
          <div className="card-header">
            <span className="badge" style={{ background: 'var(--success)' }}>
              3
            </span>
            <h2>Done</h2>
          </div>
          <div className="done-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
              <p>{capturedImages.length} flow screenshots ready.</p>
              <p style={{ marginTop: 4 }}>Download individually or grab them all as a ZIP.</p>
            </div>
          </div>
          <div className="btn-row" style={{ marginBottom: 16 }}>
            <button className="btn-primary" onClick={downloadAllZip}>
              Download All as ZIP
            </button>
            <button className="btn-outline" onClick={() => window.location.reload()}>
              Slice another file
            </button>
          </div>
          <div className="results">
            {Object.entries(resultsBySection).map(([sec, files]) => (
              <div key={sec}>
                <div className="result-section-hdr">{sec}</div>
                {files.map((f) => (
                  <div key={f.idx} className="result-flow">
                    <div className="result-flow-header">
                      <span className="result-flow-title">{f.name}</span>
                      <div className="result-flow-actions">
                        <button className="btn-outline btn-sm" onClick={() => downloadSingle(f.idx)}>
                          Download
                        </button>
                      </div>
                    </div>
                    <div className="result-flow-img">
                      <img src={f.dataUrl} alt={f.name} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual paste */}
      <div className="divider" />
      <div className="manual-section">
        <h3>Or paste / drop individual screenshots</h3>
        <div
          className={`drop-zone`}
          onDragOver={(e) => {
            e.preventDefault()
            e.currentTarget.classList.add('active')
          }}
          onDragLeave={(e) => e.currentTarget.classList.remove('active')}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('active')
            for (const f of e.dataTransfer.files) {
              if (f.type.startsWith('image/')) handleManualFile(f)
            }
          }}
        >
          <p>
            <kbd>Cmd+Shift+Ctrl+4</kbd> to screenshot, then <kbd>Cmd+V</kbd> here
          </p>
        </div>
        {manualImages.length > 0 && (
          <>
            <div className="manual-thumbs">
              {manualImages.map((img, i) => (
                <img key={i} src={img.dataUrl} alt={img.filename} />
              ))}
            </div>
            <div className="btn-row">
              <button className="btn-outline btn-sm" onClick={downloadManualZip}>
                Download pasted images as ZIP
              </button>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      <div className={`toast ${toast.msg ? 'show' : ''}`}>{toast.msg}</div>
    </div>
  )
}
