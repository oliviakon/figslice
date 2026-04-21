// ── Figma API helpers (client-side) ──

export function parseFigmaUrl(url) {
  url = url.trim()
  let nodeId = null
  let m = url.match(/node-id=([^&]+)/)
  if (m) nodeId = m[1].replace(/-/g, ':')
  let m2 = url.match(/\/branch\/([a-zA-Z0-9]+)\//)
  let fileKey
  if (m2) {
    fileKey = m2[1]
  } else {
    m2 = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/)
    fileKey = m2 ? m2[1] : url
  }
  return { fileKey, nodeId }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function figmaGet(path, token, retries = 3) {
  let timeoutAttempts = 0
  const MAX_TIMEOUT_RETRIES = 2
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(`https://api.figma.com/v1${path}`, {
      headers: { 'X-FIGMA-TOKEN': token },
    })
    if (r.status === 429) {
      const wait = Math.min(2000 * 2 ** attempt, 15000)
      console.warn(`Figma rate limited, retrying in ${wait}ms...`)
      await sleep(wait)
      continue
    }
    if (!r.ok) {
      if (r.status === 403) throw new Error('Invalid token or no access to this file')
      const body = await r.text().catch(() => '')
      if (r.status === 400 && body.includes('Render timeout')) {
        if (timeoutAttempts < MAX_TIMEOUT_RETRIES) {
          const wait = 2000 * 2 ** timeoutAttempts
          console.warn(`Figma render timeout, retrying in ${wait}ms (attempt ${timeoutAttempts + 1}/${MAX_TIMEOUT_RETRIES})...`)
          await sleep(wait)
          timeoutAttempts++
          continue
        }
        throw new RenderTimeoutError(`Render timeout for ${path}`)
      }
      console.error(`Figma API ${r.status}:`, path, body)
      throw new Error(`Figma API error ${r.status}${body ? ': ' + body.slice(0, 200) : ''}`)
    }
    return r.json()
  }
  throw new Error('Figma rate limit exceeded after retries. Wait a moment and try again.')
}

export class RenderTimeoutError extends Error {
  constructor(msg) {
    super(msg)
    this.name = 'RenderTimeoutError'
  }
}

export async function fetchFigmaFile(fileKey, token, nodeId) {
  if (nodeId) {
    return figmaGet(`/files/${fileKey}/nodes?ids=${nodeId}&depth=6`, token)
  }
  return figmaGet(`/files/${fileKey}?depth=2`, token)
}

/**
 * Pick the best starting scale based on estimated pixel area.
 * Figma tends to timeout when the output image exceeds ~60-70M pixels.
 * By predicting this upfront, we skip failed attempts at higher scales.
 */
function pickStartScale(bounds, maxScale = 1.5) {
  if (!bounds || !bounds.w || !bounds.h) return maxScale
  const area = bounds.w * bounds.h
  // At scale S, output pixels = area * S^2. Stay under ~30M pixels — Figma
  // tends to timeout well before its documented ~60M limit on complex scenes.
  const MAX_PIXELS = 30_000_000
  const idealScale = Math.sqrt(MAX_PIXELS / area)
  if (idealScale >= 1.5) return Math.min(maxScale, 1.5)
  if (idealScale >= 1) return Math.min(maxScale, 1)
  return 0.75
}

/**
 * Render a single Figma node as PNG. Returns { blob, scale }.
 * Automatically retries at lower scales if Figma times out on large nodes.
 * Pass `bounds` to skip straight to the right scale (avoids wasted timeout attempts).
 */
