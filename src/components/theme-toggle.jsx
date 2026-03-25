import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-themed-border bg-themed-subtle text-themed-muted transition-all hover:text-themed-fg"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  )
}
