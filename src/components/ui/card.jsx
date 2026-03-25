import { cn } from '@/lib/utils'

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-themed-border bg-themed-surface p-6 backdrop-blur-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children }) {
  return (
    <div className={cn('mb-5 flex items-center gap-3', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children }) {
  return <h2 className="text-[15px] font-semibold tracking-tight text-themed-fg">{children}</h2>
}
