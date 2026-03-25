import { useState, useEffect, useCallback } from 'react'
import { Scissors } from 'lucide-react'
import { useToast, Toast } from '@/components/ui/toast'
import { ThemeToggle } from '@/components/theme-toggle'
import { ConnectStep } from '@/components/connect-step'
import { ReviewStep } from '@/components/review-step'
import { ResultsStep } from '@/components/results-step'
import { ManualDrop } from '@/components/manual-drop'
import { useFetchStructure, useRenderSlice, buildSectionsWithFlows } from '@/hooks/use-figma'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { useDownloads } from '@/hooks/use-downloads'

function Sidebar() {
  return (
    <aside className="sticky top-8 self-start">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/15">
            <Scissors size={16} className="text-violet-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-themed-fg">figslice</h1>
        </div>
        <ThemeToggle />
      </div>

      <p className="mb-6 text-[13px] leading-relaxed text-themed-muted">
        Turn Figma pages into flow screenshots. One cropped screenshot per flow &mdash; ready to share or feed to Claude.
      </p>

      <nav className="space-y-3">
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-themed-muted uppercase">How it works</p>
          <div className="space-y-2 text-[12px] leading-relaxed text-themed-muted">
            <div className="flex gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-violet-600/15 text-[9px] font-bold text-violet-400">1</span>
              <span><strong className="text-themed-fg-secondary">Paste URL</strong> &mdash; page or section</span>
            </div>
            <div className="flex gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-violet-600/15 text-[9px] font-bold text-violet-400">2</span>
              <span><strong className="text-themed-fg-secondary">Review flows</strong> &mdash; check what you need</span>
            </div>
            <div className="flex gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-violet-600/15 text-[9px] font-bold text-violet-400">3</span>
              <span><strong className="text-themed-fg-secondary">Download</strong> &mdash; ZIP or individual PNGs</span>
            </div>
          </div>
        </div>

        <hr className="border-themed-border" />

        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-themed-muted uppercase">Figma tips</p>
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-themed-muted">
            <li>Use <strong className="text-themed-fg-secondary">Sections</strong> to group flows</li>
            <li>Leftmost frame = <strong className="text-themed-fg-secondary">title card</strong> (flow divider)</li>
            <li>Screens go <strong className="text-themed-fg-secondary">left &rarr; right</strong></li>
            <li>Or use a <strong className="text-themed-fg-secondary">node-id</strong> URL for one frame</li>
          </ul>
        </div>
      </nav>

      <p className="mt-6 text-[10.5px] text-themed-muted/60">
        Runs in-browser. Token never leaves your machine.
      </p>
    </aside>
  )
}

export default function App() {
  const [project, setProject] = useState('')
  const [url, setUrl] = useState('')
  const [token, setToken] = useLocalStorage('figma-token', '')
  const [projects, setProjects] = useLocalStorage('figma-projects', [])

  const [step, setStep] = useState(1)
  const [allPages, setAllPages] = useState([])
  const [selectedPage, setSelectedPage] = useState(0)
  const [checkedFlows, setCheckedFlows] = useState({})
  const [renderStatus, setRenderStatus] = useState('')
  const [capturedImages, setCapturedImages] = useState([])
  const [session, setSession] = useState({ fileKey: '', token: '' })

  const fetchMutation = useFetchStructure()
  const renderMutation = useRenderSlice()

  const toast = useToast()
  const { downloadSingle, downloadAllZip } = useDownloads(toast.show)

  const page = allPages[selectedPage]
  const sectionsWithFlows = buildSectionsWithFlows(page)

  const recentProjects = [...projects].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 8)

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

  const handleFetch = useCallback(() => {
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

  const handleRender = useCallback(() => {
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
    <div className="relative z-10 flex min-h-screen">
      {/* Left sidebar — flush to the edge */}
      <div className="hidden w-[280px] shrink-0 border-r border-themed-border px-6 py-8 lg:block">
        <Sidebar />
      </div>

      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between border-b border-themed-border bg-themed-bg/90 px-5 py-3 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/15">
            <Scissors size={16} className="text-violet-400" />
          </div>
          <span className="text-lg font-bold tracking-tight text-themed-fg">figslice</span>
        </div>
        <ThemeToggle />
      </div>

      {/* Right: centred steps */}
      <main className="flex-1 px-5 pt-20 pb-8 lg:px-0 lg:pt-8">
        <div className="mx-auto max-w-[680px] space-y-4 lg:px-8">
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

          {step >= 3 && (
            <ResultsStep
              images={capturedImages}
              onDownloadSingle={(idx) => downloadSingle(capturedImages, idx)}
              onDownloadZip={() => downloadAllZip(capturedImages, project)}
            />
          )}

          <ManualDrop toast={toast.show} />
        </div>
      </main>

      <Toast message={toast.msg} />
    </div>
  )
}
