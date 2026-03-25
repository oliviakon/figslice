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
      throw new Error(`Figma API error ${r.status}`)
    }
    return r.json()
  }
  throw new Error('Figma rate limit exceeded after retries. Wait a moment and try again.')
}

export async function fetchFigmaFile(fileKey, token, nodeId) {
  if (nodeId) {
    return figmaGet(`/files/${fileKey}/nodes?ids=${nodeId}&depth=6`, token)
  }
  return figmaGet(`/files/${fileKey}?depth=2`, token)
}

/**
 * Render a single Figma node as PNG. Returns a Blob.
 */
export async function renderFigmaNode(fileKey, token, nodeId, scale = 2) {
  const data = await figmaGet(
    `/images/${fileKey}?ids=${nodeId}&format=png&scale=${scale}&use_absolute_bounds=true`,
    token
  )
  const imgUrl = data.images && data.images[nodeId]
  if (!imgUrl)
    throw new Error(`Figma returned no image for node ${nodeId}. Error: ${data.err || 'unknown'}`)
  const r = await fetch(imgUrl)
  if (!r.ok) throw new Error('Failed to download rendered image')
  return r.blob()
}

/**
 * Render multiple Figma nodes in a SINGLE API call.
 * Returns a Map of nodeId -> Blob.
 */
export async function renderFigmaNodes(fileKey, token, nodeIds, scale = 2) {
  const ids = nodeIds.join(',')
  const data = await figmaGet(
    `/images/${fileKey}?ids=${ids}&format=png&scale=${scale}&use_absolute_bounds=true`,
    token
  )
  const images = data.images || {}
  const results = new Map()

  // Download all image URLs (with concurrency limit to avoid browser limits)
  const BATCH_SIZE = 4
  const entries = Object.entries(images).filter(([, url]) => url)
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)
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
      pages.push({
        name: doc.name || 'Selection',
        id: doc.id || '',
        sections: extractSections(doc.children || []),
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
