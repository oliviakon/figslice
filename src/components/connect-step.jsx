import { useState } from 'react'
import { Lock, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StepBadge } from '@/components/ui/badge'

function TokenGuide() {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-violet-400 transition-colors hover:text-violet-300"
      >
        How do I get a token?
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <ol className="mt-2.5 space-y-2 rounded-lg border border-themed-border bg-themed-subtle px-4 py-3 text-[12.5px] leading-relaxed text-themed-muted">
          <li>
            <span className="mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-violet-600/20 text-[10px] font-bold text-violet-400">1</span>
            Open Figma and tap your <strong className="text-themed-fg-secondary">profile picture</strong> (top-left corner)
          </li>
          <li>
            <span className="mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-violet-600/20 text-[10px] font-bold text-violet-400">2</span>
            Go to <strong className="text-themed-fg-secondary">Settings</strong>
          </li>
          <li>
            <span className="mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-violet-600/20 text-[10px] font-bold text-violet-400">3</span>
            Click the <strong className="text-themed-fg-secondary">Security</strong> tab
          </li>
          <li>
            <span className="mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-violet-600/20 text-[10px] font-bold text-violet-400">4</span>
            Scroll to <strong className="text-themed-fg-secondary">Personal access tokens</strong> and hit <strong className="text-themed-fg-secondary">Generate new token</strong>
          </li>
          <li>
            <span className="mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-violet-600/20 text-[10px] font-bold text-violet-400">5</span>
            Set expiry to whatever you like, and under scopes select <strong className="text-themed-fg-secondary">All</strong> (or at minimum File content: Read)
          </li>
          <li>
            <span className="mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-violet-600/20 text-[10px] font-bold text-violet-400">6</span>
            Copy the token <strong className="text-themed-fg-secondary">immediately</strong> &mdash; you won&apos;t see it again! Paste it below.
          </li>
        </ol>
      )}
    </div>
  )
}

export function ConnectStep({
  project,
  onProjectChange,
  url,
  onUrlChange,
  token,
  onTokenChange,
  onFetch,
  fetching,
  error,
  recentProjects,
}) {
  return (
    <Card>
      <CardHeader>
        <StepBadge step={1} />
        <CardTitle>Connect to Figma</CardTitle>
      </CardHeader>

      <label className="mb-1.5 block text-[13px] font-medium text-themed-muted">
        Project name <span className="font-normal opacity-60">(used for ZIP filename)</span>
      </label>
      <Input
        type="text"
        value={project}
        onChange={(e) => onProjectChange(e.target.value)}
        placeholder="e.g. reimagine-packs, pack-management"
      />

      {recentProjects.length > 0 && (
        <div className="-mt-1 mb-3 flex flex-wrap gap-1.5">
          {recentProjects.map((p) => (
            <button
              key={p.name}
              onClick={() => onProjectChange(p.name)}
              className="cursor-pointer rounded-full border border-themed-border px-3 py-1 text-xs text-themed-muted transition-all hover:border-themed-border-strong hover:text-themed-fg-secondary"
            >
              {p.name}
              <span className="ml-1 opacity-60">{p.count}</span>
            </button>
          ))}
        </div>
      )}

      <label className="mb-1.5 block text-[13px] font-medium text-themed-muted">
        Figma URL or file key
      </label>
      <Input
        type="text"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="https://figma.com/design/abc123/My-File?node-id=..."
      />

      <label className="mb-1.5 block text-[13px] font-medium text-themed-muted">
        Personal access token
      </label>
      <Input
        type="password"
        value={token}
        onChange={(e) => onTokenChange(e.target.value)}
        placeholder="figd_..."
      />

      <TokenGuide />

      <div className="flex items-start gap-2 rounded-lg border border-themed-border bg-themed-subtle px-3.5 py-2.5 text-[11.5px] text-themed-muted">
        <Lock size={13} className="mt-px shrink-0" />
        Your token is stored in your browser only and sent directly to Figma&apos;s API. No server
        involved.
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={onFetch} disabled={fetching}>
          {fetching ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
              Fetching...
            </>
          ) : (
            'Fetch Structure'
          )}
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </Card>
  )
}
