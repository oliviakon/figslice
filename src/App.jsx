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
    <aside className="lg:sticky lg:top-8 lg:self-start">
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/15">
              <Scissors size={20} className="text-violet-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-themed-fg">figslice</h1>
          </div>
          <ThemeToggle />
        </div>
        <p className="text-[14.5px] leading-relaxed text-themed-fg-secondary">
          Turn Figma pages into flow screenshots. Point it at a section and get one cropped
          screenshot per flow &mdash; ready to share, paste into docs, or feed to Claude.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-themed-border bg-themed-surface px-5 py-4">
          <p className="mb-3 text-[13px] font-semibold text-themed-fg">How it works</p>
          <div className="space-y-3 text-[13px] leading-relaxed text-themed-muted">
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-600/15 text-[11px] font-bold text-violet-400">1</span>
              <span><strong className="text-themed-fg-secondary">Paste a Figma URL</strong> &mdash; link to a page or a specific section/frame</span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-600/15 text-[11px] font-bold text-violet-400">2</span>
              <span><strong className="text-themed-fg-secondary">Review detected flows</strong> &mdash; frames are grouped by title cards on the left. Check what you need</span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-600/15 text-[11px] font-bold text-violet-400">3</span>
              <span><strong className="text-themed-fg-secondary">Render &amp; download</strong> &mdash; each flow becomes one screenshot. Download individually or as a ZIP</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-themed-border bg-themed-surface px-5 py-4">
          <p className="mb-3 text-[13px] font-semibold text-themed-fg">Figma structure tips</p>
          <ul className="space-y-2 text-[13px] leading-relaxed text-themed-muted">
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500/50" />
              Use <strong className="text-themed-fg-secondary">Sections</strong> in Figma to group related flows &mdash; each renders as one batch
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500/50" />
              Put a <strong className="text-themed-fg-secondary">title card</strong> as the leftmost frame in each row &mdash; used to split flows
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500/50" />
              Lay screens <strong className="text-themed-fg-secondary">left to right</strong> next to each title card
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500/50" />
              Or select a specific <strong className="text-themed-fg-secondary">node-id</strong> in the URL to capture one frame
            </li>
          </ul>
        </div>

        <p className="text-[11.5px] text-themed-muted">
          Runs entirely in your browser. Your Figma token never touches a server.
        </p>
      </div>
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
    <div className="relative z-10 mx-auto max-w-[1280px] px-5 py-8 lg:px-8">
      <div className="lg:grid lg:grid-cols-[380px_1fr] lg:gap-10">
        {/* Left: brand, how-it-works, tips */}
        <Sidebar />

        {/* Right: steps */}
        <main className="mt-8 space-y-4 lg:mt-0">
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
        </main>
      </div>

      <Toast message={toast.msg} />
    </div>
  )
}
