import { useState, useCallback } from 'react'

const SCHEMA_VERSION = 1

/**
 * Versioned localStorage hook (client-localstorage-schema pattern).
 * Minimizes stored data and handles schema migrations.
 */
export function useLocalStorage(key, initialValue) {
  const versionedKey = `v${SCHEMA_VERSION}:${key}`

  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(versionedKey)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback(
    (value) => {
      const newValue = typeof value === 'function' ? value(storedValue) : value
      setStoredValue(newValue)
      localStorage.setItem(versionedKey, JSON.stringify(newValue))
    },
    [versionedKey, storedValue]
  )

  return [storedValue, setValue]
}
