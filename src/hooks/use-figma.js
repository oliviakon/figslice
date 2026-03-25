import { useMutation } from '@tanstack/react-query'
import {
  parseFigmaUrl,
  fetchFigmaFile,
  renderFigmaNode,
  renderFigmaNodes,
  extractPages,
  groupIntoFlows,
  sanitize,
} from '@/figma'

/**
 * TanStack mutation for fetching Figma file structure.
 */
export function useFetchStructure() {
  return useMutation({
    mutationFn: async ({ url, token }) => {
      const { fileKey, nodeId } = parseFigmaUrl(url)
      const data = await fetchFigmaFile(fileKey, token, nodeId)
      const pages = extractPages(data, nodeId)
      if (!pages.length) throw new Error('No frames found in this file')
      return { pages, fileKey, nodeId }
    },
  })
}

// ── Helpers ──

/**
 * Crop flows from a rendered section image.
 * This is the core logic shared by both the full-section and split-section paths.
 * Returns array of { filename, blob, dataUrl, section, name }.
 */
async function cropFlowsFromRender(img, sectionBounds, flows, flowNumStart, totalFlows, onProgress) {
  const imgW = img.width, imgH = img.height
  let sb = { ...sectionBounds }
  let scaleX = imgW / sb.w, scaleY = imgH / sb.h

  // Handle render size mismatch — the rendered image may not match expected scale
  const expectedScale = Math.max(scaleX, scaleY)
  if (Math.abs(scaleX - expectedScale) > 0.1 || Math.abs(scaleY - expectedScale) > 0.1) {
    const allX = flows.map((f) => f.x).concat(sb.x)
    const allY = flows.map((f) => f.y).concat(sb.y)
    const allR = flows.map((f) => f.x + f.w).concat(sb.x + sb.w)
    const allB = flows.map((f) => f.y + f.h).concat(sb.y + sb.h)
    const estX = Math.min(...allX), estY = Math.min(...allY)
    const estW = Math.max(...allR) - estX, estH = Math.max(...allB) - estY
    if (Math.abs(imgW / estW - expectedScale) < Math.abs(scaleX - expectedScale)) {
      sb = { x: estX, y: estY, w: estW, h: estH }
      scaleX = imgW / estW
      scaleY = imgH / estH
    }
  }

  const results = []
  let flowNum = flowNumStart

  for (const flow of flows) {
    flowNum++
    onProgress?.(`Cropping "${flow.name}" (${flowNum}/${totalFlows})...`)

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
    canvas.getContext('2d').drawImage(img, px, py, pw, ph, 0, 0, pw, ph)

    const [blob, dataUrl] = await Promise.all([
      new Promise((resolve) => canvas.toBlob(resolve, 'image/png')),
      Promise.resolve(canvas.toDataURL('image/png')),
    ])

    const secSlug = sanitize(flow.section || '')
    const nameSlug = sanitize(flow.name)
    const num = String(flowNum).padStart(2, '0')
    const filename = secSlug ? `${num}-${secSlug}--${nameSlug}.png` : `${num}-${nameSlug}.png`

    results.push({ filename, blob, dataUrl, section: flow.section || '', name: flow.name })
  }

  return { results, flowNum }
}

/**
 * Threshold for splitting: if a section's area (in Figma units) exceeds this,
 * split into smaller render chunks. ~8000x4000 at 2x = 64M pixels, which is
 * around where Figma starts timing out.
 */
const MAX_SECTION_AREA = 25_000_000 // Figma units squared

/**
 * Split flows into groups that can be rendered without timing out.
 * Groups flows by proximity (Y position) so each chunk covers a
 * contiguous vertical band of the section.
 */
