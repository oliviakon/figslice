import { useState, useEffect, useCallback } from 'react'
import { useToast, Toast } from '@/components/ui/toast'
import { ConnectStep } from '@/components/connect-step'
import { ReviewStep } from '@/components/review-step'
import { ResultsStep } from '@/components/results-step'
import { ManualDrop } from '@/components/manual-drop'
import { useFetchStructure, useRenderSlice, buildSectionsWithFlows } from '@/hooks/use-figma'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { useDownloads } from '@/hooks/use-downloads'

export default function App() {
  // ── Form state ──
  const [project, setProject] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useLocalStorage('figma-token', '')
  const [projects, setProjects] = useLocalStorage('figma-projects', [])

  // ── Flow state ──
  const [step, setStep] = useState(1)
  const [allPages, setAllPages] = useState([])
  const [selectedPage, setSelectedPage] = useState(0)
  const [checkedFlows, setCheckedFlows] = useState({})
  const [renderStatus, setRenderStatus] = useState('')
  const [capturedImages, setCapturedImages] = useState([])
  const [session, setSession] = useState({ fileKey: '', token: '' })

  // ── TanStack mutations ──
  const fetchMutation = useFetchStructure()
  const renderMutation = useRenderSlice()

  // ── Toast & downloads ──
  const toast = useToast()
  const { downloadSingle, downloadAllZip } = useDownloads(toast.show)

  // Derived: sections with flows for current page
  const page = allPages[selectedPage]
  const sectionsWithFlows = buildSectionsWithFlows(page)

  // Recent projects sorted by last used
  const recentProjects = [...projects].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 8)

  // Initialize checkboxes when pages change
  useEffect(() => {
    if (!allPages.length) return
    const p = allPages[selectedPage]
    if (!p) return
    const checked = {}
    let idx = 0
    for (const sec of p.sections) {
      const flows = buildSectionsWithFlows({ sections: [sec] })?.[0]?.flows || []
      for (let i = 0; i < flows.length; i++) {
        checked[idx++] = true
      }
    }
    setCheckedFlows(checked)
  }, [allPages, selectedPage])

  // ── Handlers ──
  const handleFetch = useCallback(async () => {
    fetchMutation.mutate(
      { url, token },
      {
        onSuccess: ({ pages, fileKey }) => {
          setAllPages(pages)
          setSelectedPage(0)
          setSession({ fileKey, token })
          setStep(2)
        },
      }
    )
  }, [url, token, fetchMutation])

  const handleRender = useCallback(async () => {
    renderMutation.mutate(
      {
        fileKey: session.fileKey,
        token: session.token,
        sectionsWithFlows,
        checkedFlows,
        onProgress: setRenderStatus,
      },
      {
        onSuccess: (images) => {
          if (project) {
            setProjects((prev) => {
              const existing = prev.find((p) => p.name === project)
              if (existing) {
                return prev.map((p) =>
                  p.name === project ? { ...p, count: p.count + 1, lastUsed: Date.now() } : p
                )
              }
              return [...prev, { name: project, count: 1, lastUsed: Date.now() }]
            })
          }
          setCapturedImages(images)
          setRenderStatus('')
          setStep(3)
        },
        onError: () => setRenderStatus(''),
      }
    )
  }, [session, sectionsWithFlows, checkedFlows, project, renderMutation, setProjects])

  const toggleFlow = useCallback((idx) => {
    setCheckedFlows((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }, [])

  const toggleSection = useCallback((indices, checked) => {
    setCheckedFlows((prev) => {
      const next = { ...prev }
      for (const i of indices) next[i] = checked
      return next
    })
  }, [])

  return (
    <div className="relative z-10 mx-auto max-w-[1100px] px-5 py-8">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-violet-500">
          <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <line x1="9" y1="4" x2="9" y2="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
          <line x1="15" y1="4" x2="15" y2="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
          <rect x="3.5" y="6" width="4" height="5" rx="0.5" fill="currentColor" opacity="0.25" />
          <rect x="10.5" y="6" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.25" />
          <rect x="16.5" y="6" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.25" />
        </svg>
        <h1 className="text-3xl font-bold tracking-tight">figslice</h1>
      </div>

      <div className="mb-8 max-w-2xl space-y-3">
        <p className="text-[14px] leading-relaxed text-zinc-400">
          Turn Figma pages into flow screenshots automatically. Point it at a Figma section and get
          one cropped screenshot per flow &mdash; ready to share, paste into docs, or feed to Claude.
        </p>

        <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-4 py-3">
          <p className="mb-2 text-[12.5px] font-medium text-zinc-300">How it works</p>
          <div className="grid gap-2 text-[12.5px] leading-relaxed text-zinc-500">
            <div className="flex gap-2.5">
              <span className="mt-px shrink-0 text-violet-500">1.</span>
              <span><strong className="text-zinc-400">Paste a Figma URL</strong> &mdash; link to a page or a specific section/frame</span>
            </div>
            <div className="flex gap-2.5">
              <span className="mt-px shrink-0 text-violet-500">2.</span>
              <span><strong className="text-zinc-400">Review detected flows</strong> &mdash; figslice groups frames into flows using title cards on the left as dividers. Check/uncheck what you need</span>
            </div>
            <div className="flex gap-2.5">
              <span className="mt-px shrink-0 text-violet-500">3.</span>
              <span><strong className="text-zinc-400">Render &amp; download</strong> &mdash; each flow becomes one screenshot. Download individually or as a ZIP</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] px-4 py-3">
          <p className="mb-2 text-[12.5px] font-medium text-zinc-300">Figma structure tips</p>
          <ul className="space-y-1 text-[12.5px] leading-relaxed text-zinc-500">
            <li className="flex gap-2"><span className="text-zinc-600">&bull;</span>Use <strong className="text-zinc-400">Sections</strong> in Figma to group related flows &mdash; each section renders as one batch</li>
            <li className="flex gap-2"><span className="text-zinc-600">&bull;</span>Put a <strong className="text-zinc-400">title card</strong> as the leftmost frame in each row &mdash; figslice uses these to split flows</li>
            <li className="flex gap-2"><span className="text-zinc-600">&bull;</span>Lay screens out <strong className="text-zinc-400">left to right</strong> next to each title card</li>
            <li className="flex gap-2"><span className="text-zinc-600">&bull;</span>Or just select a specific <strong className="text-zinc-400">node-id</strong> in the URL to capture one section</li>
          </ul>
        </div>

        <p className="text-[11.5px] text-zinc-600">
          Runs entirely in your browser. Your Figma token never touches a server.
        </p>
      </div>

      {/* Step 1 */}
      <ConnectStep
        project={project}
        onProjectChange={setProject}
        url={url}
        onUrlChange={setUrl}
        token={token}
        onTokenChange={setToken}
        onFetch={handleFetch}
        fetching={fetchMutation.isPending}
        error={fetchMutation.error?.message}
        recentProjects={recentProjects}
      />

      {/* Step 2 */}
      {step >= 2 && (
        <ReviewStep
          pages={allPages}
          selectedPage={selectedPage}
          onSelectPage={setSelectedPage}
          sectionsWithFlows={sectionsWithFlows}
          checkedFlows={checkedFlows}
          onToggleFlow={toggleFlow}
          onToggleSection={toggleSection}
          onRender={handleRender}
          rendering={renderMutation.isPending}
          renderStatus={renderStatus}
          error={renderMutation.error?.message}
        />
      )}

      {/* Step 3 */}
      {step >= 3 && (
        <ResultsStep
          images={capturedImages}
          onDownloadSingle={(idx) => downloadSingle(capturedImages, idx)}
          onDownloadZip={() => downloadAllZip(capturedImages, project)}
        />
      )}

      {/* Manual drop zone */}
      <ManualDrop toast={toast.show} />

      {/* Toast */}
      <Toast message={toast.msg} />
    </div>
  )
}
