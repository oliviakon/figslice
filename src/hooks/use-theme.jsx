import { createContext, use, useCallback, useEffect } from 'react'
import { useLocalStorage } from './use-local-storage'

const ThemeContext = createContext({ theme: 'dark', toggle: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('figslice-theme', 'dark')

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [setTheme])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ThemeContext value={{ theme, toggle }}>
      {children}
    </ThemeContext>
  )
}

export function useTheme() {
  return use(ThemeContext)
}
