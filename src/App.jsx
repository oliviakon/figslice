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
      <div className="mb-1.5 flex items-center gap-2.5">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-violet-500">
          <path d="M12 2c-.5 0-1 .1-1.2.3-.3.2-.5.5-.6.8L9 6c-.5 1.2-.2 2.5.5 3.5.2.3.1.6-.1.8L7.5 12c-.5.5-.7 1.2-.7 1.9 0 2.5 1.8 5.5 4.2 7.3.3.2.7.3 1 .3s.7-.1 1-.3c2.4-1.8 4.2-4.8 4.2-7.3 0-.7-.2-1.4-.7-1.9l-1.9-1.7c-.2-.2-.3-.5-.1-.8.7-1 1-2.3.5-3.5l-1.2-2.9c-.1-.3-.3-.6-.6-.8C13 2.1 12.5 2 12 2z" fill="currentColor" opacity="0.85"/>
          <path d="M12 2c0 0 .8-.2 1.5.8.4.5.5 1.2.3 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
        </svg>
        <h1 className="text-[22px] font-bold tracking-tight">figslice</h1>
      </div>
      <p className="mb-7 text-[13.5px] leading-relaxed text-zinc-500">
        Auto-slice Figma pages into flow screenshots. Runs entirely in your browser &mdash; nothing
        leaves your machine.
      </p>

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