function splitFlowsIntoChunks(flows, sectionBounds, maxArea) {
  if (flows.length <= 1) return [flows]

  // Sort by Y position so chunks are contiguous vertical bands
  const sorted = [...flows].sort((a, b) => a.y - b.y)

  const chunks = []
  let currentChunk = []
  let chunkMinX = Infinity, chunkMinY = Infinity, chunkMaxX = -Infinity, chunkMaxY = -Infinity

  for (const flow of sorted) {
    // Calculate what the bounds would be if we add this flow
    const newMinX = Math.min(chunkMinX, flow.x)
    const newMinY = Math.min(chunkMinY, flow.y)
    const newMaxX = Math.max(chunkMaxX, flow.x + flow.w)
    const newMaxY = Math.max(chunkMaxY, flow.y + flow.h)
    const newArea = (newMaxX - newMinX) * (newMaxY - newMinY)

    if (currentChunk.length > 0 && newArea > maxArea) {
      // Adding this flow would make the chunk too large — start a new one
      chunks.push(currentChunk)
      currentChunk = [flow]
      chunkMinX = flow.x
      chunkMinY = flow.y
      chunkMaxX = flow.x + flow.w
      chunkMaxY = flow.y + flow.h
    } else {
      currentChunk.push(flow)
      chunkMinX = newMinX
      chunkMinY = newMinY
      chunkMaxX = newMaxX
      chunkMaxY = newMaxY
    }
  }

  if (currentChunk.length > 0) chunks.push(currentChunk)
  return chunks
}

/**
 * TanStack mutation for rendering and slicing flows.
 * Reports progress via onProgress callback.
 */
