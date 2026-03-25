import { cn } from '@/lib/utils'

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm',
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
  return <h2 className="text-[15px] font-semibold tracking-tight text-zinc-100">{children}</h2>
}
