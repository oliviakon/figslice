import { useMemo } from 'react'
import { Check, Download } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StepBadge } from '@/components/ui/badge'

function ResultCard({ image, idx, onDownload }) {
  return (
    <div className="overflow-hidden rounded-xl border border-themed-border transition-colors hover:border-themed-border-strong">
      <div className="flex items-center justify-between gap-3 border-b border-themed-border px-4 py-3">
        <span className="text-sm font-semibold text-violet-400">{image.name}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-themed-muted">{image.filename}</span>
          <Button variant="ghost" size="sm" onClick={() => onDownload(idx)}>
            <Download size={13} />
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto bg-themed-subtle p-3">
        <img src={image.dataUrl} alt={image.name} className="block w-full rounded" loading="lazy" />
      </div>
    </div>
  )
}

export function ResultsStep({ images, onDownloadSingle, onDownloadZip }) {
  const resultsBySection = useMemo(() => {
    const groups = {}
    images.forEach((f, i) => {
      const sec = f.section || 'Flows'
      ;(groups[sec] ??= []).push({ ...f, idx: i })
    })
    return groups
  }, [images])

  return (
    <Card className="animate-in">
      <CardHeader>
        <StepBadge step={3} variant="success" />
        <CardTitle>Done</CardTitle>
      </CardHeader>

      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.04] px-4 py-3.5">
        <Check size={16} className="mt-0.5 shrink-0 text-emerald-400" />
        <div className="text-[13px] leading-relaxed text-themed-fg-secondary">
          <p>
            <strong className="text-themed-fg">{images.length}</strong> flow screenshots ready.
          </p>
          <p className="mt-0.5">Download individually or grab them all as a ZIP.</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Button onClick={onDownloadZip}>
          <Download size={14} />
          Download All as ZIP
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Slice another file
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {Object.entries(resultsBySection).map(([sec, files]) => (
          <div key={sec}>
            <h3 className="mb-3 border-b border-themed-border pb-2 text-[15px] font-semibold text-themed-fg">
              {sec}
            </h3>
            <div className="flex flex-col gap-4">
              {files.map((f) => (
                <ResultCard key={f.idx} image={f} idx={f.idx} onDownload={onDownloadSingle} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
