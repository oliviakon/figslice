import { useCallback } from 'react'
import JSZip from 'jszip'
import { sanitize } from '@/figma'

/**
 * Download helpers — extracted to keep components lean.
 */
export function useDownloads(toast) {
  const downloadSingle = useCallback(
    (images, idx) => {
      const img = images[idx]
      if (!img) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(img.blob)
      a.download = img.filename
      a.click()
      URL.revokeObjectURL(a.href)
      toast(`Downloaded ${img.filename}`)
    },
    [toast]
  )

  const downloadAllZip = useCallback(
    async (images, projectName) => {
      if (!images.length) return
      const zipName = projectName ? `${sanitize(projectName)}-captures.zip` : 'figma-captures.zip'
      toast('Creating ZIP...')
      const zip = new JSZip()
      for (const img of images) zip.file(img.filename, img.blob)
      const content = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(content)
      a.download = zipName
      a.click()
      URL.revokeObjectURL(a.href)
      toast(`Downloaded ${zipName}`)
    },
    [toast]
  )

  return { downloadSingle, downloadAllZip }
}