export async function renderFigmaNode(fileKey, token, nodeId, scale = 1.5, bounds = null) {
  const startScale = bounds ? pickStartScale(bounds, scale) : scale
  const allScales = [1.5, 1, 0.75]
  const scalesToTry = allScales.filter((s) => s <= startScale)
  if (scalesToTry.length === 0) scalesToTry.push(0.75)

  for (const s of scalesToTry) {
    try {
      const data = await figmaGet(
        `/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${s}&use_absolute_bounds=true`,
        token
      )
      const imgUrl = data.images && data.images[nodeId]
      if (!imgUrl)
        throw new Error(`Figma returned no image for node ${nodeId}. Error: ${data.err || 'unknown'}`)
      const r = await fetch(imgUrl)
      if (!r.ok) throw new Error('Failed to download rendered image')
      const blob = await r.blob()
      if (s < scale) console.warn(`Rendered ${nodeId} at ${s}x (reduced from ${scale}x)`)
      return { blob, scale: s }
    } catch (e) {
      if (e instanceof RenderTimeoutError && s !== scalesToTry[scalesToTry.length - 1]) {
        console.warn(`Render timeout at ${s}x for ${nodeId}, retrying at lower scale...`)
        continue
      }
      throw e
    }
  }
}

/**
 * Render multiple Figma nodes in a SINGLE API call.
 * Returns a Map of nodeId -> Blob.
 */
export async function renderFigmaNodes(fileKey, token, nodeIds, scale = 1.5) {
  const results = new Map()
  const scalesToTry = scale >= 1.5 ? [1.5, 1, 0.75] : [scale]

  // Figma API limits IDs per request — chunk into batches of 10
  const API_BATCH = 10
  for (let i = 0; i < nodeIds.length; i += API_BATCH) {
    const chunk = nodeIds.slice(i, i + API_BATCH)
    const ids = chunk.map((id) => encodeURIComponent(id)).join(',')
    let data = null
    for (const s of scalesToTry) {
      try {
        data = await figmaGet(
          `/images/${fileKey}?ids=${ids}&format=png&scale=${s}&use_absolute_bounds=true`,
          token
        )
        break
      } catch (e) {
        if (e instanceof RenderTimeoutError && s !== scalesToTry[scalesToTry.length - 1]) {
          console.warn(`Batch render timeout at ${s}x, retrying at lower scale...`)
          continue
        }
        throw e
      }
    }
    if (!data) continue
    const images = data.images || {}

    // Download image URLs with concurrency limit
    const DL_BATCH = 4
    const entries = Object.entries(images).filter(([, url]) => url)
    for (let j = 0; j < entries.length; j += DL_BATCH) {
      const batch = entries.slice(j, j + DL_BATCH)
      const blobs = await Promise.all(
        batch.map(async ([nid, url]) => {
          const r = await fetch(url)
          if (!r.ok) return [nid, null]
          return [nid, await r.blob()]
        })
      )
      for (const [nid, blob] of blobs) {
        if (blob) results.set(nid, blob)
      }
    }
  }

  return results
}

// ── Frame/section extraction ──

function getTitle(node) {
  const texts = []
  collectTexts(node, texts)
  const meaningful = texts.filter((t) => t.length >= 3 && t.length <= 100)
  if (meaningful.length) return meaningful.reduce((a, b) => (a.length >= b.length ? a : b))
  return texts[0] || ''
}

function collectTexts(node, texts) {
  if (node.type === 'TEXT') {
    const c = (node.characters || '').trim()
    if (c) texts.push(c)
  }
  for (const child of node.children || []) collectTexts(child, texts)
}

function makeFrame(node) {
  const bb = node.absoluteBoundingBox || {}
  return {
    id: node.id || '',
    name: node.name || '',
    type: node.type || '',
    x: bb.x || 0,
    y: bb.y || 0,
    w: bb.width || 0,
    h: bb.height || 0,
    text: getTitle(node),
  }
}