export function useRenderSlice() {
  return useMutation({
    mutationFn: async ({ fileKey, token, sectionsWithFlows, checkedFlows, onProgress }) => {
      const PAD_TOP = 80, PAD_BOTTOM = 120, PAD_LEFT = 20, PAD_RIGHT = 40

      // Build selected frames
      const selectedFrames = []
      const sectionIds = new Set()
      let flowIdx = 0

      for (const sec of sectionsWithFlows) {
        for (const flow of sec.flows) {
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
              x: minX, y: minY, w: maxX - minX, h: maxY - minY,
              name: flow.title, section: sec.name, sectionId: sec.id,
            })
            if (sec.id) sectionIds.add(sec.id)
          }
          flowIdx++
        }
      }

      if (!selectedFrames.length) throw new Error('Select at least one flow')

      const sectionsToRender = sectionsWithFlows
        .filter((s) => sectionIds.has(s.id))
        .map((s) => ({ id: s.id, name: s.name, bounds: s.bounds }))

      const bySection = {}
      const looseFlows = []
      for (const f of selectedFrames) {
        if (f.sectionId) {
          ;(bySection[f.sectionId] ??= []).push(f)
        } else {
          looseFlows.push(f)
        }
      }

      const sectionMap = new Map(sectionsToRender.map((s) => [s.id, s]))
      const totalFlows = selectedFrames.length
      const images = []
      let flowNum = 0

      // ── Phase 1: Kick off all section renders in parallel ──
      // Figma's Image API returns a URL to the rendered image — the actual
      // rendering happens on their servers. By requesting all sections at once
      // (up to a concurrency limit), Figma renders them in parallel on their end.
      const RENDER_CONCURRENCY = 3
      const sectionEntries = Object.entries(bySection)
        .map(([sid, flows]) => ({ sid, flows, sec: sectionMap.get(sid) }))
        .filter(({ sec }) => sec?.bounds)

      // Request all section renders concurrently (just the API call, not the download)
      const renderPromises = []
      for (let i = 0; i < sectionEntries.length; i += RENDER_CONCURRENCY) {
        const batch = sectionEntries.slice(i, i + RENDER_CONCURRENCY)
        const batchResults = await Promise.all(
          batch.map(async ({ sid, sec }) => {
            onProgress?.(`Requesting render for "${sec.name}"...`)
            try {
              const result = await renderFigmaNode(fileKey, token, sid, 2, sec.bounds)
              return { sid, result, error: null }
            } catch (e) {
              return { sid, result: null, error: e }
            }
          })
        )
        renderPromises.push(...batchResults)
      }

      // ── Phase 2: Crop flows from the rendered images ──
      for (const entry of sectionEntries) {
        const { sid, flows, sec } = entry
        const sb = sec.bounds
        const renderResult = renderPromises.find((r) => r.sid === sid)

        if (renderResult?.result) {
          // Section rendered successfully — crop flows from it
          onProgress?.(`Cropping flows from "${sec.name}"...`)
          const img = await createImageBitmap(renderResult.result.blob)
          const { results, flowNum: newFlowNum } = await cropFlowsFromRender(
            img, sb, flows, flowNum, totalFlows, onProgress
          )
          images.push(...results)
          flowNum = newFlowNum
          img.close()
        } else {
          // Section render failed — fall back to per-frame rendering
          onProgress?.(`Section "${sec.name}" render failed, rendering frames individually...`)
          for (const flow of flows) {
            flowNum++
            onProgress?.(`Rendering "${flow.name}" (${flowNum}/${totalFlows})...`)

            const origSection = sectionsWithFlows.find((s) => s.id === sid)
            const origFlows = origSection?.flows || []
            const origFlow = origFlows.find((f) => f.title === flow.name)
            const frameIds = origFlow ? origFlow.frames.map((f) => f.id) : []
            if (frameIds.length === 0) continue

            const blobMap = await renderFigmaNodes(fileKey, token, frameIds, 2)
            const frameBitmaps = []
            for (const fid of frameIds) {
              const b = blobMap.get(fid)
              if (b) frameBitmaps.push(await createImageBitmap(b))
            }
            if (frameBitmaps.length === 0) continue

            const GAP = 16
            let totalW = 0, maxH = 0
            for (const bmp of frameBitmaps) {
              totalW += bmp.width
              if (bmp.height > maxH) maxH = bmp.height
            }
            totalW += GAP * (frameBitmaps.length - 1)

            const canvas = document.createElement('canvas')
            canvas.width = totalW
            canvas.height = maxH
            const ctx = canvas.getContext('2d')
            let xOffset = 0
            for (const bmp of frameBitmaps) {
              ctx.drawImage(bmp, xOffset, 0)
              xOffset += bmp.width + GAP
              bmp.close()
            }

            const [blob, dataUrl] = await Promise.all([
              new Promise((resolve) => canvas.toBlob(resolve, 'image/png')),
              Promise.resolve(canvas.toDataURL('image/png')),
            ])

            const secSlug = sanitize(flow.section || '')
            const nameSlug = sanitize(flow.name)
            const num = String(flowNum).padStart(2, '0')
            const filename = secSlug ? `${num}-${secSlug}--${nameSlug}.png` : `${num}-${nameSlug}.png`
            images.push({ filename, blob, dataUrl, section: flow.section || '', name: flow.name })
          }
        }
      }

      // ── Render loose flows (no parent section) ──
      if (looseFlows.length > 0) {
        const flowFrameIds = []
        for (const flow of looseFlows) {
          const origSection = sectionsWithFlows.find((s) => s.name === flow.section)
          const origFlows = origSection?.flows || []
          const origFlow = origFlows.find((f) => f.title === flow.name)
          const frameIds = origFlow ? origFlow.frames.map((f) => f.id) : []
          flowFrameIds.push({ flow, frameIds })
        }

        const allIds = flowFrameIds.flatMap((f) => f.frameIds)
        if (allIds.length > 0) {
          onProgress?.(`Rendering ${allIds.length} frames...`)
          const blobMap = await renderFigmaNodes(fileKey, token, allIds, 2)

          for (const { flow, frameIds } of flowFrameIds) {
            if (frameIds.length === 0) continue
            flowNum++
            onProgress?.(`Stitching "${flow.name}" (${flowNum}/${totalFlows})...`)

            const frameBitmaps = []
            for (const fid of frameIds) {
              const blob = blobMap.get(fid)
              if (blob) frameBitmaps.push(await createImageBitmap(blob))
            }
            if (frameBitmaps.length === 0) continue

            const GAP = 16
            let totalW = 0, maxH = 0
            for (const bmp of frameBitmaps) {
              totalW += bmp.width
              if (bmp.height > maxH) maxH = bmp.height
            }
            totalW += GAP * (frameBitmaps.length - 1)

            const canvas = document.createElement('canvas')
            canvas.width = totalW
            canvas.height = maxH
            const ctx = canvas.getContext('2d')
            let xOffset = 0
            for (const bmp of frameBitmaps) {
              ctx.drawImage(bmp, xOffset, 0)
              xOffset += bmp.width + GAP
              bmp.close()
            }

            const [blob, dataUrl] = await Promise.all([
              new Promise((resolve) => canvas.toBlob(resolve, 'image/png')),
              Promise.resolve(canvas.toDataURL('image/png')),
            ])

            const nameSlug = sanitize(flow.name)
            const num = String(flowNum).padStart(2, '0')
            const filename = `${num}-${nameSlug}.png`
            images.push({ filename, blob, dataUrl, section: flow.section || '', name: flow.name })
          }
        }
      }

      return images
    },
  })
}

/**
 * Build sections with their computed flows for a given page.
 */
export function buildSectionsWithFlows(page) {
  if (!page) return []
  return page.sections.map((sec) => ({
    ...sec,
    flows: groupIntoFlows(sec.frames),
  }))
}
