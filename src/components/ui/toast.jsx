import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

export function useToast() {
  const [msg, setMsg] = useState('')
  const timer = useRef(null)
  const show = useCallback((text) => {
    setMsg(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(''), 2500)
  }, [])
  return { msg, show }
}

export function Toast({ message }) {
  return (
    <div
      className={cn(
        'fixed bottom-5 right-5 z-50 rounded-lg px-5 py-3',
        'bg-themed-fg text-themed-bg text-sm font-medium',
        'shadow-2xl',
        'transition-all duration-300',
        message ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
      )}
    >
      {message}
    </div>
  )
}
