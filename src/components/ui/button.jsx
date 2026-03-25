import { cn } from '@/lib/utils'
import { cva } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30',
  {
    variants: {
      variant: {
        primary: 'bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800',
        outline:
          'border border-white/[0.08] bg-transparent text-zinc-300 hover:bg-white/[0.04] hover:border-white/[0.12]',
        ghost: 'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]',
        success: 'bg-emerald-600 text-white hover:bg-emerald-700',
        danger:
          'border border-white/[0.08] bg-transparent text-zinc-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20',
      },
      size: {
        default: 'px-4 py-2.5',
        sm: 'px-3 py-1.5 text-xs',
        lg: 'px-6 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
)

export function Button({ className, variant, size, children, ...props }) {
  return (
    <button className={cn(buttonVariants({ variant, size, className }))} {...props}>
      {children}
    </button>
  )
}
