import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { StepBadge } from '@/components/ui/badge'

function FlowItem({ title, screenCount, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 border-b border-themed-border py-2 pl-5 text-[13.5px] text-themed-fg-secondary transition-colors last:border-b-0 hover:bg-themed-surface-hover">
      <Checkbox checked={checked} onChange={onChange} />
      <span className="flex-1">{title}</span>
      <span className="mr-1 text-xs text-themed-muted">
        {screenCount} screen{screenCount !== 1 ? 's' : ''} &rarr; 1 screenshot
      </span>
    </label>
  )
}

function SectionGroup({ section, flowStartIdx, checkedFlows, onToggleFlow, onToggleSection }) {
  const { name, flows } = section
  const indices = flows.map((_, i) => flowStartIdx + i)
  const allChecked = indices.every((i) => checkedFlows[i])

  return (
    <div>
      <div className="mt-5 flex items-center gap-2.5 border-b border-themed-border pb-2 text-sm font-semibold text-themed-fg first:mt-1">
        <Checkbox
          checked={allChecked}
          onChange={(e) => onToggleSection(indices, e.target.checked)}
        />
        {name}
        <span className="text-xs font-normal text-themed-muted">
          {flows.length} flow{flows.length !== 1 ? 's' : ''}
        </span>
      </div>
      {flows.map((flow, i) => {
        const idx = flowStartIdx + i
        return (
          <FlowItem
            key={idx}
            title={flow.title}
            screenCount={flow.frames.length - 1}
            checked={!!checkedFlows[idx]}
            onChange={() => onToggleFlow(idx)}
          />
        )
      })}
    </div>
  )
}

export function ReviewStep({
  pages,
  selectedPage,
  onSelectPage,
  sectionsWithFlows,
  checkedFlows,
  onToggleFlow,
  onToggleSection,
  onRender,
  rendering,
  renderStatus,
  error,
}) {
  let flowIdx = 0

  return (
    <Card className="animate-in">
      <CardHeader>
        <StepBadge step={2} />
        <CardTitle>Review Detected Flows</CardTitle>
      </CardHeader>

      <p className="mb-4 text-[13px] leading-relaxed text-themed-muted">
        Flows grouped by Figma sections. Each checked flow will be rendered as{' '}
        <strong className="text-themed-fg-secondary">one screenshot</strong>.
      </p>

      {pages.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {pages.map((p, i) => (
            <button
              key={i}
              onClick={() => onSelectPage(i)}
              className={`cursor-pointer rounded-lg border px-3.5 py-1.5 text-[13px] transition-all ${
                i === selectedPage
                  ? 'border-violet-600 bg-violet-600 text-white'
                  : 'border-themed-border text-themed-muted hover:bg-themed-surface-hover'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {sectionsWithFlows.map((sec, si) => {
        const startIdx = flowIdx
        flowIdx += sec.flows.length
        return (
          <SectionGroup
            key={si}
            section={sec}
            flowStartIdx={startIdx}
            checkedFlows={checkedFlows}
            onToggleFlow={onToggleFlow}
            onToggleSection={onToggleSection}
          />
        )
      })}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={onRender} disabled={rendering}>
          {rendering ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-transparent" />
              Rendering...
            </>
          ) : (
            'Render & Slice'
          )}
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Start over
        </Button>
      </div>

      {renderStatus && (
        <p className="mt-3 text-[13px] text-themed-muted">
          <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent align-middle" />
          {renderStatus}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </Card>
  )
}
