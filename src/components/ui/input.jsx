import { cn } from '@/lib/utils'

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-white/[0.08] bg-black/40 px-3.5 py-2.5',
        'text-sm text-zinc-100 placeholder:text-zinc-600',
        'outline-none transition-all duration-150',
        'focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10',
        className
      )}
      {...props}
    />
  )
}
