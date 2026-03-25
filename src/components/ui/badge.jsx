import { cn } from '@/lib/utils'

export function StepBadge({ step, variant = 'default' }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold text-white',
        variant === 'success' ? 'bg-emerald-500' : 'bg-violet-600'
      )}
    >
      {step}
    </span>
  )
}
