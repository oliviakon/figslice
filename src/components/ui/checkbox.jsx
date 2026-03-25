import { cn } from '@/lib/utils'

export function Checkbox({ className, ...props }) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 cursor-pointer rounded accent-violet-600',
        className
      )}
      {...props}
    />
  )
}