function collectSectionFrames(children, depth = 0) {
  const FRAME_TYPES = new Set(['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'SECTION'])
  const frames = []
  for (const child of children) {
    if (!child.absoluteBoundingBox) continue
    const inner = child.children || []
    const frameKids = inner.filter(
      (gc) => gc.absoluteBoundingBox && FRAME_TYPES.has(gc.type)
    )
    if (frameKids.length > 5 && depth < 3) {
      frames.push(...collectSectionFrames(frameKids, depth + 1))
    } else {
      frames.push(makeFrame(child))
    }
  }
  return frames
}

function extractSections(children) {
  const sections = []
  const loose = []
  for (const child of children) {
    if (child.type === 'SECTION') {
      const bb = child.absoluteBoundingBox || {}
      const inner = collectSectionFrames(child.children || [])
      if (inner.length) {
        sections.push({
          name: child.name || 'Section',
          id: child.id || '',
          bounds: { x: bb.x || 0, y: bb.y || 0, w: bb.width || 0, h: bb.height || 0 },
          frames: inner,
        })
      }
    } else if (child.absoluteBoundingBox) {
      loose.push(makeFrame(child))
    }
  }
  if (loose.length) sections.unshift({ name: 'Other', id: '', bounds: {}, frames: loose })
  return sections
}

export function extractPages(data, nodeId) {
  const pages = []
  if (nodeId && data.nodes) {
    for (const [, nd] of Object.entries(data.nodes)) {
      const doc = nd.document || {}
      const sections = extractSections(doc.children || [])

      // If all frames ended up as "loose" (no Figma SECTION nodes found),
      // use the parent node itself as the section — render it once, crop from it.
      // This matches the Python tool's approach and avoids per-frame API calls.
      const hasOnlyLoose = sections.length === 1 && sections[0].id === ''
      if (hasOnlyLoose && doc.id && doc.absoluteBoundingBox) {
        const bb = doc.absoluteBoundingBox
        sections[0].id = doc.id
        sections[0].name = doc.name || 'Selection'
        sections[0].bounds = {
          x: bb.x || 0, y: bb.y || 0,
          w: bb.width || 0, h: bb.height || 0,
        }
      }

      pages.push({
        name: doc.name || 'Selection',
        id: doc.id || '',
        sections,
      })
    }
  } else {
    for (const page of (data.document || {}).children || []) {
      const frames = []
      for (const child of page.children || []) {
        if (!child.absoluteBoundingBox) continue
        const bb = child.absoluteBoundingBox
        frames.push({
          id: child.id,
          name: child.name,
          type: child.type || '',
          x: bb.x,
          y: bb.y,
          w: bb.width,
          h: bb.height,
          text: '',
        })
      }
      if (frames.length) {
        pages.push({
          name: page.name,
          id: page.id,
          sections: [{ name: page.name, id: page.id, bounds: {}, frames }],
        })
      }
    }
  }
  return pages
}

export function groupIntoFlows(frames) {
  if (!frames.length) return []
  const minX = Math.min(...frames.map((f) => f.x))
  const avgW = frames.reduce((s, f) => s + f.w, 0) / frames.length
  const xThresh = minX + Math.max(80, avgW * 0.25)
  const titleCards = frames
    .filter((f) => f.x <= xThresh && f.w < avgW * 2.5)
    .sort((a, b) => a.y - b.y)
  if (!titleCards.length)
    return [
      {
        title: 'All',
        frames: frames.sort((a, b) => a.x - b.x),
        yBandStart: -Infinity,
        yBandEnd: Infinity,
      },
    ]
  const titleIds = new Set(titleCards.map((f) => f.id))
  const others = frames.filter((f) => !titleIds.has(f.id))
  return titleCards.map((tc, i) => {
    const yBandStart = tc.y
    const yBandEnd = i < titleCards.length - 1 ? titleCards[i + 1].y : Infinity
    const screens = others
      .filter((f) => {
        const cy = f.y + f.h / 2
        return cy >= yBandStart && cy < yBandEnd
      })
      .sort((a, b) => a.x - b.x)
    return { title: tc.text || tc.name, frames: [tc, ...screens], yBandStart, yBandEnd }
  })
}

export function sanitize(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40)
}
