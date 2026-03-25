import { useMutation } from '@tanstack/react-query'
import {
  parseFigmaUrl,
  fetchFigmaFile,
  renderFigmaNode,
  extractPages,
  groupIntoFlows,
  sanitize,
} from '@/figma'

/**
 * TanStack mutation for fetching Figma file structure.
 * Handles loading/error states automatically.
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

      onProgress?.(`Rendering ${sectionIds.size} section(s)...`)

      // Group by section for batch rendering
      const bySection = {}
      for (const f of selectedFrames) {
        ;(bySection[f.sectionId] ??= []).push(f)
      }
      const sectionMap = new Map(sectionsToRender.map((s) => [s.id, s]))

      const images = []
      let flowNum = 0

      for (const [sid, flows] of Object.entries(bySection)) {
        const sec = sectionMap.get(sid)
        if (!sec?.bounds) continue
        let sb = { ...sec.bounds }

        onProgress?.(`Rendering "${sec.name}"...`)
        const imgBlob = await renderFigmaNode(fileKey, token, sid, 2)
        const img = await createImageBitmap(imgBlob)
        const imgW = img.width, imgH = img.height

        let scaleX = imgW / sb.w, scaleY = imgH / sb.h

        // Handle render size mismatch
        if (Math.abs(scaleX - 2.0) > 0.1 || Math.abs(scaleY - 2.0) > 0.1) {
          const allX = flows.map((f) => f.x).concat(sb.x)
          const allY = flows.map((f) => f.y).concat(sb.y)
          const allR = flows.map((f) => f.x + f.w).concat(sb.x + sb.w)
          const allB = flows.map((f) => f.y + f.h).concat(sb.y + sb.h)
          const estX = Math.min(...allX), estY = Math.min(...allY)
          const estW = Math.max(...allR) - estX, estH = Math.max(...allB) - estY
          if (Math.abs(imgW / estW - 2.0) < Math.abs(scaleX - 2.0)) {
            sb = { x: estX, y: estY, w: estW, h: estH }
            scaleX = imgW / estW
            scaleY = imgH / estH
          }
        }

        for (const flow of flows) {
          flowNum++
          onProgress?.(`Cropping "${flow.name}" (${flowNum}/${selectedFrames.length})...`)

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

          images.push({ filename, blob, dataUrl, section: flow.section || '', name: flow.name })
        }
        img.close()
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
