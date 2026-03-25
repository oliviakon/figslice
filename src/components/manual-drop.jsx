import { useState, useEffect, useCallback, useRef } from 'react'
import JSZip from 'jszip'
import { Button } from '@/components/ui/button'

export function ManualDrop({ toast }) {
  const [images, setImages] = useState([])
  const [dragActive, setDragActive] = useState(false)
  const numRef = useRef(1)

  const handleFile = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      const filename = `manual-${String(numRef.current++).padStart(2, '0')}.png`
      fetch(dataUrl)
        .then((r) => r.blob())
        .then((blob) => {
          setImages((prev) => [...prev, { filename, blob, dataUrl }])
          toast(`Added: ${filename}`)
        })
    }
    reader.readAsDataURL(file)
  }, [toast])

  useEffect(() => {
    function onPaste(e) {
      if (document.activeElement.tagName === 'INPUT') return
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) handleFile(item.getAsFile())
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [handleFile])

  async function downloadZip() {
    if (!images.length) return
    const zip = new JSZip()
    for (const img of images) zip.file(img.filename, img.blob)
    const content = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(content)
    a.download = 'figma-captures-manual.zip'
    a.click()
    URL.revokeObjectURL(a.href)
    toast('Downloaded ZIP')
  }

  return (
    <div className="mt-8 border-t border-themed-border pt-7">
      <h3 className="mb-2.5 text-[13px] font-medium text-themed-muted">
        Or paste / drop individual screenshots
      </h3>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          for (const f of e.dataTransfer.files) {
            if (f.type.startsWith('image/')) handleFile(f)
          }
        }}
        className={`rounded-xl border border-dashed p-5 text-center transition-colors ${
          dragActive
            ? 'border-violet-500/40 bg-violet-500/[0.03]'
            : 'border-themed-border bg-themed-subtle'
        }`}
      >
        <p className="text-[13px] text-themed-muted">
          <kbd className="rounded border border-themed-border bg-themed-surface px-1.5 py-0.5 font-mono text-[11px] text-themed-fg-secondary">
            Cmd+Shift+Ctrl+4
          </kbd>{' '}
          to screenshot, then{' '}
          <kbd className="rounded border border-themed-border bg-themed-surface px-1.5 py-0.5 font-mono text-[11px] text-themed-fg-secondary">
            Cmd+V
          </kbd>{' '}
          here
        </p>
      </div>

      {images.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((img, i) => (
              <img
                key={i}
                src={img.dataUrl}
                alt={img.filename}
                className="h-20 rounded border border-themed-border"
              />
            ))}
          </div>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={downloadZip}>
              Download pasted images as ZIP
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
